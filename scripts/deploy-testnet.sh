#!/usr/bin/env bash
# Deploy PROCTO shared-order to Stellar testnet and run one end-to-end scenario.
#
# Usage:  scripts/deploy-testnet.sh [--redeploy]
#
# Idempotent where reasonable:
#   - identities are generated only if missing
#   - SACs are deployed, "already exists" is ignored
#   - trustlines / mints are repeated safely (mint tops balances up to a floor)
#   - the contract is reused from deployments/testnet.json unless --redeploy
#   - the scenario always creates a NEW order (each run adds fresh evidence)
#
# Requires: stellar-cli, node (for JSON output). Never writes secret keys.
set -euo pipefail

export PATH="$HOME/.cargo/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/deployments/testnet.json"
NET=testnet
EXPLORER="https://stellar.expert/explorer/testnet"
USDC_ISSUER="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
ADMIN="procto-admin"
ISSUER="procto-issuer"
UNIT=10000000 # 7 decimals: 1 PUSD = 10^7 stroops

REDEPLOY=0
[[ "${1:-}" == "--redeploy" ]] && REDEPLOY=1

log() { printf '\n== %s\n' "$*" >&2; }

# Run a stellar command, echo its stdout, and remember the tx hash printed on stderr.
# Aborts with a clear message if a state-changing call did not report a hash.
HASHFILE="$(mktemp)"
trap 'rm -f "$HASHFILE"' EXIT
last_hash() { cat "$HASHFILE"; }
run() {
  local err
  err="$(mktemp)"
  local rc=0
  "$@" 2>"$err" || rc=$?
  # $(...) callers run this in a subshell, so persist the hash in a file.
  # The CLI prints "https://stellar.expert/explorer/<network>/tx/<hash>" after submission.
  grep -oE 'explorer/[a-z]+/tx/[0-9a-f]{64}' "$err" | tail -1 | awk -F/ '{print $NF}' >"$HASHFILE" || true
  if [[ $rc -ne 0 ]]; then
    cat "$err" >&2
    rm -f "$err"
    return $rc
  fi
  rm -f "$err"
}

ensure_identity() {
  local name="$1"
  if stellar keys address "$name" >/dev/null 2>&1; then
    echo "identity $name exists" >&2
  else
    stellar keys generate "$name" --network "$NET" --fund >&2
  fi
}

addr() { stellar keys address "$1"; }

# ---------------------------------------------------------------- identities
log "Identities"
ensure_identity "$ADMIN"
for id in "$ISSUER" procto-buyer procto-supplier-a procto-supplier-b procto-coordinator procto-investor; do
  ensure_identity "$id"
done
ISSUER_ADDR="$(addr "$ISSUER")"
BUYER="$(addr procto-buyer)"
SUP_A="$(addr procto-supplier-a)"
SUP_B="$(addr procto-supplier-b)"
COORD="$(addr procto-coordinator)"
INVESTOR="$(addr procto-investor)"
ADMIN_ADDR="$(addr "$ADMIN")"

# ---------------------------------------------------------------- contract
log "Build + deploy shared-order"
EXISTING_ID=""
if [[ -f "$OUT" && $REDEPLOY -eq 0 ]]; then
  EXISTING_ID="$(node -e 'try{console.log(require(process.argv[1]).contract.id||"")}catch(e){}' "$OUT")"
fi
if [[ -n "$EXISTING_ID" ]]; then
  CONTRACT_ID="$EXISTING_ID"
  echo "reusing contract $CONTRACT_ID (use --redeploy to replace)" >&2
else
  (cd "$ROOT/contracts" && stellar contract build >&2)
  WASM="$ROOT/contracts/target/wasm32v1-none/release/shared_order.wasm"
  CONTRACT_ID="$(run stellar contract deploy --wasm "$WASM" --source-account "$ADMIN" --network "$NET")"
  DEPLOY_HASH="$(last_hash)"
  echo "deployed $CONTRACT_ID (tx $DEPLOY_HASH)" >&2
fi

