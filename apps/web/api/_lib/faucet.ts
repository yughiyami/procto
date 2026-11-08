/**
 * Testnet-only demo faucet: mints PUSD (demo asset issued by procto-issuer) to a
 * prepared account. Protection against abuse: the account must already trust PUSD,
 * must hold less than FAUCET_BALANCE_CAP, and requests are rate limited per address.
 * This asset has no value; mainnet uses Circle USDC instead.
 */
import { Asset, Keypair, Operation, StrKey, TransactionBuilder, rpc } from '@stellar/stellar-sdk';
import { HORIZON_URL, NETWORK_PASSPHRASE, SOROBAN_RPC_URL, TOKENS } from '../../src/stellar/config.js';
import { SponsorError, checkRateLimit } from './sponsor.js';

export const FAUCET_AMOUNT = 10_000;
export const FAUCET_BALANCE_CAP = 20_000;

type HorizonAccount = { balances: Array<{ asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }> };

export function readPusdBalance(account: HorizonAccount): number | null {
  const line = account.balances.find((b) => b.asset_code === TOKENS.PUSD.code && b.asset_issuer === TOKENS.PUSD.issuer);
  return line ? Number(line.balance) : null;
}

export function assertFaucetEligible(address: string, account: HorizonAccount): void {
  if (!StrKey.isValidEd25519PublicKey(address)) throw new SponsorError('La dirección de la cuenta no es válida.');
  const balance = readPusdBalance(account);
  if (balance === null) throw new SponsorError('Primero prepara tu cuenta para poder recibir saldo de prueba.');
  if (balance >= FAUCET_BALANCE_CAP) throw new SponsorError('Ya tienes saldo de prueba suficiente.');
}

const buckets = new Map<string, number[]>();

export type FaucetEnv = { ISSUER_SECRET?: string; HORIZON_URL?: string; SOROBAN_RPC_URL?: string };

export async function mintDemoTokens(address: string, env: FaucetEnv): Promise<{ hash: string; amount: number }> {
  if (!env.ISSUER_SECRET) throw new SponsorError('El saldo de prueba no está configurado.', 503);
  if (!StrKey.isValidEd25519PublicKey(address)) throw new SponsorError('La dirección de la cuenta no es válida.');
  checkRateLimit(buckets, address, 3, 60 * 60 * 1000);

  const res = await fetch(`${env.HORIZON_URL ?? HORIZON_URL}/accounts/${address}`);
  if (res.status === 404) throw new SponsorError('Primero prepara tu cuenta para poder recibir saldo de prueba.');
  if (!res.ok) throw new SponsorError('No pudimos consultar la cuenta. Inténtalo de nuevo.', 502);
  assertFaucetEligible(address, (await res.json()) as HorizonAccount);

  const issuer = Keypair.fromSecret(env.ISSUER_SECRET);
  if (issuer.publicKey() !== TOKENS.PUSD.issuer) throw new SponsorError('Configuración del emisor inválida.', 500);
  const server = new rpc.Server(env.SOROBAN_RPC_URL ?? SOROBAN_RPC_URL);
  const source = await server.getAccount(issuer.publicKey());
  const tx = new TransactionBuilder(source, { fee: '10000', networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(
      Operation.payment({
        destination: address,
        asset: new Asset(TOKENS.PUSD.code, TOKENS.PUSD.issuer),
        amount: String(FAUCET_AMOUNT),
      }),
    )
    .setTimeout(60)
    .build();
  tx.sign(issuer);
  const sent = await server.sendTransaction(tx);
  if (sent.status === 'ERROR') throw new SponsorError('La red rechazó el envío de saldo de prueba.', 422);
  const final = await server.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new SponsorError('No se pudo confirmar el saldo de prueba. Inténtalo de nuevo.', 502);
  }
  return { hash: sent.hash, amount: FAUCET_AMOUNT };
}
