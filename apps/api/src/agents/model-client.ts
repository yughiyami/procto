import { z } from 'zod';
import { serviceUrl } from '../integrations/wapi.js';

export type ToolCallRequest = { id: string; type: 'function'; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCallRequest[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ModelConfig = { apiKey: string; baseUrl?: string; model?: string; timeoutMs?: number };

// Tool-call envelope metadata (such as DeepSeek's numeric `index`) is provider
// controlled and stripped. The function shape and downstream tool arguments stay
// strictly validated. The outer completion envelope is provider-controlled (fields like
// `id`, `object`, `created`, `system_fingerprint` over time) and is intentionally not
// `.strict()` — same convention as integrations/deepseek.ts.
const toolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal('function'),
  function: z.object({ name: z.string().min(1), arguments: z.string() }).strict(),
});

const assistantMessageSchema = z.object({
  content: z.string().nullable(),
  tool_calls: z.array(toolCallSchema).optional(),
});

const completionSchema = z.object({
  choices: z.array(z.object({ finish_reason: z.string(), message: assistantMessageSchema })).min(1),
  usage: z.object({ total_tokens: z.number().int().nonnegative() }).partial().optional(),
});

export type CompletionResult = {
  message: { content: string | null; tool_calls?: ToolCallRequest[] };
  totalTokens: number;
};

/**
 * One chat-completion call against DeepSeek's OpenAI-compatible tool-calling API.
 * Injectable `fetchImpl` so runtime tests never touch the network — same pattern as
 * integrations/deepseek.ts's `extractRequest`.
 *
 * Throws on any transport or shape problem; the caller (agents/runtime.ts) treats that as
 * malformed model output and ends the run `failed` rather than guessing at a response.
 */
export async function callModel(
  config: ModelConfig,
  messages: ChatMessage[],
  tools: unknown[],
  fetchImpl: typeof fetch = fetch,
): Promise<CompletionResult> {
  if (!config.apiKey) throw new Error('DEEPSEEK_API_KEY missing');
  const response = await fetchImpl(serviceUrl(config.baseUrl ?? 'https://api.deepseek.com', 'chat/completions'), {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(config.timeoutMs ?? 30000),
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model ?? 'deepseek-v4-flash',
      temperature: 0,
      max_tokens: 1200,
      // V4 defaults to reasoning: its hidden tokens can exhaust this small reply
      // budget before producing any content. This bounded sales agent needs JSON,
      // not hidden reasoning. System prompts explicitly contain the word JSON.
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      tools,
      messages,
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek unavailable (${response.status})`);
  const envelope = completionSchema.parse(await response.json());
  const choice = envelope.choices[0]!;
  if (!['stop', 'tool_calls'].includes(choice.finish_reason)) throw new Error(`DeepSeek incomplete completion (${choice.finish_reason})`);
  if (!choice.message.tool_calls?.length && !choice.message.content?.trim()) throw new Error('DeepSeek returned an empty completion');
  return { message: choice.message, totalTokens: envelope.usage?.total_tokens ?? 0 };
}
