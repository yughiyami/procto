import { queueAutomaticReply } from './auto-reply.js';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { TOOLS, TOOL_DEFINITIONS_FOR_MODEL } from './tools.js';
import { callModel, type ChatMessage } from './model-client.js';
import {
  systemPrompt,
  initialUserContent,
  finalSchemaFor,
  proposalKindFor,
  composeViolatesGuardrails,
  type AgentKind,
} from './prompts.js';

/**
 * THE BOUNDED LOOP. This is the only place in the codebase where a model is allowed to
 * drive control flow, and every limit below is enforced here in code — not merely asked
 * for in a prompt, per docs/agent-architecture.md.
 *
 * The loop never mutates an order. Its only write path is `agent_proposals` (plus its own
 * bookkeeping in agent_runs / agent_steps). A human approval endpoint elsewhere is what
 * actually calls into domain.ts.
 */

const AGENT_KINDS: readonly AgentKind[] = ['extract', 'validate', 'compose'];

interface RunRow {
  id: string;
  org_id: string;
  kind: string;
  status: string;
  order_id: string | null;
  conversation_id: string | null;
  inbox_id: string | null;
  input: unknown;
  max_steps: number;
}

async function persistStep(
  db: Pool,
  runId: string,
  idx: number,
  type: 'plan' | 'tool_call' | 'tool_result' | 'final' | 'error',
  name: string | null,
  input: unknown,
  output: unknown,
): Promise<void> {
  // Unique index on (run_id, idx): a crash after this insert but before the next model
  // call still leaves a fully readable, correctly ordered partial trail.
  await db.query(
    'INSERT INTO agent_steps(id,run_id,idx,type,name,input,output) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [randomUUID(), runId, idx, type, name, input === undefined ? null : JSON.stringify(input), output === undefined ? null : JSON.stringify(output)],
  );
}

async function finalizeRun(
  db: Pool,
  runId: string,
  status: 'succeeded' | 'failed' | 'budget_exhausted',
  error: string | null,
  stepsUsed: number,
  tokensUsed: number,
): Promise<void> {
  await db.query(
    'UPDATE agent_runs SET status=$1, error=$2, steps_used=$3, tokens_used=$4, finished_at=now() WHERE id=$5',
    [status, error, stepsUsed, tokensUsed, runId],
  );
}

async function loadExtractContext(db: Pool, orgId: string, inboxId: string): Promise<Record<string, unknown>> {
  const r = await db.query('SELECT payload FROM inbox WHERE id=$1 AND org_id=$2', [inboxId, orgId]);
  if (!r.rowCount) return { inboxMessage: null };
  const source = z.object({ text: z.string() }).safeParse(r.rows[0]!.payload);
  return { inboxMessage: source.success ? source.data.text : null };
}

