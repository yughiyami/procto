/**
 * Everything that talks to the Stellar network: contract calls, fee-sponsored
 * submission, balances and events. Framework-free (no React, no import.meta) so it
 * runs in the browser, in api functions and in the Node e2e script.
 */
import { Client, Errors } from '@procto/shared-order-client';
import type { Order as ChainOrder, Share as ChainShareOnChain } from '@procto/shared-order-client';
import { Asset, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import {
  CONTRACT_ID,
  FRIENDBOT_URL,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  SOROBAN_RPC_URL,
  TOKENS,
} from './config';
import type { TokenKey } from './config';
import { FriendlyError, friendlyError, parseContractErrorCode } from './errors';
import type { Signer } from './signer';

export type { ChainOrder, ChainShareOnChain };

export type SponsorResponse = {
  hash: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  returnValue?: string;
};

/** How a signed transaction reaches the network. */
export type Submitter = (signedXdr: string) => Promise<SponsorResponse>;

export type TxOutcome = {
  hash: string;
  /** True when the network fee was paid by the sponsor account. */
  sponsored: boolean;
  /** Decoded return value of the contract call, if any. */
  value?: unknown;
};

let server: rpc.Server | undefined;
export function rpcServer(): rpc.Server {
  server ??= new rpc.Server(SOROBAN_RPC_URL);
  return server;
}

function contractClient(publicKey?: string): Client {
  return new Client({
    contractId: CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: SOROBAN_RPC_URL,
    publicKey,
  });
}

// ---------------------------------------------------------------------------
// Submission: fee sponsorship first, user-paid fees as a fallback.
// ---------------------------------------------------------------------------

export class SponsorUnavailable extends Error {}

/** Browser submitter: POST /api/sponsor (same origin, works with `pnpm dev` and on Vercel). */
export function httpSponsorSubmitter(endpoint = '/api/sponsor'): Submitter {
  return async (signedXdr) => {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ xdr: signedXdr }),
      });
    } catch {
      throw new SponsorUnavailable('sponsor endpoint unreachable');
    }
    const body = (await response.json().catch(() => null)) as (SponsorResponse & { error?: string }) | null;
    if (response.status === 503 || response.status === 404 || response.status >= 500 || !body) {
      throw new SponsorUnavailable(body?.error ?? `sponsor responded ${response.status}`);
    }
    if (!response.ok) throw new FriendlyError(body.error ?? 'No se pudo enviar la operación.');
    return body;
  };
}

async function submitDirect(signedXdr: string): Promise<SponsorResponse> {
  const rpcServerInstance = rpcServer();
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sent = await rpcServerInstance.sendTransaction(tx);
  if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') {
    throw new FriendlyError(
      sent.status === 'ERROR'
        ? 'La red rechazó la operación. Si no tienes saldo de red, vuelve a intentarlo con el pago de comisiones activado.'
        : 'La red está ocupada. Inténtalo de nuevo en unos segundos.',
    );
  }
  const final = await rpcServerInstance.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
  return {
    hash: sent.hash,
    status: final.status === rpc.Api.GetTransactionStatus.SUCCESS ? 'SUCCESS' : final.status === rpc.Api.GetTransactionStatus.FAILED ? 'FAILED' : 'PENDING',
    returnValue:
      final.status === rpc.Api.GetTransactionStatus.SUCCESS && final.returnValue ? final.returnValue.toXDR('base64') : undefined,
  };
}

export type ExecuteOptions = {
  /** Defaults to the same-origin /api/sponsor endpoint. */
  sponsor?: Submitter | null;
  /** Called when sponsorship was not possible and the user's own balance pays the fee. */
  onFallback?: (reason: string) => void;
};

async function sign_and_submit(signedXdr: string, options: ExecuteOptions): Promise<TxOutcome> {
  const sponsor = options.sponsor === undefined ? httpSponsorSubmitter() : options.sponsor;
  let response: SponsorResponse | undefined;
  let sponsored = false;
  if (sponsor) {
    try {
      response = await sponsor(signedXdr);
      sponsored = true;
    } catch (error) {
      if (!(error instanceof SponsorUnavailable)) throw error;
      options.onFallback?.(
        'No pudimos usar el pago de comisiones sin costo. Se intentará con el saldo de red de tu billetera.',
      );
    }
  }
  response ??= await submitDirect(signedXdr);
  if (response.status === 'FAILED') {
    throw new FriendlyError('La operación no se pudo completar en la red. Revisa el estado del pedido e inténtalo de nuevo.');
  }
  if (response.status === 'PENDING') {
    throw new FriendlyError('La red tardó en confirmar. Revisa el comprobante en unos segundos.');
  }
  let value: unknown;
  if (response.returnValue) {
    try {
      value = scValToNative(xdr.ScVal.fromXDR(response.returnValue, 'base64'));
    } catch {
      value = undefined;
    }
  }
  return { hash: response.hash, sponsored, value };
}

type Assembled = Awaited<ReturnType<Client['fund']>>;

