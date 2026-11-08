#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{
        storage::Persistent as _, Address as _, Events as _, Ledger, MockAuth, MockAuthInvoke,
    },
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, IntoVal, String, Vec,
};

const DEADLINE: u64 = 10_000;

struct Fixture<'a> {
    env: Env,
    client: SharedOrderClient<'a>,
    contract_id: Address,
    token: TokenClient<'a>,
    buyer: Address,
    sup_a: Address,
    sup_b: Address,
    coord: Address,
    investor: Address,
}

fn setup<'a>(mock_auths: bool) -> Fixture<'a> {
    let env = Env::default();
    if mock_auths {
        env.mock_all_auths();
    }
    env.ledger().with_mut(|l| l.timestamp = 1_000);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token = TokenClient::new(&env, &sac.address());
    let admin = StellarAssetClient::new(&env, &sac.address());

    let contract_id = env.register(SharedOrder, ());
    let client = SharedOrderClient::new(&env, &contract_id);

    let buyer = Address::generate(&env);
    let investor = Address::generate(&env);
    // Minting is an issuer operation; authorize it even in the strict-auth fixture.
    env.mock_all_auths();
    admin.mint(&buyer, &10_000);
    admin.mint(&investor, &10_000);
    if !mock_auths {
        env.set_auths(&[]);
    }

    Fixture {
        client,
        contract_id,
        token,
        buyer,
        sup_a: Address::generate(&env),
        sup_b: Address::generate(&env),
        coord: Address::generate(&env),
        investor,
        env,
    }
}

fn shares(f: &Fixture) -> Vec<ShareInput> {
    vec![
        &f.env,
        ShareInput {
            supplier: f.sup_a.clone(),
            amount: 500,
            label: String::from_str(&f.env, "Cutting and sewing"),
        },
        ShareInput {
            supplier: f.sup_b.clone(),
            amount: 300,
            label: String::from_str(&f.env, "Embroidery"),
        },
        ShareInput {
            supplier: f.coord.clone(),
            amount: 200,
            label: String::from_str(&f.env, "Coordination"),
        },
    ]
}

fn funded_order(f: &Fixture) -> u64 {
    let id = f
        .client
        .create_order(&f.buyer, &f.token.address, &shares(f), &DEADLINE);
    f.client.fund(&id);
    id
}

#[test]
fn create_order_computes_total_and_emits_state() {
    let f = setup(true);
    let id = f
        .client
        .create_order(&f.buyer, &f.token.address, &shares(&f), &DEADLINE);
    assert_eq!(id, 1);
    // One OrderCreated event, read before any other invocation resets the buffer.
    assert_eq!(f.env.events().all().events().len(), 1);
    assert_eq!(f.client.order_count(), 1);
    let o = f.client.get_order(&id);
    assert_eq!(o.total, 1_000);
    assert_eq!(o.status, OrderStatus::Created);
    assert_eq!(o.shares.len(), 3);
    let s0 = o.shares.get(0).unwrap();
    assert_eq!(s0.owner, f.sup_a);
    assert!(!s0.paid && !s0.delivered && s0.offer_price.is_none());
    // No funds moved yet.
    assert_eq!(f.token.balance(&f.buyer), 10_000);
}

#[test]
fn create_order_validates_input() {
    let f = setup(true);
    let empty: Vec<ShareInput> = Vec::new(&f.env);
    assert_eq!(
        f.client
            .try_create_order(&f.buyer, &f.token.address, &empty, &DEADLINE),
        Err(Ok(Error::NoShares))
    );
    let zero = vec![
        &f.env,
        ShareInput {
            supplier: f.sup_a.clone(),
            amount: 0,
            label: String::from_str(&f.env, "x"),
        },
    ];
    assert_eq!(
        f.client
            .try_create_order(&f.buyer, &f.token.address, &zero, &DEADLINE),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        f.client
            .try_create_order(&f.buyer, &f.token.address, &shares(&f), &1_000),
        Err(Ok(Error::InvalidDeadline))
    );
    let huge = vec![
        &f.env,
        ShareInput {
            supplier: f.sup_a.clone(),
            amount: i128::MAX,
            label: String::from_str(&f.env, "x"),
        },
        ShareInput {
            supplier: f.sup_b.clone(),
            amount: 1,
            label: String::from_str(&f.env, "y"),
        },
    ];
    assert_eq!(
        f.client
            .try_create_order(&f.buyer, &f.token.address, &huge, &DEADLINE),
        Err(Ok(Error::Overflow))
    );
}

