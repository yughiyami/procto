import type { ProposalStatus } from '@izumi/contracts';

/** One key per user intent (see docs/frontend-contract.md): generate once, reuse on retry of that same action. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** react-query key factories, one per cached resource, kept in one place so callers never hand-roll arrays. */
export const queryKeys = {
  orders: {
    all: ['orders'] as const,
    detail: (id: string) => ['orders', id] as const,
    feasibility: (id: string) => ['orders', id, 'feasibility'] as const,
    finance: (id: string) => ['orders', id, 'finance'] as const,
    evidence: (id: string) => ['orders', id, 'evidence'] as const,
  },
  suppliers: {
    all: ['suppliers'] as const,
  },
  inbox: {
    all: ['inbox'] as const,
  },
  drafts: {
    all: ['drafts'] as const,
  },
  integrations: {
    status: ['integrations', 'status'] as const,
  },
  publicInvitation: (token: string) => ['public', 'invitation', token] as const,
  chat: {
    conversations: ['chat', 'conversations'] as const,
    conversation: (id: string) => ['chat', 'conversations', id] as const,
  },
  agents: {
    runs: ['agents', 'runs'] as const,
    run: (id: string) => ['agents', 'runs', id] as const,
    proposals: (status?: ProposalStatus) => ['agents', 'proposals', status ?? null] as const,
  },
} as const;
