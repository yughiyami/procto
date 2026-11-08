import { z } from 'zod';
// Contract documented by the concurrent job-queue work (src/jobs.ts, not owned by this
// module): registerHandler(kind, fn) where fn: (job, db) => Promise<void>. Adapt this
// import if the landed signature differs.
import { registerHandler } from '../jobs.js';
import { runAgent } from './runtime.js';

export const AGENT_RUN_JOB_KIND = 'agent.run';

const payloadSchema = z.object({ runId: z.uuid() }).strict();

// Registered as a side effect of importing this module, so worker.ts's dynamic import of
// this file is all that is needed to wire the handler up. Kept thin on purpose: all real
// logic lives in runtime.ts, which is unit-testable without the job queue at all.
registerHandler(AGENT_RUN_JOB_KIND, async (job, db) => {
  const { runId } = payloadSchema.parse(job.payload);
  await runAgent(db, runId);
});