#[test]
fn happy_path_pays_every_supplier_exactly() {
    let f = setup(true);
    let id = funded_order(&f);
    assert_eq!(f.token.balance(&f.buyer), 9_000);
    assert_eq!(f.token.balance(&f.contract_id), 1_000);
    assert_eq!(f.client.get_order(&id).status, OrderStatus::Funded);

    f.client.mark_delivered(&id, &0);
    assert!(f.client.get_order(&id).shares.get(0).unwrap().delivered);

    f.client.confirm_delivery(&id, &0);
    f.client.confirm_delivery(&id, &1);
    assert_eq!(f.client.get_order(&id).status, OrderStatus::Funded);
    // Buyer acceptance suffices even though the coordinator never marked delivery.
    f.client.confirm_delivery(&id, &2);
    // Last confirmation emits SharePaid + OrderCompleted (plus the token transfer event).
    assert!(f.env.events().all().events().len() >= 2);

    let o = f.client.get_order(&id);
    assert_eq!(o.status, OrderStatus::Completed);
    assert_eq!(o.released, 1_000);
    assert_eq!(f.token.balance(&f.sup_a), 500);
    assert_eq!(f.token.balance(&f.sup_b), 300);
    assert_eq!(f.token.balance(&f.coord), 200);
    assert_eq!(f.token.balance(&f.contract_id), 0);
    assert_eq!(f.token.balance(&f.buyer), 9_000);
}

#[test]
fn factoring_investor_receives_full_amount() {
    let f = setup(true);
    let id = funded_order(&f);

    // Supplier B sells its 300 claim at 95% (285).
    f.client.offer_share(&id, &1, &285);
    assert_eq!(
        f.client.get_order(&id).shares.get(1).unwrap().offer_price,
        Some(285)
    );
    f.client.buy_share(&id, &1, &f.investor);
    assert_eq!(f.token.balance(&f.sup_b), 285);
    assert_eq!(f.token.balance(&f.investor), 10_000 - 285);
    let s = f.client.get_order(&id).shares.get(1).unwrap();
    assert_eq!(s.owner, f.investor);
    assert_eq!(s.supplier, f.sup_b);
    assert!(s.offer_price.is_none());

    f.client.confirm_delivery(&id, &0);
    f.client.confirm_delivery(&id, &1);
    f.client.confirm_delivery(&id, &2);

    assert_eq!(f.token.balance(&f.investor), 10_000 - 285 + 300);
    assert_eq!(f.token.balance(&f.sup_b), 285);
    assert_eq!(f.token.balance(&f.sup_a), 500);
    assert_eq!(f.token.balance(&f.contract_id), 0);
    assert_eq!(f.client.get_order(&id).status, OrderStatus::Completed);
}

#[test]
fn resale_chain_pays_latest_owner() {
    let f = setup(true);
    let id = funded_order(&f);
    let investor2 = Address::generate(&f.env);
    StellarAssetClient::new(&f.env, &f.token.address).mint(&investor2, &1_000);

    f.client.offer_share(&id, &1, &280);
    f.client.buy_share(&id, &1, &f.investor);
    f.client.offer_share(&id, &1, &290); // investor re-sells
    f.client.buy_share(&id, &1, &investor2);
    f.client.confirm_delivery(&id, &1);

    assert_eq!(f.token.balance(&f.sup_b), 280);
    assert_eq!(f.token.balance(&f.investor), 10_000 - 280 + 290);
    assert_eq!(f.token.balance(&investor2), 1_000 - 290 + 300);
}

#[test]
fn cancel_offer_blocks_purchase() {
    let f = setup(true);
    let id = funded_order(&f);
    f.client.offer_share(&id, &1, &285);
    f.client.cancel_offer(&id, &1);
    assert!(f
        .client
        .get_order(&id)
        .shares
        .get(1)
        .unwrap()
        .offer_price
        .is_none());
    assert_eq!(
        f.client.try_buy_share(&id, &1, &f.investor),
        Err(Ok(Error::NoOffer))
    );
    assert_eq!(
        f.client.try_cancel_offer(&id, &1),
        Err(Ok(Error::NoOffer))
    );
}

#[test]
fn offer_price_bounds() {
    let f = setup(true);
    let id = funded_order(&f);
    assert_eq!(
        f.client.try_offer_share(&id, &1, &301),
        Err(Ok(Error::InvalidPrice))
    );
    assert_eq!(
        f.client.try_offer_share(&id, &1, &0),
        Err(Ok(Error::InvalidPrice))
    );
    assert_eq!(
        f.client.try_offer_share(&id, &1, &-5),
        Err(Ok(Error::InvalidPrice))
    );
    // Selling exactly at par is allowed.
    f.client.offer_share(&id, &1, &300);
}