export async function runAgent(
  db: Pool,
  runId: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<void> {
  // Session advisory lock serializes at-least-once deliveries without holding a
  // database transaction open over model calls. Losing the session releases it.
  const lock = await db.connect();
  let acquired = false;
  try {
    acquired = (await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired', [`agent-run:${runId}`])).rows[0].acquired;
    if (!acquired) return;
    await executeRun(db, runId, deps);
  } finally {
    try {
      if (acquired) await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [`agent-run:${runId}`]);
      lock.release();
    } catch (error) {
      lock.release(true);
      throw error;
    }
  }
}

async function executeRun(db: Pool, runId: string, deps: { fetchImpl?: typeof fetch }): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const runResult = await db.query('SELECT * FROM agent_runs WHERE id=$1', [runId]);
  if (!runResult.rowCount) throw new Error(`agent_runs row not found: ${runId}`);
  const run = runResult.rows[0] as RunRow;

  // At-least-once job delivery: a retried job for a run that already finished (or is being
  // handled by another worker) is a no-op, never a re-run.
  if (run.status !== 'running') return;

  if (!AGENT_KINDS.includes(run.kind as AgentKind)) {
    await finalizeRun(db, runId, 'failed', `Unknown agent kind: ${run.kind}`, 0, 0);
    return;
  }
  const kind = run.kind as AgentKind;
  const previous = await db.query('SELECT 1 FROM agent_steps WHERE run_id=$1 LIMIT 1', [runId]);
  if (previous.rowCount) {
    await finalizeRun(db, runId, 'failed', 'Ejecucion interrumpida; revisa el historial e inicia una nueva', 0, 0);
    return;
  }

  // A queued automatic run must obey a pause made after inbound receipt.
  if (run.conversation_id && (kind !== 'extract' || (run.input as { source?: string })?.source === 'inbound')) {
    const conversation = await db.query('SELECT agent_paused FROM conversations WHERE id=$1 AND org_id=$2', [run.conversation_id, run.org_id]);
    if (!conversation.rowCount || conversation.rows[0].agent_paused) {
      await finalizeRun(db, runId, 'failed', 'Agente pausado; ejecucion automatica cancelada', 0, 0);
      return;
    }
  }
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    await finalizeRun(db, runId, 'failed', 'DeepSeek is not configured', 0, 0);
    return;
  }
  const modelConfig = { apiKey, baseUrl: process.env.DEEPSEEK_BASE_URL, model: process.env.DEEPSEEK_MODEL };

  const maxSteps = run.max_steps || 8;
  const tokenBudget = Number(process.env.AGENT_MAX_TOKENS ?? 20000);
  const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS ?? 60000);
  const deadline = Date.now() + timeoutMs;

  const context: Record<string, unknown> = { orderId: run.order_id, conversationId: run.conversation_id };
  if (kind === 'extract' && run.inbox_id) Object.assign(context, await loadExtractContext(db, run.org_id, run.inbox_id));
  if (kind === 'compose' && run.conversation_id) {
    // Ground the first model call in the actual trigger and recent history, not an optional tool call.
    context.conversation = await TOOLS.get_conversation!.execute({db,org:run.org_id},{conversationId:run.conversation_id});
    if (run.inbox_id) context.latestMessage = (await loadExtractContext(db,run.org_id,run.inbox_id)).inboxMessage;
    context.purchase = (await db.query('SELECT status FROM demo_purchases WHERE org_id=$1 AND conversation_id=$2 ORDER BY created_at DESC LIMIT 1',[run.org_id,run.conversation_id])).rows[0] ?? null;
  }


  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(kind) },
    { role: 'user', content: initialUserContent(kind, context) },
  ];

  let idx = 0;
  let stepsUsed = 0;
  let tokensUsed = 0;

  while (true) {
    // Hard limits, checked in code before every model call.
    if (Date.now() > deadline) {
      await finalizeRun(db, runId, 'budget_exhausted', 'Wall-clock timeout exceeded', stepsUsed, tokensUsed);
      return;
    }
    if (stepsUsed >= maxSteps) {
      await finalizeRun(db, runId, 'budget_exhausted', `Exceeded max_steps (${maxSteps})`, stepsUsed, tokensUsed);
      return;
    }
    if (tokensUsed >= tokenBudget) {
      await finalizeRun(db, runId, 'budget_exhausted', `Exceeded token budget (${tokenBudget})`, stepsUsed, tokensUsed);
      return;
    }
    stepsUsed++;

    const perCallTimeoutMs = Math.max(1, Math.min(30000, deadline - Date.now()));
    let completion;
    try {
      completion = await callModel(
        { ...modelConfig, timeoutMs: perCallTimeoutMs },
        messages,
        TOOL_DEFINITIONS_FOR_MODEL,
        fetchImpl,
      );
    } catch (error) {
      await persistStep(db, runId, idx++, 'error', null, null, { error: error instanceof Error ? error.message : String(error) });
      await finalizeRun(db, runId, 'failed', 'Model call failed or returned a malformed response', stepsUsed, tokensUsed);
      return;
    }
    tokensUsed += completion.totalTokens;

    const call = completion.message.tool_calls?.[0];
    if (call) {
      // Bounded loop: only the first requested tool call per turn is honoured. This keeps
      // one "step" == one tool round-trip, matching max_steps' meaning.
      messages.push({ role: 'assistant', content: completion.message.content, tool_calls: [call] });
      await persistStep(db, runId, idx++, 'tool_call', call.function.name, safeParseForLog(call.function.arguments), null);

      const tool = TOOLS[call.function.name];
      let result: unknown;
      if (!tool) {
        result = { error: `Unknown tool: ${call.function.name}` };
      } else {
        let args: unknown;
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          await persistStep(db, runId, idx++, 'error', call.function.name, null, { error: 'Malformed tool call arguments (not valid JSON)' });
          await finalizeRun(db, runId, 'failed', 'Model produced malformed tool call arguments', stepsUsed, tokensUsed);
          return;
        }
        const parsed = tool.schema.safeParse(args);
        if (!parsed.success) {
          await persistStep(db, runId, idx++, 'error', call.function.name, args, { error: 'Tool call arguments failed validation', issues: parsed.error.issues });
          await finalizeRun(db, runId, 'failed', 'Model produced invalid tool call arguments', stepsUsed, tokensUsed);
          return;
        }
        try {
          // Read-only by construction — see the invariant documented in tools.ts.
          result = await tool.execute({ db, org: run.org_id }, parsed.data);
        } catch (error) {
          result = { error: error instanceof Error ? error.message : 'Tool execution failed' };
        }
      }
      await persistStep(db, runId, idx++, 'tool_result', call.function.name, null, result);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      continue;
    }

    // No tool call requested: this turn must be the final answer.
    const content = completion.message.content;
    if (content === null) {
      await persistStep(db, runId, idx++, 'error', null, null, { error: 'Model returned empty final content' });
      await finalizeRun(db, runId, 'failed', 'Model returned empty final content', stepsUsed, tokensUsed);
      return;
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      await persistStep(db, runId, idx++, 'error', null, content, { error: 'Final content is not valid JSON' });
      await finalizeRun(db, runId, 'failed', 'Model final output was not valid JSON', stepsUsed, tokensUsed);
      return;
    }
    const schema = finalSchemaFor(kind);
    const validated = schema.safeParse(parsedJson);
    if (!validated.success) {
      await persistStep(db, runId, idx++, 'error', null, parsedJson, { error: 'Final output failed schema validation', issues: validated.error.issues });
      await finalizeRun(db, runId, 'failed', 'Model final output failed schema validation', stepsUsed, tokensUsed);
      return;
    }

    if (kind === 'compose') {
      for (const proposal of validated.data.proposals) {
        const body = (proposal.payload as { body: string }).body;
        const violation = composeViolatesGuardrails(body);
        if (violation) {
          await persistStep(db, runId, idx++, 'error', null, proposal, { error: `Compose safety guardrail violated: ${violation}` });
          await finalizeRun(db, runId, 'failed', `Compose output violated a safety guardrail: ${violation}`, stepsUsed, tokensUsed);
          return;
        }
      }
    }

    const proposalKind = proposalKindFor(kind);
    for (const proposal of validated.data.proposals) {
      const proposalId = randomUUID();
      await db.query(
        'INSERT INTO agent_proposals(id,org_id,run_id,kind,order_id,conversation_id,payload,rationale) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [proposalId, run.org_id, runId, proposalKind, run.order_id, run.conversation_id, JSON.stringify(proposal.payload), proposal.rationale],
      );
      if (kind === 'compose' && run.conversation_id && run.inbox_id && (run.input as {source?: string})?.source === 'inbound') {
        await queueAutomaticReply(db, { orgId: run.org_id, conversationId: run.conversation_id, inboxId: run.inbox_id, proposalId, body: (proposal.payload as { body: string }).body });
      }
    }
    await persistStep(db, runId, idx++, 'final', null, null, { proposalsWritten: validated.data.proposals.length });
    await finalizeRun(db, runId, 'succeeded', null, stepsUsed, tokensUsed);
    return;
  }
}

/** Best-effort parse purely for a readable audit trail; never used to drive control flow. */
function safeParseForLog(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}
