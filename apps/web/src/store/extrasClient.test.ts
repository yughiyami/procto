import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalClient } from './client';
import { ExtrasStore } from './extras';
import { createExtrasClient } from './extrasClient';
import { LocalStore } from './localStore';
import type { StorageLike } from './localStore';

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

async function setup() {
  const store = new LocalStore(memoryStorage());
  await store.init();
  const extras = new ExtrasStore(memoryStorage());
  const local = createLocalClient(store);
  return { store, extras, local, client: createExtrasClient(extras, local) };
}

describe('inbox and drafts', () => {
  it('starts with a pending sample message and extracts a draft from it', async () => {
    const { client } = await setup();
    const [item] = await client.listInbox();
    expect(item!.status).toBe('pending');
    const result = await client.extractInbox(item!.id);
    expect(result.data).toMatchObject({ quantity: 200, requiresHumanConfirmation: true });
    expect((await client.listInbox())[0]!.status).toBe('extracted');
    expect(await client.listDrafts()).toHaveLength(1);
  });

  it('refuses to extract an unknown message', async () => {
    const { client } = await setup();
    await expect(client.extractInbox('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('chat', () => {
  it('simulates an inbound message into a conversation and the inbox', async () => {
    const { client } = await setup();
    const peer = '51911222333@s.whatsapp.net';
    const result = await client.simulateInbound({ peer, text: 'Necesito 30 gorros para el 10 de enero' });
    expect(result).toMatchObject({ received: true, duplicate: false });
    const list = await client.listConversations();
    expect(list.find((c) => c.peer === peer)!.unreadCount).toBe(1);
    expect((await client.listInbox())[0]!.payload.text).toMatch(/gorros/);
    // Opening the conversation marks it as read.
    expect(await client.getConversation(result.conversationId)).toHaveLength(1);
    expect((await client.listConversations()).find((c) => c.peer === peer)!.unreadCount).toBe(0);
  });

  it('stores outbound messages as queued: nothing reaches a phone', async () => {
    const { client } = await setup();
    const [conv] = await client.listConversations();
    const sent = await client.sendChatMessage(conv!.id, { body: 'Hola' });
    expect(sent.status).toBe('queued');
    const status = await client.integrationsStatus();
    expect(status.wapi.configured).toBe(false);
    expect(status.wapi.simulated).toBe(true);
  });

  it('creates conversations from a phone number', async () => {
    const { client } = await setup();
    const created = await client.createConversation({ phone: '+51 999 888 777', displayName: 'Taller X' });
    expect(created.peer).toBe('51999888777@s.whatsapp.net');
    await expect(client.createConversation({ phone: '12' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('agent proposals', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('extract run proposes an order draft that only exists after a person approves', async () => {
    const { client, local } = ctx;
    const [item] = await client.listInbox();
    const before = (await local.listOrders()).length;
    const run = await client.startAgentRun({ kind: 'extract', inboxId: item!.id });
    expect(run.status).toBe('succeeded');
    const [proposal] = await client.listProposals('pending');
    expect(proposal!.kind).toBe('order_draft');
    expect((await local.listOrders()).length).toBe(before);

    const decided = await client.decideProposal(proposal!.id, { decision: 'approve' });
    expect(decided.status).toBe('applied');
    const orders = await local.listOrders();
    expect(orders.length).toBe(before + 1);
    expect(orders[0]!.quantity).toBe(200);
  });

  it('rejecting leaves everything untouched and cannot be decided twice', async () => {
    const { client, local } = ctx;
    const [item] = await client.listInbox();
    const before = (await local.listOrders()).length;
    await client.startAgentRun({ kind: 'extract', inboxId: item!.id });
    const [proposal] = await client.listProposals('pending');
    expect((await client.decideProposal(proposal!.id, { decision: 'reject' })).status).toBe('rejected');
    expect((await local.listOrders()).length).toBe(before);
    await expect(client.decideProposal(proposal!.id, { decision: 'approve' })).rejects.toMatchObject({ status: 409 });
  });

  it('fails an extract run honestly when the message has no request', async () => {
    const { client } = ctx;
    await client.simulateInbound({ peer: '51900000000@s.whatsapp.net', text: 'Buenas tardes' });
    const [latest] = await client.listInbox();
    const run = await client.startAgentRun({ kind: 'extract', inboxId: latest!.id });
    expect(run.status).toBe('failed');
    expect(await client.listProposals('pending')).toHaveLength(0);
  });

  it('validate run turns a supplier reply into a contribution proposal and applies it on approval', async () => {
    const { client, local } = ctx;
    const [order] = (await local.listOrders()).filter((o) => o.title.includes('ponchos'));
    const [supplier] = await local.listSuppliers();
    const [conv] = await client.listConversations();
    await client.linkConversation(conv!.id, { orderId: order!.id, supplierId: supplier!.id });
    await client.simulateInbound({ peer: conv!.peer, text: 'Te hago 40 unidades a S/ 9.50 cada una' });
    const run = await client.startAgentRun({ kind: 'validate', orderId: order!.id, conversationId: conv!.id });
    expect(run.status).toBe('succeeded');
    const [proposal] = await client.listProposals('pending');
    expect(proposal).toMatchObject({ kind: 'contribution', orderId: order!.id });
    const decided = await client.decideProposal(proposal!.id, { decision: 'approve' });
    expect(decided.status).toBe('applied');
    const updated = await local.getOrder(order!.id);
    expect(updated.contributions.some((c) => c.quantity === 40 && c.unitCostCents === 950)).toBe(true);
  });

  it('compose run proposes a message and sends nothing until approved', async () => {
    const { client } = ctx;
    const [conv] = await client.listConversations();
    const before = (await client.getConversation(conv!.id)).length;
    await client.startAgentRun({ kind: 'compose', conversationId: conv!.id });
    const [proposal] = await client.listProposals('pending');
    expect(proposal!.kind).toBe('message');
    expect((await client.getConversation(conv!.id)).length).toBe(before);
    await client.decideProposal(proposal!.id, { decision: 'approve' });
    expect((await client.getConversation(conv!.id)).length).toBe(before + 1);
  });
});
