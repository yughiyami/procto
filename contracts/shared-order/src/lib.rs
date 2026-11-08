//! PROCTO shared-order escrow.
//!
//! The accepted quote is the payment instruction: the buyer locks the whole
//! order total in the contract up front, and every supplier's slice ("share")
//! is released directly to that supplier when the buyer confirms delivery.
//! There is no intermediary account that can hold or delay supplier money.
//!
//! A supplier may sell its claim at a discount ("factoring") to an investor
//! while the order is funded. The investor then receives the full amount on
//! confirmation; its only risk is delivery, because the money is already locked.
#![no_std]

mod error;
mod events;
mod types;

#[cfg(test)]
mod test;

pub use error::Error;
pub use types::{DataKey, Order, OrderStatus, Share, ShareInput};

use events::*;
use soroban_sdk::{contract, contractimpl, token, Address, Env, Vec};

const DAY_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 7 * DAY_LEDGERS;
const TTL_EXTEND_TO: u32 = 30 * DAY_LEDGERS;
/// Upper bound on shares per order to keep per-call resource usage bounded.
const MAX_SHARES: u32 = 20;

#[contract]
pub struct SharedOrder;

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn load(env: &Env, order_id: u64) -> Result<Order, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Order(order_id))
        .ok_or(Error::OrderNotFound)
}

fn save(env: &Env, order_id: u64, order: &Order) {
    let key = DataKey::Order(order_id);
    env.storage().persistent().set(&key, order);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    bump_instance(env);
}

fn share_at(order: &Order, index: u32) -> Result<Share, Error> {
    order.shares.get(index).ok_or(Error::ShareNotFound)
}

fn require_funded(order: &Order) -> Result<(), Error> {
    if order.status != OrderStatus::Funded {
        return Err(Error::InvalidState);
    }
    Ok(())
}

#[contractimpl]
impl SharedOrder {
    /// Create an order. The buyer signs; funds are not moved until `fund`.
    /// Returns the new order id (ids start at 1).
    pub fn create_order(
        env: Env,
        buyer: Address,
        token: Address,
        shares: Vec<ShareInput>,
        deadline: u64,
    ) -> Result<u64, Error> {
        buyer.require_auth();
        if shares.is_empty() {
            return Err(Error::NoShares);
        }
        if shares.len() > MAX_SHARES {
            return Err(Error::TooManyShares);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }

        let mut total: i128 = 0;
        let mut stored: Vec<Share> = Vec::new(&env);
        for s in shares.iter() {
            if s.amount <= 0 {
                return Err(Error::InvalidAmount);
            }
            total = total.checked_add(s.amount).ok_or(Error::Overflow)?;
            stored.push_back(Share {
                supplier: s.supplier.clone(),
                owner: s.supplier,
                amount: s.amount,
                label: s.label,
                delivered: false,
                paid: false,
                refunded: false,
                offer_price: None,
            });
        }

        let order_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0u64)
            + 1;
        env.storage().instance().set(&DataKey::Count, &order_id);

        let order = Order {
            buyer: buyer.clone(),
            token: token.clone(),
            total,
            released: 0,
            refunded: 0,
            deadline,
            status: OrderStatus::Created,
            shares: stored,
        };
        save(&env, order_id, &order);