#[test]
fn cannot_buy_unfunded_order_or_offer_on_it() {
    let f = setup(true);
    let id = f
        .client
        .create_order(&f.buyer, &f.token.address, &shares(&f), &DEADLINE);
    assert_eq!(
        f.client.try_offer_share(&id, &1, &285),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        f.client.try_buy_share(&id, &1, &f.investor),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        f.client.try_confirm_delivery(&id, &1),
        Err(Ok(Error::InvalidState))
    );
}

#[test]
fn cannot_buy_own_offer() {
    let f = setup(true);
    let id = funded_order(&f);
    f.client.offer_share(&id, &1, &285);
    assert_eq!(
        f.client.try_buy_share(&id, &1, &f.sup_b),
        Err(Ok(Error::SelfPurchase))
    );
}

#[test]
fn double_payment_fails() {
    let f = setup(true);
    let id = funded_order(&f);
    f.client.confirm_delivery(&id, &0);
    assert_eq!(
        f.client.try_confirm_delivery(&id, &0),
        Err(Ok(Error::AlreadyPaid))
    );
    assert_eq!(f.token.balance(&f.sup_a), 500);
    // A paid share cannot be offered or bought either.
    assert_eq!(
        f.client.try_offer_share(&id, &0, &400),
        Err(Ok(Error::AlreadyPaid))
    );
}

#[test]
fn cannot_fund_twice_or_confirm_unknown_share() {
    let f = setup(true);
    let id = funded_order(&f);
    assert_eq!(f.client.try_fund(&id), Err(Ok(Error::InvalidState)));
    assert_eq!(
        f.client.try_confirm_delivery(&id, &9),
        Err(Ok(Error::ShareNotFound))
    );
    assert_eq!(
        f.client.try_get_order(&99),
        Err(Ok(Error::OrderNotFound))
    );
}

#[test]
fn mark_delivered_twice_fails() {
    let f = setup(true);
    let id = funded_order(&f);
    f.client.mark_delivered(&id, &0);
    assert_eq!(
        f.client.try_mark_delivered(&id, &0),
        Err(Ok(Error::AlreadyDelivered))
    );
}

#[test]
fn refund_after_deadline_returns_unpaid_amounts() {
    let f = setup(true);
    let id = funded_order(&f);
    f.client.confirm_delivery(&id, &0); // 500 paid out
    f.client.offer_share(&id, &1, &285);

    assert_eq!(
        f.client.try_refund_expired(&id),
        Err(Ok(Error::NotExpired))
    );
    f.env.ledger().with_mut(|l| l.timestamp = DEADLINE + 1);
    f.client.refund_expired(&id);

    let o = f.client.get_order(&id);
    assert_eq!(o.status, OrderStatus::PartiallyRefunded);
    assert_eq!(o.refunded, 500);
    assert_eq!(f.token.balance(&f.buyer), 9_000 + 500);
    assert_eq!(f.token.balance(&f.sup_a), 500);
    assert_eq!(f.token.balance(&f.contract_id), 0);
    assert!(o.shares.get(1).unwrap().refunded);
    assert!(o.shares.get(1).unwrap().offer_price.is_none());
    // Nothing further can move.
    assert_eq!(
        f.client.try_confirm_delivery(&id, &1),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        f.client.try_refund_expired(&id),
        Err(Ok(Error::InvalidState))
    );
}

#[test]
fn full_refund_when_nothing_paid_and_investor_bears_delivery_risk() {
    let f = setup(true);
    let id = funded_order(&f);
    f.client.offer_share(&id, &1, &285);
    f.client.buy_share(&id, &1, &f.investor);

    f.env.ledger().with_mut(|l| l.timestamp = DEADLINE);
    f.client.refund_expired(&id); // anyone can call; mock_all_auths needs none
    let o = f.client.get_order(&id);
    assert_eq!(o.status, OrderStatus::Refunded);
    assert_eq!(f.token.balance(&f.buyer), 10_000);
    // Investor paid 285 and got nothing back: delivery risk.
    assert_eq!(f.token.balance(&f.investor), 10_000 - 285);
    assert_eq!(f.token.balance(&f.sup_b), 285);
}