function assertSimulated(at: Assembled): void {
  const sim = at.simulation;
  if (sim && rpc.Api.isSimulationError(sim)) {
    const code = parseContractErrorCode(sim.error);
    throw new FriendlyError(friendlyError(new Error(sim.error)), code);
  }
}

/** Simulates a contract call, has the signer authorise it and submits it. */
export async function execute(
  signer: Signer,
  build: (client: Client) => Promise<Assembled>,
  options: ExecuteOptions = {},
): Promise<TxOutcome> {
  try {
    const at = await build(contractClient(signer.address));
    assertSimulated(at);
    if (!at.built) throw new Error('transaction was not assembled');
    const signed = await signer.signTransaction(at.built.toXDR());
    return await sign_and_submit(signed, options);
  } catch (error) {
    if (error instanceof FriendlyError) throw error;
    throw new FriendlyError(friendlyError(error), error);
  }
}

// ---------------------------------------------------------------------------
// Contract operations
// ---------------------------------------------------------------------------

export type CreateOrderInput = {
  token: TokenKey;
  shares: Array<{ supplier: string; amount: bigint; label: string }>;
  /** Unix seconds. */
  deadline: number;
};

export async function createChainOrder(signer: Signer, input: CreateOrderInput, options?: ExecuteOptions) {
  const outcome = await execute(
    signer,
    (c) =>
      c.create_order({
        buyer: signer.address,
        token: TOKENS[input.token].contract,
        shares: input.shares,
        deadline: BigInt(input.deadline),
      }) as Promise<Assembled>,
    options,
  );
  const id = unwrapId(outcome.value);
  if (id === null) throw new FriendlyError('No pudimos leer el número del pedido protegido.');
  return { ...outcome, orderId: id };
}

/** `create_order` returns Result<u64>; native decoding gives a bigint (or an Ok wrapper). */
function unwrapId(value: unknown): string | null {
  if (typeof value === 'bigint' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'value' in value) return unwrapId((value as { value: unknown }).value);
  return null;
}

export const fundChainOrder = (signer: Signer, orderId: string, options?: ExecuteOptions) =>
  execute(signer, (c) => c.fund({ order_id: BigInt(orderId) }) as Promise<Assembled>, options);

export const markDelivered = (signer: Signer, orderId: string, index: number, options?: ExecuteOptions) =>
  execute(signer, (c) => c.mark_delivered({ order_id: BigInt(orderId), index }) as Promise<Assembled>, options);

export const confirmDelivery = (signer: Signer, orderId: string, index: number, options?: ExecuteOptions) =>
  execute(signer, (c) => c.confirm_delivery({ order_id: BigInt(orderId), index }) as Promise<Assembled>, options);

export const offerShare = (signer: Signer, orderId: string, index: number, price: bigint, options?: ExecuteOptions) =>
  execute(signer, (c) => c.offer_share({ order_id: BigInt(orderId), index, price }) as Promise<Assembled>, options);

export const cancelOffer = (signer: Signer, orderId: string, index: number, options?: ExecuteOptions) =>
  execute(signer, (c) => c.cancel_offer({ order_id: BigInt(orderId), index }) as Promise<Assembled>, options);

export const buyShare = (signer: Signer, orderId: string, index: number, options?: ExecuteOptions) =>
  execute(
    signer,
    (c) => c.buy_share({ order_id: BigInt(orderId), index, investor: signer.address }) as Promise<Assembled>,
    options,
  );

export const refundExpired = (signer: Signer, orderId: string, options?: ExecuteOptions) =>
  execute(signer, (c) => c.refund_expired({ order_id: BigInt(orderId) }) as Promise<Assembled>, options);

// ---------------------------------------------------------------------------
// Reads (simulation only, no signature, no fee)
// ---------------------------------------------------------------------------

export async function orderCount(): Promise<number> {
  const at = await contractClient().order_count();
  return Number(at.result);
}

export async function getChainOrder(orderId: string): Promise<ChainOrder | null> {
  try {
    const at = await contractClient().get_order({ order_id: BigInt(orderId) });
    const result = at.result;
    return result.isOk() ? result.unwrap() : null;
  } catch {
    return null;
  }
}

export type ChainOrderWithId = { id: string; order: ChainOrder };

/** Most recent protected orders on the contract (newest first). */
export async function listChainOrders(limit = 25): Promise<ChainOrderWithId[]> {
  const count = await orderCount();
  const ids: number[] = [];
  for (let id = count; id >= 1 && ids.length < limit; id--) ids.push(id);
  const orders = await Promise.all(ids.map(async (id) => ({ id: String(id), order: await getChainOrder(String(id)) })));
  return orders.filter((o): o is ChainOrderWithId => o.order !== null);
}

export function orderStatusName(order: ChainOrder): 'Created' | 'Funded' | 'Completed' | 'Refunded' | 'PartiallyRefunded' {
  return order.status.tag;
}

export type Balances = { xlm: number | null; PUSD: number | null; USDC: number | null; exists: boolean };