        OrderCreated {
            order_id,
            buyer,
            token,
            total,
            deadline,
        }
        .publish(&env);
        Ok(order_id)
    }

    /// Lock the full order total in escrow. Buyer signs (which also authorizes
    /// the token transfer). Only possible before the deadline.
    pub fn fund(env: Env, order_id: u64) -> Result<(), Error> {
        let mut order = load(&env, order_id)?;
        order.buyer.require_auth();
        if order.status != OrderStatus::Created {
            return Err(Error::InvalidState);
        }
        if env.ledger().timestamp() >= order.deadline {
            return Err(Error::Expired);
        }
        order.status = OrderStatus::Funded;
        save(&env, order_id, &order);

        token::Client::new(&env, &order.token).transfer(
            &order.buyer,
            &env.current_contract_address(),
            &order.total,
        );
        OrderFunded {
            order_id,
            buyer: order.buyer,
            total: order.total,
        }
        .publish(&env);
        Ok(())
    }

    /// The share's original supplier declares the work delivered. This is a
    /// signal only; it never moves money. Payment still needs the buyer's
    /// `confirm_delivery`.
    pub fn mark_delivered(env: Env, order_id: u64, index: u32) -> Result<(), Error> {
        let mut order = load(&env, order_id)?;
        require_funded(&order)?;
        let mut share = share_at(&order, index)?;
        share.supplier.require_auth();
        if share.paid {
            return Err(Error::AlreadyPaid);
        }
        if share.delivered {
            return Err(Error::AlreadyDelivered);
        }
        share.delivered = true;
        let supplier = share.supplier.clone();
        order.shares.set(index, share);
        save(&env, order_id, &order);
        ShareDelivered {
            order_id,
            index,
            supplier,
        }
        .publish(&env);
        Ok(())
    }

    /// The buyer accepts delivery of a share and releases its amount to the
    /// CURRENT owner of the claim (the supplier, or the investor who bought it).
    ///
    /// The buyer's acceptance is what matters: this works even if the supplier
    /// never called `mark_delivered`. When every share is paid the order
    /// becomes `Completed`.
    pub fn confirm_delivery(env: Env, order_id: u64, index: u32) -> Result<(), Error> {
        let mut order = load(&env, order_id)?;
        order.buyer.require_auth();
        require_funded(&order)?;
        let mut share = share_at(&order, index)?;
        if share.paid {
            return Err(Error::AlreadyPaid);
        }

        // Effects before the external token call.
        share.paid = true;
        share.offer_price = None;
        let owner = share.owner.clone();
        let amount = share.amount;
        order.shares.set(index, share);
        order.released = order.released.checked_add(amount).ok_or(Error::Overflow)?;
        let all_paid = order.shares.iter().all(|s| s.paid);
        if all_paid {
            order.status = OrderStatus::Completed;
        }
        save(&env, order_id, &order);

        token::Client::new(&env, &order.token).transfer(
            &env.current_contract_address(),
            &owner,
            &amount,
        );
        SharePaid {
            order_id,
            index,
            to: owner,
            amount,
        }
        .publish(&env);
        if all_paid {
            OrderCompleted {
                order_id,
                released: order.released,
            }
            .publish(&env);
        }
        Ok(())
    }

    /// The current owner offers the claim at an advance `price`
    /// (`0 < price <= amount`). Calling again replaces the previous offer.
    pub fn offer_share(env: Env, order_id: u64, index: u32, price: i128) -> Result<(), Error> {
        let mut order = load(&env, order_id)?;
        require_funded(&order)?;
        let mut share = share_at(&order, index)?;
        share.owner.require_auth();
        if share.paid {
            return Err(Error::AlreadyPaid);
        }
        if price <= 0 || price > share.amount {
            return Err(Error::InvalidPrice);
        }
        share.offer_price = Some(price);
        let owner = share.owner.clone();
        order.shares.set(index, share);
        save(&env, order_id, &order);
        ShareOffered {
            order_id,
            index,
            owner,
            price,
        }
        .publish(&env);
        Ok(())
    }

    /// The current owner withdraws an open offer.
    pub fn cancel_offer(env: Env, order_id: u64, index: u32) -> Result<(), Error> {
        let mut order = load(&env, order_id)?;
        let mut share = share_at(&order, index)?;
        share.owner.require_auth();
        if share.offer_price.is_none() {
            return Err(Error::NoOffer);
        }
        share.offer_price = None;
        let owner = share.owner.clone();
        order.shares.set(index, share);
        save(&env, order_id, &order);
        OfferCancelled {
            order_id,
            index,
            owner,
        }
        .publish(&env);
        Ok(())
    }

    /// An investor buys the open offer: `price` moves from the investor to the
    /// current owner and the investor becomes the owner of the claim. The claim
    /// is backed by funds already locked in escrow, so the investor bears only
    /// delivery risk, not the buyer's credit risk.
    pub fn buy_share(env: Env, order_id: u64, index: u32, investor: Address) -> Result<(), Error> {
        investor.require_auth();
        let mut order = load(&env, order_id)?;
        require_funded(&order)?;
        if env.ledger().timestamp() >= order.deadline {
            return Err(Error::Expired);
        }
        let mut share = share_at(&order, index)?;
        if share.paid {
            return Err(Error::AlreadyPaid);
        }
        let price = share.offer_price.ok_or(Error::NoOffer)?;
        if share.owner == investor {
            return Err(Error::SelfPurchase);
        }

        let seller = share.owner.clone();
        share.owner = investor.clone();
        share.offer_price = None;
        order.shares.set(index, share);
        save(&env, order_id, &order);

        token::Client::new(&env, &order.token).transfer(&investor, &seller, &price);
        ShareSold {
            order_id,
            index,
            seller,
            investor,
            price,
        }
        .publish(&env);
        Ok(())
    }

    /// After the deadline anyone may trigger a refund of every unpaid share to
    /// the buyer. Status becomes `Refunded` if nothing had been paid out,
    /// otherwise `PartiallyRefunded`. An investor holding an undelivered share
    /// loses it (delivery risk); the buyer decides acceptance by confirming
    /// before the deadline.
    pub fn refund_expired(env: Env, order_id: u64) -> Result<(), Error> {
        let mut order = load(&env, order_id)?;
        require_funded(&order)?;
        if env.ledger().timestamp() < order.deadline {
            return Err(Error::NotExpired);
        }

        let mut refund: i128 = 0;
        let mut shares: Vec<Share> = Vec::new(&env);
        for mut s in order.shares.iter() {
            if !s.paid {
                refund = refund.checked_add(s.amount).ok_or(Error::Overflow)?;
                s.refunded = true;
                s.offer_price = None;
            }
            shares.push_back(s);
        }
        let partial = order.released > 0;
        order.shares = shares;
        order.refunded = refund;
        order.status = if partial {
            OrderStatus::PartiallyRefunded
        } else {
            OrderStatus::Refunded
        };
        save(&env, order_id, &order);

        token::Client::new(&env, &order.token).transfer(
            &env.current_contract_address(),
            &order.buyer,
            &refund,
        );
        OrderRefunded {
            order_id,
            buyer: order.buyer,
            amount: refund,
            partial,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_order(env: Env, order_id: u64) -> Result<Order, Error> {
        load(&env, order_id)
    }

    pub fn order_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}