#[test]
fn expired_orders_cannot_be_funded_or_bought() {
    let f = setup(true);
    let id = f
        .client
        .create_order(&f.buyer, &f.token.address, &shares(&f), &DEADLINE);
    f.env.ledger().with_mut(|l| l.timestamp = DEADLINE + 1);
    assert_eq!(f.client.try_fund(&id), Err(Ok(Error::Expired)));

    let f2 = setup(true);
    let id2 = funded_order(&f2);
    f2.client.offer_share(&id2, &1, &285);
    f2.env.ledger().with_mut(|l| l.timestamp = DEADLINE + 1);
    assert_eq!(
        f2.client.try_buy_share(&id2, &1, &f2.investor),
        Err(Ok(Error::Expired))
    );
}

#[test]
fn ttl_is_extended_on_write() {
    let f = setup(true);
    let id = funded_order(&f);
    f.env.as_contract(&f.contract_id, || {
        let ttl = f.env.storage().persistent().get_ttl(&DataKey::Order(id));
        assert!(ttl >= TTL_EXTEND_TO);
    });
}

// ----- Explicit authorization tests (no mock_all_auths) -----

#[test]
fn create_order_without_buyer_signature_fails() {
    let f = setup(false);
    let res = f
        .client
        .try_create_order(&f.buyer, &f.token.address, &shares(&f), &DEADLINE);
    assert!(res.is_err());
}

#[test]
fn only_buyer_can_confirm_delivery() {
    let f = setup(false);
    let id = {
        f.env.mock_all_auths();
        let id = funded_order(&f);
        f.env.set_auths(&[]);
        id
    };

    // A supplier trying to release its own payment is rejected.
    f.env.mock_auths(&[MockAuth {
        address: &f.sup_a,
        invoke: &MockAuthInvoke {
            contract: &f.contract_id,
            fn_name: "confirm_delivery",
            args: (id, 0u32).into_val(&f.env),
            sub_invokes: &[],
        },
    }]);
    assert!(f.client.try_confirm_delivery(&id, &0).is_err());
    assert_eq!(f.token.balance(&f.sup_a), 0);

    // The buyer's signature on exactly this call succeeds.
    f.env.mock_auths(&[MockAuth {
        address: &f.buyer,
        invoke: &MockAuthInvoke {
            contract: &f.contract_id,
            fn_name: "confirm_delivery",
            args: (id, 0u32).into_val(&f.env),
            sub_invokes: &[],
        },
    }]);
    f.client.confirm_delivery(&id, &0);
    assert_eq!(f.token.balance(&f.sup_a), 500);
}

#[test]
fn only_owner_can_offer_and_only_supplier_can_mark_delivered() {
    let f = setup(false);
    let id = {
        f.env.mock_all_auths();
        let id = funded_order(&f);
        f.env.set_auths(&[]);
        id
    };

    // Supplier A cannot offer supplier B's share.
    f.env.mock_auths(&[MockAuth {
        address: &f.sup_a,
        invoke: &MockAuthInvoke {
            contract: &f.contract_id,
            fn_name: "offer_share",
            args: (id, 1u32, 285i128).into_val(&f.env),
            sub_invokes: &[],
        },
    }]);
    assert!(f.client.try_offer_share(&id, &1, &285).is_err());

    // The buyer cannot mark a supplier's work as delivered.
    f.env.mock_auths(&[MockAuth {
        address: &f.buyer,
        invoke: &MockAuthInvoke {
            contract: &f.contract_id,
            fn_name: "mark_delivered",
            args: (id, 1u32).into_val(&f.env),
            sub_invokes: &[],
        },
    }]);
    assert!(f.client.try_mark_delivered(&id, &1).is_err());

    // The legitimate supplier can.
    f.env.mock_auths(&[MockAuth {
        address: &f.sup_b,
        invoke: &MockAuthInvoke {
            contract: &f.contract_id,
            fn_name: "mark_delivered",
            args: (id, 1u32).into_val(&f.env),
            sub_invokes: &[],
        },
    }]);
    f.client.mark_delivered(&id, &1);
}

#[test]
fn investor_must_sign_purchase() {
    let f = setup(false);
    let id = {
        f.env.mock_all_auths();
        let id = funded_order(&f);
        f.client.offer_share(&id, &1, &285);
        f.env.set_auths(&[]);
        id
    };
    // No signatures at all: purchase must fail and state must not change.
    assert!(f.client.try_buy_share(&id, &1, &f.investor).is_err());
    let s = f.client.get_order(&id).shares.get(1).unwrap();
    assert_eq!(s.owner, f.sup_b);
    assert_eq!(f.token.balance(&f.investor), 10_000);
}
