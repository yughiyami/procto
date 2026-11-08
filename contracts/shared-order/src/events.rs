use soroban_sdk::{contractevent, Address};

#[contractevent]
pub struct OrderCreated {
    #[topic]
    pub order_id: u64,
    pub buyer: Address,
    pub token: Address,
    pub total: i128,
    pub deadline: u64,
}

#[contractevent]
pub struct OrderFunded {
    #[topic]
    pub order_id: u64,
    pub buyer: Address,
    pub total: i128,
}

#[contractevent]
pub struct ShareDelivered {
    #[topic]
    pub order_id: u64,
    #[topic]
    pub index: u32,
    pub supplier: Address,
}

#[contractevent]
pub struct SharePaid {
    #[topic]
    pub order_id: u64,
    #[topic]
    pub index: u32,
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
pub struct OrderCompleted {
    #[topic]
    pub order_id: u64,
    pub released: i128,
}

#[contractevent]
pub struct ShareOffered {
    #[topic]
    pub order_id: u64,
    #[topic]
    pub index: u32,
    pub owner: Address,
    pub price: i128,
}

#[contractevent]
pub struct OfferCancelled {
    #[topic]
    pub order_id: u64,
    #[topic]
    pub index: u32,
    pub owner: Address,
}

#[contractevent]
pub struct ShareSold {
    #[topic]
    pub order_id: u64,
    #[topic]
    pub index: u32,
    pub seller: Address,
    pub investor: Address,
    pub price: i128,
}

#[contractevent]
pub struct OrderRefunded {
    #[topic]
    pub order_id: u64,
    pub buyer: Address,
    pub amount: i128,
    pub partial: bool,
}