export async function getBalances(address: string): Promise<Balances> {
  const response = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (response.status === 404) return { xlm: null, PUSD: null, USDC: null, exists: false };
  if (!response.ok) throw new FriendlyError('No pudimos consultar tu saldo.');
  const account = (await response.json()) as {
    balances: Array<{ asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }>;
  };
  const find = (key: TokenKey) => {
    const line = account.balances.find((b) => b.asset_code === TOKENS[key].code && b.asset_issuer === TOKENS[key].issuer);
    return line ? Number(line.balance) : null;
  };
  const native = account.balances.find((b) => b.asset_type === 'native');
  return { xlm: native ? Number(native.balance) : null, PUSD: find('PUSD'), USDC: find('USDC'), exists: true };
}

// ---------------------------------------------------------------------------
// Account onboarding (testnet)
// ---------------------------------------------------------------------------

/** Creates the account on testnet through Friendbot (no-op if it already exists). */
export async function ensureAccountFunded(address: string): Promise<boolean> {
  const balances = await getBalances(address);
  if (balances.exists) return false;
  const response = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`);
  if (!response.ok) throw new FriendlyError('No pudimos crear tu cuenta de prueba. Inténtalo de nuevo.');
  return true;
}

/** Adds the PUSD/USDC trustline (the "permission to hold this money"), with sponsored fees. */
export async function enableToken(signer: Signer, token: TokenKey, options: ExecuteOptions = {}): Promise<TxOutcome | null> {
  const balances = await getBalances(signer.address);
  if (balances[token] !== null) return null;
  try {
    const account = await rpcServer().getAccount(signer.address);
    const tx = new TransactionBuilder(account, { fee: '100000', networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.changeTrust({ asset: new Asset(TOKENS[token].code, TOKENS[token].issuer) }))
      .setTimeout(120)
      .build();
    const signed = await signer.signTransaction(tx.toXDR());
    return await sign_and_submit(signed, options);
  } catch (error) {
    if (error instanceof FriendlyError) throw error;
    throw new FriendlyError(friendlyError(error), error);
  }
}

export type PrepareProgress = (step: 'account' | 'permission' | 'ready') => void;

/** "Preparar mi cuenta": creates the account, enables PUSD and (optionally) the USDC permission. */
export async function prepareAccount(signer: Signer, onProgress?: PrepareProgress, options?: ExecuteOptions) {
  onProgress?.('account');
  await ensureAccountFunded(signer.address);
  onProgress?.('permission');
  await enableToken(signer, 'PUSD', options);
  onProgress?.('ready');
}

/** Testnet demo money from /api/faucet (see api/_lib/faucet.ts). */
export async function requestDemoFunds(address: string, endpoint = '/api/faucet'): Promise<{ hash: string; amount: number }> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  }).catch(() => {
    throw new FriendlyError('No pudimos conectar con el servicio de saldo de prueba.');
  });
  const body = (await response.json().catch(() => null)) as { hash?: string; amount?: number; error?: string } | null;
  if (!response.ok || !body?.hash) throw new FriendlyError(body?.error ?? 'No se pudo cargar el saldo de prueba.');
  return { hash: body.hash, amount: body.amount ?? 0 };
}

// ---------------------------------------------------------------------------
// Events (timeline)
// ---------------------------------------------------------------------------

export type ChainEvent = {
  kind: string;
  orderId: string;
  index?: number;
  hash: string;
  ledger: number;
  at: string;
  data: Record<string, unknown>;
};

const LEDGERS_PER_DAY = 17_280;

/**
 * Contract events for one order, oldest first. The RPC scans at most ~10,000 ledgers per
 * request and hands back a cursor, so we page until the cursor reaches the latest ledger.
 * Returns [] if the RPC retention window no longer has them (transaction hashes stay valid).
 */
export async function getOrderEvents(orderId: string, lookbackDays = 3): Promise<ChainEvent[]> {
  const s = rpcServer();
  try {
    const latest = await s.getLatestLedger();
    const filters = [{ type: 'contract' as const, contractIds: [CONTRACT_ID] }];
    const events: ChainEvent[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 25; page++) {
      const response = await s.getEvents(
        cursor
          ? { cursor, filters, limit: 200 }
          : { startLedger: Math.max(1, latest.sequence - LEDGERS_PER_DAY * lookbackDays), filters, limit: 200 },
      );
      for (const e of response.events) {
        const [kind, id, index] = e.topic.map((t) => scValToNative(t) as unknown);
        if (String(id) !== orderId) continue;
        const data = scValToNative(e.value) as unknown;
        events.push({
          kind: String(kind),
          orderId: String(id),
          index: typeof index === 'number' ? index : undefined,
          hash: e.txHash,
          ledger: e.ledger,
          at: e.ledgerClosedAt,
          data: data && typeof data === 'object' ? (data as Record<string, unknown>) : {},
        });
      }
      cursor = response.cursor;
      const cursorLedger = Number(BigInt(cursor.split('-')[0] ?? '0') >> 32n);
      if (cursorLedger >= response.latestLedger) break;
    }
    return events;
  } catch {
    return [];
  }
}

export { Errors as CONTRACT_ERRORS, nativeToScVal };
