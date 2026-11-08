/**
 * Fee sponsorship core. A user signs a transaction that only touches our contract
 * (or adds a PUSD/USDC trustline); the sponsor account wraps it in a fee bump and
 * pays the network fee. The sponsor never signs the inner transaction, never
 * custodies user funds and cannot change what the user authorised.
 *
 * Kept free of any HTTP framework so it is unit-testable and reusable from the
 * Vercel function, the Vite dev middleware and the Node e2e script.
 */
import {
  Address,
  Asset,
  FeeBumpTransaction,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  rpc,
} from '@stellar/stellar-sdk';
import { CONTRACT_ID, NETWORK_PASSPHRASE, SOROBAN_RPC_URL, SPONSORED_FUNCTIONS, TOKENS } from '../../src/stellar/config.js';

export class SponsorError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'SponsorError';
  }
}

/** 0.5 XLM: far above a normal call (~0.01-0.1 XLM), far below anything abusive. */
export const MAX_INNER_FEE_STROOPS = 5_000_000;

export type InnerInfo = {
  tx: Transaction;
  source: string;
  kind: 'contract' | 'trust';
  functionName?: string;
};

export function inspectInnerTransaction(
  innerXdr: string,
  passphrase: string = NETWORK_PASSPHRASE,
  sponsorAddress?: string,
): InnerInfo {
  if (typeof innerXdr !== 'string' || innerXdr.length === 0 || innerXdr.length > 20_000) {
    throw new SponsorError('La transacción no es válida.');
  }
  let parsed;
  try {
    parsed = TransactionBuilder.fromXDR(innerXdr, passphrase);
  } catch {
    throw new SponsorError('La transacción no es válida.');
  }
  if (parsed instanceof FeeBumpTransaction) {
    throw new SponsorError('La transacción ya tiene un patrocinio de comisión.');
  }
  const tx = parsed as Transaction;
  if (sponsorAddress && tx.source === sponsorAddress) {
    throw new SponsorError('La cuenta patrocinadora no puede ser la cuenta de origen.');
  }
  if (tx.operations.length !== 1) {
    throw new SponsorError('Solo se patrocina una operación por transacción.');
  }
  if (Number(tx.fee) > MAX_INNER_FEE_STROOPS) {
    throw new SponsorError('La comisión solicitada excede el límite permitido.');
  }

  // The user must have signed: verify the signature against the source key.
  const hash = tx.hash();
  const sourceKey = Keypair.fromPublicKey(tx.source);
  const signed = tx.signatures.some((s) => {
    try {
      return sourceKey.verify(hash, (s.signature as unknown as { value: Uint8Array }).value as never);
    } catch {
      return false;
    }
  });
  if (!signed) throw new SponsorError('Falta la firma de la persona usuaria.');

  const op = tx.operations[0] as unknown as { type: string; source?: string };
  if (op.source && op.source !== tx.source) {
    throw new SponsorError('La operación debe pertenecer a la cuenta de origen.');
  }

  if (op.type === 'invokeHostFunction') {
    const func = (op as unknown as Operation.InvokeHostFunction).func;
    if (func.type !== 'hostFunctionTypeInvokeContract') {
      throw new SponsorError('Solo se permiten llamadas al contrato de PROCTO.');
    }
    const invoke = func.invokeContract;
    const contractId = Address.fromScAddress(invoke.contractAddress).toString();
    if (contractId !== CONTRACT_ID) {
      throw new SponsorError('Solo se permiten llamadas al contrato de PROCTO.');
    }
    const functionName = String(invoke.functionName);
    if (!(SPONSORED_FUNCTIONS as readonly string[]).includes(functionName)) {
      throw new SponsorError(`La función "${functionName}" no se patrocina.`);
    }
    return { tx, source: tx.source, kind: 'contract', functionName };
  }

  if (op.type === 'changeTrust') {
    const line = (op as unknown as Operation.ChangeTrust).line;
    const allowed = Object.values(TOKENS).some(
      (t) => line instanceof Asset && line.getCode() === t.code && line.getIssuer() === t.issuer,
    );
    if (!allowed) throw new SponsorError('Solo se patrocina la habilitación de PUSD o USDC.');
    return { tx, source: tx.source, kind: 'trust' };
  }

  throw new SponsorError('Este tipo de operación no se patrocina.');
}

export function buildSponsoredEnvelope(
  inner: Transaction,
  sponsor: Keypair,
  passphrase: string = NETWORK_PASSPHRASE,
): FeeBumpTransaction {
  const ops = Math.max(1, inner.operations.length);
  const baseFee = Math.ceil(Number(inner.fee) / ops);
  const bumped = TransactionBuilder.buildFeeBumpTransaction(sponsor, String(baseFee), inner, passphrase);
  bumped.sign(sponsor);
  return bumped;
}

/** Sliding-window limiter. Mutates `bucket`; throws SponsorError(429) when exceeded. */
export function checkRateLimit(
  bucket: Map<string, number[]>,
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): void {
  const recent = (bucket.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    bucket.set(key, recent);
    throw new SponsorError('Demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.', 429);
  }
  recent.push(now);
  bucket.set(key, recent);
}

export type SponsorEnv = {
  SPONSOR_SECRET?: string;
  SOROBAN_RPC_URL?: string;
};

export type SponsorResult = {
  hash: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  ledger?: number;
  /** Base64 XDR of the invocation's return value, when available. */
  returnValue?: string;
  sponsor: string;
};

const buckets = new Map<string, number[]>();

export async function sponsorAndSubmit(innerXdr: string, env: SponsorEnv): Promise<SponsorResult> {
  if (!env.SPONSOR_SECRET) {
    throw new SponsorError('El patrocinio de comisiones no está configurado.', 503);
  }
  const sponsor = Keypair.fromSecret(env.SPONSOR_SECRET);
  const info = inspectInnerTransaction(innerXdr, NETWORK_PASSPHRASE, sponsor.publicKey());
  checkRateLimit(buckets, info.source, 40, 60 * 60 * 1000);

  const server = new rpc.Server(env.SOROBAN_RPC_URL ?? SOROBAN_RPC_URL);
  const bumped = buildSponsoredEnvelope(info.tx, sponsor);
  const sent = await server.sendTransaction(bumped);
  if (sent.status === 'ERROR') {
    throw new SponsorError('La red rechazó la transacción. Revisa que el pedido esté en el estado correcto.', 422);
  }
  if (sent.status === 'TRY_AGAIN_LATER') {
    throw new SponsorError('La red está ocupada. Inténtalo de nuevo en unos segundos.', 503);
  }
  const final = await server.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
  if (final.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    return {
      hash: sent.hash,
      status: 'SUCCESS',
      ledger: final.ledger,
      returnValue: final.returnValue ? final.returnValue.toXDR('base64') : undefined,
      sponsor: sponsor.publicKey(),
    };
  }
  if (final.status === rpc.Api.GetTransactionStatus.FAILED) {
    return { hash: sent.hash, status: 'FAILED', ledger: final.ledger, sponsor: sponsor.publicKey() };
  }
  return { hash: sent.hash, status: 'PENDING', sponsor: sponsor.publicKey() };
}
