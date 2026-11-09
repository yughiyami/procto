# PROCTO

**Protected payments for shared orders.** PROCTO is the evolution of NEXO (formerly "Izumi · Pedido Compartido"),
the shared-order tool for Peruvian micro and small enterprises (MSEs). It was built for the Stellar 48h hackathon
(Scale track).

> The UI is in Spanish on purpose: the users are textile workshops in Arequipa and their buyers in Lima.
> Code, comments and this README are in English.

## The problem

A coordinating MSE answers an order it cannot fulfil alone, so it combines several workshops (knitting, embroidery,
her own production). Today the buyer pays the coordinator 30 to 60 days after delivery, and the coordinator pays the
workshops even later. **The workshops end up financing the coordinator.**

## The idea

**The accepted quote is the payment instruction.**

1. The buyer accepts the quote. PROCTO splits the price into one payment per workshop plus the coordinator's share.
2. The buyer deposits the full amount into a Soroban contract. Nobody can touch it until delivery is confirmed.
3. When the buyer confirms a delivery, that share is paid straight to the workshop's account.
4. A workshop that needs cash earlier can sell its (already funded) claim at a small discount to an investor. The
   investor only bears delivery risk, not the buyer's credit risk.

## How Stellar is used

| Piece | What it does |
| --- | --- |
| **Soroban contract** `contracts/shared-order` | Escrow + split + claim factoring. Non-upgradable, no admin keys. Events for every state change. See [contracts/README.md](contracts/README.md). |
| **SAC tokens** | Settlement in the Stellar Asset Contract of Circle's testnet **USDC** or the demo asset **PUSD**. The demo flow uses PUSD because Circle's faucet is web-only. |
| **Fee sponsorship (fee-bump)** | Users never need XLM. They sign; a serverless function wraps their signed transaction in a fee bump paid by a sponsor account. See below. |
| **Stellar Wallets Kit** | `@creit.tech/stellar-wallets-kit` v2: Freighter, xBull, Albedo, LOBSTR, Hana, Rabet and more. |
| **Contract events** | The "Historial en la red" timeline and the verifiable receipt read contract events through Soroban RPC. |
| **stellar.expert** | Every step links to a public record. |

### Fee sponsorship

`apps/web/api/sponsor.ts` (Vercel Node.js function, Web `Request`/`Response` signature) receives a transaction that
the user already signed and:

1. rejects anything that is not exactly one operation that either invokes **our contract** (an allow-listed function)
   or adds a **PUSD/USDC trustline**;
2. verifies the user's signature, caps the fee, refuses a sponsor-as-source transaction, rate-limits per source account;
3. wraps it in a fee bump signed with `SPONSOR_SECRET`, submits it through Soroban RPC and returns the hash.

The sponsor never signs the inner transaction and never touches user funds. The core logic is in
`apps/web/api/_lib/sponsor.ts` and is unit-tested. If the endpoint is unreachable the client falls back to
user-paid fees and tells the user in plain language.

`apps/web/api/faucet.ts` mints demo PUSD (testnet only) to a prepared account. It needs `ISSUER_SECRET`, refuses
accounts that already hold 20,000 PUSD and rate-limits per address.

### Currency

Amounts are PEN cents in the app. The chain amounts use a **fixed demo FX rate of S/ 3.75 per 1 USD token**
(`apps/web/src/stellar/units.ts`). It is a demonstration constant, not a market rate.

## Architecture

```
apps/web
  src/store/     Browser local store (offline-first). Same method surface as the old HTTP client,
                 backed by localStorage; browser port of apps/api/src/domain.ts (WebCrypto hash chain).
  src/stellar/   Framework-free chain layer: contract calls, sponsorship client, balances, events,
                 units, share mapping, factoring math, wallet access.
  src/session/   Roles (Coordinadora, Comprador, Proveedor, Inversionista) and one wallet slot per role.
  src/pages/     Landing, orders (with the "Cobro protegido" panel), provider, investor, receipt.
  api/           Vercel functions: sponsor.ts and faucet.ts (+ _lib with the tested core).
  scripts/       e2e-testnet.ts: end-to-end proof against Stellar testnet.
packages/shared-order-client   Generated TypeScript bindings of the contract.
contracts/                     Soroban contract (unchanged during the hackathon web work).
apps/api                       Original Fastify/Postgres backend (NEXO). Not used by PROCTO's web app.
```

The web app does **not** need the NEXO API: orders, suppliers and the link to the on-chain order live in the browser.
Provider and investor views read directly from the contract, so they work from any device.

## Run locally

