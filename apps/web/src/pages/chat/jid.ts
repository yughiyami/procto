/**
 * WhatsApp JID helpers shared by the conversation list and thread screens.
 * Mirrors the pattern `packages/contracts/src/chat.ts` and
 * `apps/api/src/chat-wiring.ts` validate server-side — kept local since it is
 * only ever used for display/validation inside this page directory.
 */
export const JID_PATTERN = /^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/;

/** A ready-to-use example so nobody has to guess the JID format in the simulator form. */
export const EXAMPLE_JID = '51987654321@s.whatsapp.net';

export function isValidJid(value: string): boolean {
  return JID_PATTERN.test(value.trim());
}

/**
 * Turns a raw JID like "51987654321@s.whatsapp.net" into a human-readable phone
 * number for display. Never returns a `tel:`/`mailto:`-style link value — callers
 * must render this as plain text, not as an external link.
 */
export function formatPeer(peer: string): string {
  const match = /^(\d+)(?::\d+)?@(s\.whatsapp\.net|lid)$/.exec(peer);
  if (!match) return peer;
  const digits = match[1] ?? peer;
  if (digits.startsWith('51') && digits.length === 11) {
    const national = digits.slice(2);
    return `+51 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }
  return `+${digits}`;
}
