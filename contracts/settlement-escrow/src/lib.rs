#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Trade {
    pub trade_id: BytesN<32>,
    pub party_a: Address,
    pub party_b: Address,
    pub cash_token: Address,
    pub cash_amount: i128,
    pub asset_token: Address,
    pub asset_amount: i128,
    pub compliance_gate: Address,
    pub expiry_ledger: u32,
    pub state: TradeState,
    pub cash_locked: bool,
    pub asset_locked: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TradeState {
    Created,
    PartiallyLocked,
    BothLocked,
    Settled,
    Refunding,
    Refunded,
}

#[contract]
pub struct SettlementEscrow;

#[contractimpl]
impl SettlementEscrow {
}
