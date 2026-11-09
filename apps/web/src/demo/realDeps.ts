/** Side-effecting half of the demo: browser store, quick wallets and the Stellar testnet. */
import type { Order } from '@izumi/contracts';
import { apiClient, store } from '../lib/apiClient';
import { createChainOrder, getBalances, getChainOrder, prepareAccount, requestDemoFunds } from '../stellar/chain';
import { DEFAULT_TOKEN, TOKENS } from '../stellar/config';
import { buildShares, suggestDeadline } from '../stellar/mapping';
import { penCentsToTokenUnits } from '../stellar/units';
import { signerFor } from '../stellar/wallet';
import { readProfile } from '../profile/profileStore';
import type { WalletConnection } from '../stellar/wallet';
import { FatalDemoError } from './retry';
import type { DemoDeps } from './runDemo';
import { isDemoOrder, needsFaucet, walletPlan } from './scenario';
import type { DemoWallet } from './scenario';

function findDemoOrder(): Order | undefined {
  return store.state.orders.find(isDemoOrder);
}

/** Seeds the sample store if the demo order is missing (for example a browser that never opened the app). */
async function ensureDemoOrder(): Promise<Order> {
  await store.init();
  let order = findDemoOrder();
  if (!order) {
    await store.reset();
    order = findDemoOrder();
  }
  if (!order || !order.quote) {
    throw new FatalDemoError('No encontramos el pedido de demostración. Usa "Reiniciar demo" para volver a crearlo.');
  }
  return order;
}

const signerOf = (wallet: DemoWallet) => signerFor({ kind: 'quick', address: wallet.address }, wallet.slot);
const must = (wallets: DemoWallet[], slot: string): DemoWallet => {
  const found = wallets.find((w) => w.slot === slot);
  if (!found) throw new FatalDemoError('Falta una de las cuentas de la demostración.');
  return found;
};

/**
 * @param register Links a quick wallet to its role slot in the session (React state).
 */
export function createDemoDeps(register: (slot: string) => WalletConnection): DemoDeps {
  return {
    async createWallets() {
      const order = await ensureDemoOrder();
      const workshopIds = [...new Set(order.contributions.map((c) => c.supplierId))];
      const suppliers = await apiClient.listSuppliers();
      const workshops = workshopIds.map((id) => ({ id, name: suppliers.find((s) => s.id === id)?.name ?? 'Taller' }));
      return walletPlan(workshops).map((planned) => {
        // Reuses the wallet already stored in this browser; creates it otherwise.
        const connection = register(planned.slot);
        return { ...planned, address: connection.address };
      });
    },

    async isPrepared(wallet) {
      const balances = await getBalances(wallet.address);
      return balances.exists && balances.PUSD !== null;
    },

    async prepare(wallet) {
      await prepareAccount(signerOf(wallet));
    },

    async needsFunds(wallet) {
      return needsFaucet((await getBalances(wallet.address)).PUSD);
    },

    async fund(wallet) {
      await requestDemoFunds(wallet.address);
    },

    async findActiveOrder() {
      const order = findDemoOrder();
      const link = order && store.getChain(order.id);
      if (!order || !link) return null;
      // A just-created contract order can take a ledger to show up: throwing lets the step retry.
      if (!(await getChainOrder(link.chainOrderId))) throw new Error('El pedido protegido aún no es visible en la red.');
      return order.id;
    },

    async activateOrder(wallets) {
      let order = await ensureDemoOrder();
      if (!order.accepted && order.quote) {
        if (order.status !== 'quoted') {
          throw new FatalDemoError('El pedido de demostración ya cambió. Usa "Reiniciar demo" para volver a empezar.');
        }
        order = await apiClient.acceptQuote(order.id, order.quote.version);
      }
      const suppliers = await apiClient.listSuppliers();
      const shares = buildShares(order, suppliers, { commission: { pro: readProfile().pro } });
      const addresses = shares.map((share) =>
        share.address ?? (share.supplierId ? must(wallets, `proveedor:${share.supplierId}`).address : must(wallets, 'coordinadora').address),
      );
      const buyer = must(wallets, 'comprador');
      const deadline = suggestDeadline(order.dueAt);
      const created = await createChainOrder(signerOf(buyer), {
        token: DEFAULT_TOKEN,
        deadline,
        shares: shares.map((share, i) => ({
          supplier: addresses[i]!,
          label: share.label,
          amount: penCentsToTokenUnits(share.amountCents),
        })),
      });
      shares.forEach((share, i) => share.supplierId && store.setSupplierWallet(share.supplierId, addresses[i]!));
      store.setChain(order.id, {
        chainOrderId: created.orderId,
        token: DEFAULT_TOKEN,
        tokenContract: TOKENS[DEFAULT_TOKEN].contract,
        buyer: buyer.address,
        deadline,
        shares: shares.map((share, i) => ({
          supplierId: share.supplierId,
          kind: share.kind,
          label: share.label,
          address: addresses[i]!,
          amountCents: share.amountCents,
          amountUnits: penCentsToTokenUnits(share.amountCents).toString(),
        })),
        txs: [
          { kind: 'create_order', hash: created.hash, at: new Date().toISOString(), by: buyer.address, sponsored: created.sponsored },
        ],
      });
      return order.id;
    },
  };
}
