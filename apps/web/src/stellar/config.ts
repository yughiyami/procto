/**
 * Network configuration. Plain constants only (no import.meta.env) so the same
 * module runs in the browser, in the Vercel functions and in the Node e2e script.
 * Source of truth for ids: deployments/testnet.json.
 */
export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet';

export const CONTRACT_ID = 'CC6KIYZ4BZXVG4XT33XIF7PNSHDGY65VWV6ZWSUG56JEVB6VRFENJP6T';

export type TokenKey = 'PUSD' | 'USDC';

export type TokenInfo = {
  key: TokenKey;
  code: string;
  issuer: string;
  /** Stellar Asset Contract id. */
  contract: string;
  /** Plain-language name shown to users. */
  friendlyName: string;
};

export const TOKENS: Record<TokenKey, TokenInfo> = {
  PUSD: {
    key: 'PUSD',
    code: 'PUSD',
    issuer: 'GDT7NYOJZJFLOVQ5VMTFRWQXUY4EK7A63NSHMOYBE22DWV74CTJP5UCP',
    contract: 'CDF6OL357YMHTV55HBBPDRTRHDIXSL3XUX7PYQA7FTQQATVPSH4OXSLD',
    friendlyName: 'dólares digitales de prueba',
  },
  USDC: {
    key: 'USDC',
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    contract: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    friendlyName: 'dólares digitales (USDC)',
  },
};

/** Token used by the guided demo flow. USDC works the same once the wallet holds it. */
export const DEFAULT_TOKEN: TokenKey = 'PUSD';

export const explorerTx = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const explorerAccount = (address: string) => `${EXPLORER_BASE}/account/${address}`;
export const explorerContract = (id: string = CONTRACT_ID) => `${EXPLORER_BASE}/contract/${id}`;

export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

export function tokenByContract(contractId: string): TokenInfo | undefined {
  return Object.values(TOKENS).find((t) => t.contract === contractId);
}

/** Calls the contract can be sponsored for. Keep in sync with api/_lib/sponsor.ts. */
export const SPONSORED_FUNCTIONS = [
  'create_order',
  'fund',
  'mark_delivered',
  'confirm_delivery',
  'offer_share',
  'buy_share',
  'cancel_offer',
  'refund_expired',
] as const;
