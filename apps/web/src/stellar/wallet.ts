/**
 * Wallet access. Two ways to authorise transactions:
 *  - "kit": any Stellar wallet through @creit.tech/stellar-wallets-kit (Freighter, xBull,
 *    Albedo, Lobstr, Hana, Rabet, ...). The kit shows its own selection modal.
 *  - "quick": a throw-away testnet key kept in this browser, so people without a wallet can try
 *    the whole flow in seconds. TESTNET ONLY. On mainnet this slot is replaced by a passkey
 *    smart wallet (see README, "Mainnet route").
 */
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { Networks } from '@creit.tech/stellar-wallets-kit/types';
import { NETWORK_PASSPHRASE } from './config';
import { FriendlyError, friendlyError } from './errors';
import type { Signer } from './signer';

export type WalletKind = 'kit' | 'quick';
export type WalletConnection = { kind: WalletKind; address: string };

let kitReady = false;
function ensureKit() {
  if (kitReady) return;
  StellarWalletsKit.init({
    modules: defaultModules(),
    network: Networks.TESTNET,
    authModal: { showInstallLabel: true },
  });
  kitReady = true;
}

/** Opens the wallet picker and returns the chosen account. */
export async function connectWithKit(): Promise<WalletConnection> {
  try {
    ensureKit();
    const { address } = await StellarWalletsKit.authModal();
    return { kind: 'kit', address };
  } catch (error) {
    throw new FriendlyError(friendlyError(error), error);
  }
}

export async function disconnectKit(): Promise<void> {
  try {
    ensureKit();
    await StellarWalletsKit.disconnect();
  } catch {
    // Nothing to disconnect.
  }
}

const quickKey = (slot: string) => `procto.quickwallet.${slot}`;

function readQuick(slot: string): string | null {
  try {
    return localStorage.getItem(quickKey(slot));
  } catch {
    return null;
  }
}

/** Creates (or reuses) the throw-away testnet wallet for a slot. */
export function connectQuickWallet(slot: string): WalletConnection {
  let secret = readQuick(slot);
  if (!secret) {
    secret = Keypair.random().secret();
    try {
      localStorage.setItem(quickKey(slot), secret);
    } catch {
      throw new FriendlyError('Tu navegador no permite guardar la billetera rápida.');
    }
  }
  return { kind: 'quick', address: Keypair.fromSecret(secret).publicKey() };
}

export function quickWalletAddress(slot: string): string | null {
  const secret = readQuick(slot);
  return secret ? Keypair.fromSecret(secret).publicKey() : null;
}

export function signerFor(connection: WalletConnection, slot: string): Signer {
  if (connection.kind === 'quick') {
    const secret = readQuick(slot);
    if (!secret) throw new FriendlyError('No encontramos tu billetera rápida en este navegador.');
    const keypair = Keypair.fromSecret(secret);
    return {
      address: keypair.publicKey(),
      async signTransaction(xdr) {
        const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
        tx.sign(keypair);
        return tx.toXDR();
      },
    };
  }
  return {
    address: connection.address,
    async signTransaction(xdr) {
      try {
        ensureKit();
        const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
          networkPassphrase: NETWORK_PASSPHRASE,
          address: connection.address,
        });
        return signedTxXdr;
      } catch (error) {
        throw new FriendlyError(friendlyError(error), error);
      }
    },
  };
}
