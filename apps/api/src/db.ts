import {photoMigration} from './product-photos.js';
import {purchaseMigration} from './purchase-demo.js';
import {pitchDemoMigration} from './pitch-demo-wiring.js';
import {demoSessionMigration} from './demo-session-migration.js';
import pg from 'pg';
import {directoryMigration} from './directory-wiring.js';
import {profileMigration} from './profile-wiring.js';
import {opportunityMigration} from './opportunity-wiring.js';
export function pool(){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');return new pg.Pool({connectionString:process.env.DATABASE_URL,max:10});}
export const migration=`
CREATE TABLE IF NOT EXISTS organizations(id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE IF NOT EXISTS credentials(token_hash text PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id));
CREATE TABLE IF NOT EXISTS suppliers(id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL);
CREATE TABLE IF NOT EXISTS orders(id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), data json NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS operations(org_id uuid NOT NULL, key text NOT NULL, fingerprint text NOT NULL, response json NOT NULL, PRIMARY KEY(org_id,key));
CREATE TABLE IF NOT EXISTS invitations(token_hash text PRIMARY KEY, org_id uuid NOT NULL, order_id uuid NOT NULL REFERENCES orders(id), supplier_id uuid, purpose text NOT NULL, quote_version integer, expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE IF NOT EXISTS inbox(id text PRIMARY KEY, org_id uuid NOT NULL, payload json NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS drafts(id uuid PRIMARY KEY, org_id uuid NOT NULL, inbox_id text UNIQUE REFERENCES inbox(id), data json NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS orders_org ON orders(org_id);

-- Durable work queue. Replaces fire-and-forget async work: a process crash must not
-- lose an outbound message or an agent run. Claimed with FOR UPDATE SKIP LOCKED.
CREATE TABLE IF NOT EXISTS jobs(id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), kind text NOT NULL, payload json NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 5, run_after timestamptz NOT NULL DEFAULT now(), dedupe_key text, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe ON jobs(org_id,dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_claim ON jobs(status,run_after) WHERE status='pending';

-- One thread per counterparty. order_id is nullable: a conversation may start before
-- anyone knows which order it belongs to, and is linked by a human afterwards.
CREATE TABLE IF NOT EXISTS conversations(id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), peer text NOT NULL, display_name text, order_id uuid REFERENCES orders(id), supplier_id uuid, agent_paused boolean NOT NULL DEFAULT true, last_message_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS conversations_peer ON conversations(org_id,peer);

-- Outbound is never blind-retried: wapi.sendWapiText returns 'unknown' for an
-- ambiguous outcome, and that row waits for operator reconciliation.
CREATE TABLE IF NOT EXISTS outbound_messages(id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), conversation_id uuid NOT NULL REFERENCES conversations(id), body text NOT NULL, status text NOT NULL DEFAULT 'queued', provider_message_id text, approved_by text, error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS auto_reply boolean NOT NULL DEFAULT false;
ALTER TABLE outbound_messages ADD COLUMN IF NOT EXISTS source_inbox_id text;
CREATE UNIQUE INDEX IF NOT EXISTS outbound_inbound_once ON outbound_messages(org_id, source_inbox_id) WHERE source_inbox_id IS NOT NULL;
ALTER TABLE outbound_messages ADD COLUMN IF NOT EXISTS media jsonb;
ALTER TABLE outbound_messages ADD COLUMN IF NOT EXISTS promotion boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS outbound_conversation ON outbound_messages(conversation_id,created_at);

-- Agent execution is fully auditable: every step is persisted before the next one runs.
CREATE TABLE IF NOT EXISTS agent_runs(id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), kind text NOT NULL, status text NOT NULL DEFAULT 'running', order_id uuid REFERENCES orders(id), conversation_id uuid REFERENCES conversations(id), inbox_id text REFERENCES inbox(id), input json NOT NULL, steps_used integer NOT NULL DEFAULT 0, max_steps integer NOT NULL DEFAULT 8, tokens_used integer NOT NULL DEFAULT 0, error text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz);
CREATE INDEX IF NOT EXISTS agent_runs_org ON agent_runs(org_id,created_at DESC);
CREATE TABLE IF NOT EXISTS agent_steps(id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE, idx integer NOT NULL, type text NOT NULL, name text, input json, output json, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS agent_steps_order ON agent_steps(run_id,idx);

-- THE SAFETY GATE. An agent never mutates an order. It writes a proposal here, and a
-- human approval is what calls the domain function — under an idempotency key, so
-- approving twice cannot apply it twice.
CREATE TABLE IF NOT EXISTS agent_proposals(id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL, kind text NOT NULL, order_id uuid REFERENCES orders(id), conversation_id uuid REFERENCES conversations(id), payload json NOT NULL, rationale text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending', decided_by text, decided_at timestamptz, operation_key text, error text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS agent_proposals_pending ON agent_proposals(org_id,status,created_at DESC);

ALTER TABLE inbox ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id);
` + directoryMigration + profileMigration + opportunityMigration + demoSessionMigration + pitchDemoMigration + purchaseMigration + photoMigration;