Requirements: Node 22+, pnpm 11.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill SPONSOR_SECRET and ISSUER_SECRET
pnpm dev:web                                    # http://localhost:5173 (also serves /api/sponsor and /api/faucet)
```

Other commands:

```bash
pnpm -r typecheck
pnpm --filter @izumi/web test        # vitest
pnpm --filter @izumi/web build
pnpm --filter @izumi/web e2e         # real transactions on testnet (see below)
```

### Environment variables (server side only, never `VITE_`-prefixed)

| Variable | Required | Purpose |
| --- | --- | --- |
| `SPONSOR_SECRET` | yes | Secret of a funded testnet account that pays network fees (fee bump). |
| `ISSUER_SECRET` | for the faucet | Secret of the PUSD issuer (`GDT7NYOJ...5UCP`). |
| `SOROBAN_RPC_URL`, `HORIZON_URL` | no | Override the public testnet endpoints. |

`.env.local` is gitignored. Generate a sponsor with `stellar keys generate procto-sponsor --network testnet --fund`.

### One-tap demo

Open **https://procto-lovat.vercel.app/demo** (or `/demo?rol=comprador|proveedor|inversionista|coordinadora`, add
`&tour=0` to skip the guided tour). It creates the five quick wallets, prepares each account (sponsored), loads demo
money, accepts the quote of "300 chompas de alpaca" and activates the protected payment, with retries for testnet lag.
It is idempotent, and "Reiniciar demo" (in Mi billetera) rebuilds the sample order while keeping the wallets.

### The demo, step by step

1. Open the app and pick **Comprador**, press "Crear billetera rápida" (or connect Freighter, xBull, ...), then
   "Preparar mi cuenta" and "Cargar saldo de prueba" in **Mi billetera**.
2. As **Coordinadora** open the seeded order "300 chompas de alpaca para tienda en Lima" and accept the quote.
3. In the **Cobro protegido** tab press "Usar billeteras de demostración", then (as Comprador) "Activar cobro
   protegido" and "Depositar pago".
4. As **Proveedor** mark the delivery and press "Pedir adelanto"; as **Inversionista** press "Comprar este adelanto".
5. As Comprador confirm each delivery. Open the **Comprobante** and follow the stellar.expert links.

Quick wallets are throw-away testnet keys stored in the browser. They exist only so anyone can try the flow in a
minute; see "Mainnet route".

## Feature status

Legend: **on-chain** = enforced by the Soroban contract or read from it; **off-chain** = lives in the browser
(localStorage); **sample** = works with clearly labelled example data; **credentials** = needs an outside account.

| Feature | Where | Where it runs | Status |
| --- | --- | --- | --- |
| Protected payment: deposit, split by contribution, pay on delivery, refund after deadline | Pedidos > Cobro protegido | on-chain | working |
| Advances (sell a funded share at a discount) | Mis cobros, Adelantos | on-chain | working |
| Verifiable receipt with stellar.expert links | Comprobante | on-chain | working |
| Fee sponsorship and demo money | `/api/sponsor`, `/api/faucet` | serverless + on-chain | working |
| **Ficha de cumplimiento** (earned badge: Bronce, Plata, Oro) | `/ficha/:address` | computed from contract state | working |
| **Platform commission** 3% (2% PRO) as an automatic share; 8% of it to the impact fund as its own share | Cobro protegido, Comprobante | on-chain (no contract change) | working |
| Verified profile, PRO toggle (US$ 240/yr, no real billing) | Mi negocio y PRO | off-chain | working (billing not implemented) |
| Orders, quotes, contributions, deliveries, cash book, evidence chain | Pedidos, Caja | off-chain | working |
| Suppliers and performance | Proveedores | off-chain | working |
| Chat with clients and workshops | Conversaciones | off-chain simulator | working with sample data; **WhatsApp Business needs credentials** |
| Proposals (an assistant suggests, a person approves) | Propuestas | off-chain, rules in the browser | working |
| Inbox and request drafts from messages | Bandeja | off-chain, rules in the browser | working |
| Financial draft from free text | Caja del pedido | off-chain, rules in the browser | working |
| Sales pipeline | Ventas | off-chain | working |
| Directory of companies with sources, import, interest map | Directorio y RFQ | off-chain | working with sample data |
| RFQ repository | Directorio y RFQ | off-chain | working with sample data |
| Global directories (Trade Map, TradeAtlas) live lookup | Directorio y RFQ > Fuentes | not connected | **credentials** |
| **PACO** assistant | PACO, `/api/paco` | serverless via Vercel AI Gateway; scripted fallback | working (falls back to a basic guide if the gateway is unavailable) |
| PACO by voice | PACO por voz | Vapi in the browser | **credentials** (`VITE_VAPI_PUBLIC_KEY`, assistant ids) |
| Guided tour, one-tap demo | `/demo`, "?" | off-chain | working |
| Gremios (guilds of workshops) and Pedido Compartido | Gremios, Pedidos (shared order with several workshops, invitations by link) | off-chain + on-chain payment | working (a guild is a local grouping with one sample guild); a guild-level shared account is not implemented |

### Business model on-chain

When the buyer activates the protected payment, the split adds two shares next to the workshops and the coordinator:
the **PROCTO commission** (3% of the sale, 2% if the coordinator is PRO, taken out of the coordinator's share) and the
**impact fund** (8% of that commission, reforestation and Andean communities through PRISMA). Both are ordinary
shares of the same order, so the receipt shows them and no contract change was needed. The two accounts are testnet
identities (`procto-treasury`, `procto-impact`) whose **public** keys are in `apps/web/src/stellar/platform.ts`; the
secrets stay in stellar-cli.

### PACO

`apps/web/api/paco.ts` calls the AI SDK with a plain `provider/model` string through Vercel AI Gateway. On Vercel it
authenticates with the project's OIDC token; locally run `vercel env pull` (or set `AI_GATEWAY_API_KEY`). The request
carries the person's role, orders and payment state (sanitized, size-capped). The endpoint is rate limited (12
questions a minute per caller) and always answers: if the gateway is missing or fails, scripted guidance in
`src/paco/guidance.ts` replies instead.

## Testnet ids and links

- Contract: [`CC6KIYZ4BZXVG4XT33XIF7PNSHDGY65VWV6ZWSUG56JEVB6VRFENJP6T`](https://stellar.expert/explorer/testnet/contract/CC6KIYZ4BZXVG4XT33XIF7PNSHDGY65VWV6ZWSUG56JEVB6VRFENJP6T)
- Circle USDC SAC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
- Demo PUSD SAC: `CDF6OL357YMHTV55HBBPDRTRHDIXSL3XUX7PYQA7FTQQATVPSH4OXSLD` (issuer `GDT7NYOJZJFLOVQ5VMTFRWQXUY4EK7A63NSHMOYBE22DWV74CTJP5UCP`)
- More in [deployments/testnet.json](deployments/testnet.json).

## Built after the `kickoff` tag

- Soroban `shared-order` contract, deploy script, bindings (see `git log kickoff..`).
- Web app decoupled from the API: local store, seeded Arequipa textile scenario, no login.
- Stellar layer: Wallets Kit, contract client, fee sponsorship, faucet, account onboarding, events.
- Screens: landing "Cómo funciona", Cobro protegido, provider (deliver, request advance), investor (buy advance),
  verifiable receipt, role switcher.
- Tests: units, share mapping, factoring, share state, sponsor validation, faucet eligibility, local store.
- Phase 2 (see "Feature status" below): Ficha de cumplimiento, platform commission with impact share, restored NEXO
  sections on a local store, PACO assistant, grouped navigation.
- Removed on purpose: the **EVM blockchain pages** (Sepolia / Minkaly escrow, local Hardhat demo, WhatsApp-purchase
  panel). They are superseded by the Stellar contract: the same job (escrow, release, evidence) now runs on Soroban,
  so keeping a second, unrelated chain in the UI only confused the story. Their code is still in the `kickoff` tag.
- Removed because there are no accounts: `/login` and the mobile demo gateway. Identity is the wallet.

## Mainnet route

1. **Asset**: switch the settlement token to Circle's **USDC on mainnet** (the contract is token-agnostic). Drop PUSD
   and the faucet.
2. **Off-ramp**: workshops cash out USDC to PEN through a **SEP-24** anchor with a Peruvian bank rail. The FX rate would
   come from a **SEP-38** quote instead of the fixed demo rate.
3. **Auth**: **SEP-10** web authentication for the coordinator and buyer dashboards (the local store becomes
   a synced backend).
4. **Wallets**: replace "quick wallets" with **passkey smart wallets** so workshops sign with their phone biometrics,
   and use sponsored reserves so new accounts need no XLM at all.
5. **Contract**: audit the contract, add a longer TTL strategy and a dispute/arbitration path, then deploy to mainnet.
6. **Sponsor**: run the fee-bump sponsor with a funded mainnet account, per-user quotas and monitoring.

## Honest limits

- Testnet only. PUSD has no value; the FX rate is fixed.
- Delivery confirmation is the buyer's decision (by design). There is no dispute resolution yet; after the deadline
  anyone can trigger a refund of unpaid shares to the buyer.
- An investor who buys an advance bears delivery risk: if the buyer never confirms before the deadline, the funds
  are refunded to the buyer.
- The chat simulator never sends to a real phone. Directory, RFQ and chat seeds are examples, not real contacts.
- Orders, suppliers and quotes live in the browser's localStorage (per device). The on-chain state is shared;
  the commercial details are not synced between devices.
- Quick wallets keep a secret key in localStorage. That is acceptable for testnet demos only.
- The fee-sponsor rate limit is in memory per function instance (best effort). Production needs a shared store.
- The contract was not independently audited. Original NEXO modules (`apps/api`) are kept for history and are not
  part of the PROCTO demo.
- Serverless functions use `.js` relative import extensions for Node ESM.

## Deployment

Deployed at https://procto-lovat.vercel.app (Vercel project `procto`, `npx vercel deploy --prod` from the repo root;
`.vercelignore` keeps contracts and the old API out). Set `SPONSOR_SECRET` and `ISSUER_SECRET` in the Vercel project;
PACO uses the project's OIDC token automatically.
