import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { NETWORK_PASSPHRASE } from './config';

/** Whoever can authorise transactions for one Stellar account (a wallet, or a key in tests/scripts). */
export type Signer = {
  address: string;
  /** Signs a transaction envelope (base64 XDR) and returns the signed envelope. */
  signTransaction(xdr: string): Promise<string>;
};

/** Signer backed by a raw secret key. Used by the Node e2e script only; never in the browser UI. */
export function keypairSigner(secret: string): Signer {
  const keypair = Keypair.fromSecret(secret);
  return {
    address: keypair.publicKey(),
    async signTransaction(xdr: string) {
      const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
      tx.sign(keypair);
      return tx.toXDR();
    },
  };
}