# ---------------------------------------------------------------- tokens
log "Token SACs"
# Circle testnet USDC (obtaining balance requires the Circle web faucet).
USDC_ASSET="USDC:$USDC_ISSUER"
USDC_SAC="$(stellar contract id asset --asset "$USDC_ASSET" --network "$NET")"
stellar contract asset deploy --asset "$USDC_ASSET" --source-account "$ADMIN" --network "$NET" >&2 \
  || echo "USDC SAC already deployed (ignored)" >&2

# Demo fallback asset PUSD issued by procto-issuer.
PUSD_ASSET="PUSD:$ISSUER_ADDR"
PUSD_SAC="$(stellar contract id asset --asset "$PUSD_ASSET" --network "$NET")"
stellar contract asset deploy --asset "$PUSD_ASSET" --source-account "$ADMIN" --network "$NET" >&2 \
  || echo "PUSD SAC already deployed (ignored)" >&2

log "Trustlines + mint PUSD"
for id in procto-buyer procto-supplier-a procto-supplier-b procto-coordinator procto-investor; do
  stellar tx new change-trust --line "$PUSD_ASSET" --source-account "$id" --network "$NET" >&2 \
    || echo "trustline for $id already set (ignored)" >&2
done
mint() { # mint <destination address> <whole units>
  stellar tx new payment --asset "$PUSD_ASSET" --destination "$1" --amount "$(( $2 * UNIT ))" \
    --source-account "$ISSUER" --network "$NET" >&2
}
mint "$BUYER" 5000
mint "$INVESTOR" 5000

# ---------------------------------------------------------------- scenario
log "Scenario: 3 shares, factoring, confirm all"
TOKEN="$PUSD_SAC"
DEADLINE=$(( $(date +%s) + 7 * 24 * 3600 ))
AMT_A=$(( 500 * UNIT )); AMT_B=$(( 300 * UNIT )); AMT_C=$(( 200 * UNIT ))
PRICE_B=$(( 285 * UNIT )) # 95% of share B
SHARES="[{\"supplier\":\"$SUP_A\",\"amount\":\"$AMT_A\",\"label\":\"Cutting and sewing\"},{\"supplier\":\"$SUP_B\",\"amount\":\"$AMT_B\",\"label\":\"Embroidery\"},{\"supplier\":\"$COORD\",\"amount\":\"$AMT_C\",\"label\":\"Coordination and QA\"}]"

inv() { # inv <source identity> <fn> [args...]
  local src="$1" fn="$2"
  shift 2
  run stellar contract invoke --id "$CONTRACT_ID" --source-account "$src" --network "$NET" --send yes -- "$fn" "$@"
  [[ -s "$HASHFILE" ]] || { echo "no tx hash captured for $fn" >&2; return 1; }
}

ORDER_ID="$(inv procto-buyer create_order --buyer "$BUYER" --token "$TOKEN" --shares "$SHARES" --deadline "$DEADLINE" | tr -d '"')"
TX_CREATE="$(last_hash)"; echo "order $ORDER_ID created: $TX_CREATE" >&2
inv procto-buyer fund --order_id "$ORDER_ID" >/dev/null;                                  TX_FUND="$(last_hash)"; echo "fund: $TX_FUND" >&2
inv procto-supplier-a mark_delivered --order_id "$ORDER_ID" --index 0 >/dev/null;         TX_DELIVERED_A="$(last_hash)"; echo "mark_delivered A: $TX_DELIVERED_A" >&2
inv procto-supplier-b offer_share --order_id "$ORDER_ID" --index 1 --price "$PRICE_B" >/dev/null; TX_OFFER="$(last_hash)"; echo "offer B: $TX_OFFER" >&2
inv procto-investor buy_share --order_id "$ORDER_ID" --index 1 --investor "$INVESTOR" >/dev/null; TX_BUY="$(last_hash)"; echo "buy B: $TX_BUY" >&2
inv procto-buyer confirm_delivery --order_id "$ORDER_ID" --index 0 >/dev/null;            TX_CONFIRM_0="$(last_hash)"; echo "confirm 0: $TX_CONFIRM_0" >&2
inv procto-buyer confirm_delivery --order_id "$ORDER_ID" --index 1 >/dev/null;            TX_CONFIRM_1="$(last_hash)"; echo "confirm 1: $TX_CONFIRM_1" >&2
inv procto-buyer confirm_delivery --order_id "$ORDER_ID" --index 2 >/dev/null;            TX_CONFIRM_2="$(last_hash)"; echo "confirm 2: $TX_CONFIRM_2" >&2

