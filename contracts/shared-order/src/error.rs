use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    OrderNotFound = 1,
    ShareNotFound = 2,
    NoShares = 3,
    TooManyShares = 4,
    InvalidAmount = 5,
    InvalidDeadline = 6,
    InvalidPrice = 7,
    InvalidState = 8,
    AlreadyPaid = 9,
    AlreadyDelivered = 10,
    NoOffer = 11,
    SelfPurchase = 12,
    Expired = 13,
    NotExpired = 14,
    Overflow = 15,
}
