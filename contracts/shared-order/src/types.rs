use soroban_sdk::{contracttype, Address, String, Vec};

/// Input describing one supplier's slice of a shared order.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ShareInput {
    pub supplier: Address,
    pub amount: i128,
    pub label: String,
}

/// One supplier's slice of the order, tracked through delivery and payment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Share {
    /// Original supplier; the only account that may call `mark_delivered`.
    pub supplier: Address,
    /// Current owner of the payment claim (supplier, or the investor who bought it).
    pub owner: Address,
    pub amount: i128,
    pub label: String,
    pub delivered: bool,
    pub paid: bool,
    pub refunded: bool,
    /// Advance price at which the owner offers the claim, if any.
    pub offer_price: Option<i128>,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OrderStatus {
    Created,
    Funded,
    Completed,
    Refunded,
    PartiallyRefunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Order {
    pub buyer: Address,
    pub token: Address,
    pub total: i128,
    /// Amount already paid out to share owners.
    pub released: i128,
    /// Amount already returned to the buyer.
    pub refunded: i128,
    pub deadline: u64,
    pub status: OrderStatus,
    pub shares: Vec<Share>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Count,
    Order(u64),
}
