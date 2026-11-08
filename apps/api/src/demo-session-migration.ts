export const demoSessionMigration = `
CREATE TABLE IF NOT EXISTS demo_sessions(
 token_hash text PRIMARY KEY, org_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 ready boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS demo_sessions_expiry ON demo_sessions(expires_at);
`;
