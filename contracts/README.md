# PROCTO contracts

Soroban smart contracts for PROCTO, built on top of NEXO's "shared order"
(pedido compartido) flow.

## The problem and the premise

When a coordinating micro/small enterprise (MSE) answers an order it cannot
fulfil alone, it combines several workshops. Today the coordinator collects the
buyer's money and pays the workshops weeks later, on trust. The workshops end up
financing the coordinator.

PROCTO's premise: **the accepted quote is the payment instruction.** The buyer
locks the full amount in escrow when the order is accepted, and each supplier's
slice is released straight to that supplier when the buyer confirms delivery.
Nobody in the middle holds supplier money.

## `shared-order`

One contract instance serves all orders. It is non-upgradable, has no admin
keys, and uses any SEP-41 token (in practice a Stellar Asset Contract: USDC or
the demo asset PUSD).

### Functions

| Function | Auth | Description |
| --- | --- | --- |
| `create_order(buyer, token, shares: Vec<ShareInput>, deadline) -> u64` | buyer | Validates input, computes the total, stores the order as `Created`. Ids start at 1. |
| `fund(order_id)` | buyer | Transfers the total from the buyer into the contract. `Created -> Funded`. Only before the deadline. |
| `mark_delivered(order_id, index)` | share's original supplier | Sets `delivered = true`. A signal only; moves no money. |
| `confirm_delivery(order_id, index)` | buyer | Pays the share amount to the **current owner** of the claim. When all shares are paid, `Funded -> Completed`. |
| `offer_share(order_id, index, price)` | current owner | Offers the claim at `0 < price <= amount`. Funded orders, unpaid shares only. Re-offering replaces the price. |
| `cancel_offer(order_id, index)` | current owner | Withdraws the open offer. |
| `buy_share(order_id, index, investor)` | investor | Moves `price` from the investor to the current owner, and the investor becomes the owner. Before the deadline only. |
| `refund_expired(order_id)` | anyone | After the deadline, returns every unpaid share amount to the buyer. |
| `get_order(order_id) -> Order` | none | Full order with shares. |
| `order_count() -> u64` | none | Number of orders created. |

`ShareInput { supplier, amount, label }`.
`Share { supplier, owner, amount, label, delivered, paid, refunded, offer_price: Option<i128> }`.
`Order { buyer, token, total, released, refunded, deadline, status, shares }`.
`OrderStatus = Created | Funded | Completed | Refunded | PartiallyRefunded`.

Amounts are in the token's smallest unit (7 decimals for Stellar classic assets
wrapped as SACs). Deadlines are ledger timestamps in seconds.

### Design decisions

- **Buyer acceptance is what matters.** `confirm_delivery` works even if the
  supplier never called `mark_delivered`. `delivered` is informational for the UI.
- **Payment goes to the current owner.** Factoring changes who is paid, never how
  much: the owner always receives the full share amount.
- **Checks-effects-interactions.** State is written before every token transfer.
- **Bounded orders.** At most 20 shares per order.
- **Persistent storage with TTL extension.** Orders live in persistent storage
  and are bumped to 30 days (threshold 7 days) on every write; the counter lives
  in instance storage. Anyone can extend TTL externally for longer-lived orders.
- **Events for every state change** (`OrderCreated`, `OrderFunded`,
  `ShareDelivered`, `SharePaid`, `OrderCompleted`, `ShareOffered`,
  `OfferCancelled`, `ShareSold`, `OrderRefunded`), using `#[contractevent]`.
  They feed the UI timeline and stellar.expert evidence.
- **Typed errors** via `#[contracterror]` (`Error` enum, codes 1-15).

### Invariants

1. `sum(share.amount) == order.total` and never changes after creation.
2. Contract token balance attributable to an order is
   `total - released - refunded` while `Funded`, and `0` once `Completed` or
   refunded.
3. A share is paid at most once, and never after being refunded
   (`paid` and `refunded` are mutually exclusive).
4. Money only moves: buyer -> contract (`fund`), contract -> share owner
   (`confirm_delivery`), investor -> previous owner (`buy_share`), contract ->
   buyer (`refund_expired`).
5. Only the buyer can release funds; only the owner can sell or withdraw a claim.
6. `released + refunded <= total`.

### Risk model

- **Supplier risk:** none from the buyer's credit, since funds are locked before
  work starts. The remaining risk is the buyer refusing to confirm until the
  deadline and then refunding. Mitigation is off-chain (reputation, evidence of
  delivery via `mark_delivered`, advance sale to an investor).
- **Buyer risk:** funds are locked until the deadline unless the buyer confirms.
  After the deadline, anyone can trigger the refund.
- **Investor risk:** the investor buys a claim whose payment is already locked in
  escrow, so credit risk of the buyer is removed. **The only risk is delivery.**
  If the buyer does not confirm before the deadline, the unpaid amount is
  refunded to the buyer and an investor holding that share loses what it paid.
  Offers are not allowed on or after the deadline.
- **Timing race:** `confirm_delivery` is still allowed after the deadline until
  someone calls `refund_expired`; whichever transaction lands first wins.
- **Out of scope:** disputes and partial acceptance, upgrades, admin
  intervention, fee collection, on-chain identity of suppliers. A malicious or
  non-standard token could misbehave; use trusted SACs only.

## Develop

Requires Rust with the `wasm32v1-none` target and `stellar-cli`.

```sh
cd contracts
cargo test                 # unit tests (soroban-sdk testutils)
stellar contract build     # writes target/wasm32v1-none/release/shared_order.wasm (optimized)
```

The test suite covers: the happy path with exact balances, factoring at 95%,
resale chains, offer cancellation and price bounds, double payment, unfunded and
expired orders, refunds (full and partial) including investor delivery risk, TTL
extension, and explicit authorization tests that use `mock_auths` with specific
signers (no `mock_all_auths`) to prove wrong signers are rejected.

## Deploy to testnet

```sh
scripts/deploy-testnet.sh            # reuse the deployed contract if recorded
scripts/deploy-testnet.sh --redeploy # deploy a fresh contract
```

The script generates demo identities (`procto-*`), deploys the contract and the
token SACs (Circle testnet USDC and the demo asset PUSD issued by
`procto-issuer`), sets trustlines, mints PUSD, runs one full scenario on-chain,
and writes `deployments/testnet.json` (contract id, token ids, public keys and
transaction hashes with stellar.expert links). Secret keys stay in the Stellar
CLI keystore and are never written to the repo.

TypeScript bindings for the web app are generated into
`packages/shared-order-client`:

```sh
stellar contract bindings typescript --network testnet \
  --contract-id <contract id> --output-dir packages/shared-order-client
```
