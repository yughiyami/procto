import {anchorDemoPurchase} from './purchase-demo.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { pool } from './db.js';
import { runOnce, registerHandler, getHandlers } from './jobs.js';
import { deliverOutbound } from './chat.js';
import './agents/handlers.js';

const POLL_MS = z.coerce.number().int().min(100).max(60000).parse(process.env.WORKER_POLL_MS ?? '2000');
// Each agent holds one advisory-lock connection and uses another for queries.
// Keep headroom in pg's default ten-connection pool.
const BATCH = z.coerce.number().int().min(1).max(5).parse(process.env.WORKER_BATCH ?? '5');

const whatsappSendPayload = z.object({ outboundMessageId: z.uuid() }).strict();

registerHandler('whatsapp.send', async (job, db) => {
  const { outboundMessageId } = whatsappSendPayload.parse(job.payload);
  await deliverOutbound(db, outboundMessageId);
});

registerHandler('blockchain.anchor', async(job,db)=>{const {purchaseId}=z.object({purchaseId:z.uuid()}).strict().parse(job.payload);await anchorDemoPurchase(db,job.orgId,purchaseId);});

async function main(): Promise<void> {
  const db = pool();
  let stopping = false;
  let inFlight: Promise<number> | null = null;

  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    if (inFlight) await inFlight.catch(() => {});
    await db.end();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  while (!stopping) {
    inFlight = runOnce(db, getHandlers(), BATCH);
    try {
      await inFlight;
    } catch (e) {
      console.error('Job batch failed', e);
    } finally {
      inFlight = null;
    }
    if (!stopping) await sleep(POLL_MS);
  }
}

main().catch(e => {
  console.error('Worker crashed', e);
  process.exit(1);
});