FINAL_ORDER="$(stellar contract invoke --id "$CONTRACT_ID" --source-account "$ADMIN" --network "$NET" --send no -- get_order --order_id "$ORDER_ID" 2>/dev/null)"

# ---------------------------------------------------------------- output
log "Write $OUT"
mkdir -p "$ROOT/deployments"
export OUT EXPLORER NET CONTRACT_ID DEPLOY_HASH="${DEPLOY_HASH:-}" USDC_ASSET USDC_SAC PUSD_ASSET PUSD_SAC \
  ADMIN_ADDR ISSUER_ADDR BUYER SUP_A SUP_B COORD INVESTOR ORDER_ID DEADLINE FINAL_ORDER \
  TX_CREATE TX_FUND TX_DELIVERED_A TX_OFFER TX_BUY TX_CONFIRM_0 TX_CONFIRM_1 TX_CONFIRM_2
node -e '
const fs = require("fs");
const e = process.env;
const prev = fs.existsSync(e.OUT) ? JSON.parse(fs.readFileSync(e.OUT, "utf8")) : {};
const tx = (hash) => ({ hash, url: `${e.EXPLORER}/tx/${hash}` });
const out = {
  network: e.NET,
  contract: {
    id: e.CONTRACT_ID,
    url: `${e.EXPLORER}/contract/${e.CONTRACT_ID}`,
    deploy_tx: e.DEPLOY_HASH ? tx(e.DEPLOY_HASH) : (prev.contract && prev.contract.deploy_tx) || null,
  },
  tokens: {
    usdc: { asset: e.USDC_ASSET, sac: e.USDC_SAC, url: `${e.EXPLORER}/contract/${e.USDC_SAC}`, note: "Circle testnet USDC; balance requires the Circle web faucet" },
    pusd: { asset: e.PUSD_ASSET, sac: e.PUSD_SAC, url: `${e.EXPLORER}/contract/${e.PUSD_SAC}`, note: "Demo fallback asset issued by procto-issuer, 7 decimals" },
  },
  identities: {
    "procto-admin": e.ADMIN_ADDR,
    "procto-issuer": e.ISSUER_ADDR,
    "procto-buyer": e.BUYER,
    "procto-supplier-a": e.SUP_A,
    "procto-supplier-b": e.SUP_B,
    "procto-coordinator": e.COORD,
    "procto-investor": e.INVESTOR,
  },
  scenario: {
    description: "3 shares (A 500, B 300, coordinator 200 PUSD); B sold to investor at 95% (285); buyer confirms all",
    order_id: Number(e.ORDER_ID),
    deadline: Number(e.DEADLINE),
    token: e.PUSD_SAC,
    txs: {
      create_order: tx(e.TX_CREATE),
      fund: tx(e.TX_FUND),
      mark_delivered_a: tx(e.TX_DELIVERED_A),
      offer_share_b: tx(e.TX_OFFER),
      buy_share_b: tx(e.TX_BUY),
      confirm_delivery_0: tx(e.TX_CONFIRM_0),
      confirm_delivery_1: tx(e.TX_CONFIRM_1),
      confirm_delivery_2: tx(e.TX_CONFIRM_2),
    },
    final_order: JSON.parse(e.FINAL_ORDER),
  },
  previous_scenarios: [
    ...(prev.previous_scenarios || []),
    ...(prev.scenario ? [{ ...prev.scenario, final_order: undefined }] : []),
  ],
  generated_at: new Date().toISOString(),
};
fs.writeFileSync(e.OUT, JSON.stringify(out, null, 2) + "\n");
'
echo "Done. Contract: $EXPLORER/contract/$CONTRACT_ID" >&2
