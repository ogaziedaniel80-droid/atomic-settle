#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};
use crate::{SettlementEscrow, SettlementEscrowClient, TradeState};

#[test]
fn test_init_trade() {
    let env = Env::default();
    let contract_id = env.register(SettlementEscrow, ());
    let client = SettlementEscrowClient::new(&env, &contract_id);

    let party_a = Address::generate(&env);
    let party_b = Address::generate(&env);
    let cash_token = Address::generate(&env);
    let asset_token = Address::generate(&env);
    let compliance_gate = Address::generate(&env);
    let trade_id = BytesN::from_array(&env, &[1; 32]);
    let expiry_ledger = env.ledger().sequence() + 100;

    client.init_trade(
        &trade_id,
        &party_a,
        &party_b,
        &cash_token,
        &1000,
        &asset_token,
        &10,
        &compliance_gate,
        &expiry_ledger,
    );

    let trade = client.get_trade(&trade_id);
    assert_eq!(trade.state, TradeState::Created);
    assert_eq!(trade.party_a, party_a);
    assert_eq!(trade.party_b, party_b);
    assert_eq!(trade.cash_amount, 1000);
    assert_eq!(trade.asset_amount, 10);
}

#[test]
#[should_panic(expected = "trade already exists")]
fn test_init_duplicate_trade() {
    let env = Env::default();
    let contract_id = env.register(SettlementEscrow, ());
    let client = SettlementEscrowClient::new(&env, &contract_id);

    let party_a = Address::generate(&env);
    let party_b = Address::generate(&env);
    let cash_token = Address::generate(&env);
    let asset_token = Address::generate(&env);
    let compliance_gate = Address::generate(&env);
    let trade_id = BytesN::from_array(&env, &[1; 32]);
    let expiry_ledger = env.ledger().sequence() + 100;

    client.init_trade(
        &trade_id,
        &party_a,
        &party_b,
        &cash_token,
        &1000,
        &asset_token,
        &10,
        &compliance_gate,
        &expiry_ledger,
    );

    client.init_trade(
        &trade_id,
        &party_a,
        &party_b,
        &cash_token,
        &1000,
        &asset_token,
        &10,
        &compliance_gate,
        &expiry_ledger,
    );
}

#[test]
fn test_lock_cash_and_asset() {
    let env = Env::default();
    let contract_id = env.register(SettlementEscrow, ());
    let client = SettlementEscrowClient::new(&env, &contract_id);

    let party_a = Address::generate(&env);
    let party_b = Address::generate(&env);
    let cash_token = Address::generate(&env);
    let asset_token = Address::generate(&env);
    let compliance_gate = Address::generate(&env);
    let trade_id = BytesN::from_array(&env, &[1; 32]);
    let expiry_ledger = env.ledger().sequence() + 100;

    client.init_trade(
        &trade_id,
        &party_a,
        &party_b,
        &cash_token,
        &1000,
        &asset_token,
        &10,
        &compliance_gate,
        &expiry_ledger,
    );

    client.lock_cash_leg(&trade_id, &party_a);
    let trade = client.get_trade(&trade_id);
    assert_eq!(trade.state, TradeState::PartiallyLocked);
    assert!(trade.cash_locked);
    assert!(!trade.asset_locked);

    client.lock_asset_leg(&trade_id, &party_b);
    let trade = client.get_trade(&trade_id);
    assert_eq!(trade.state, TradeState::BothLocked);
    assert!(trade.cash_locked);
    assert!(trade.asset_locked);
}

#[test]
fn test_settle() {
    let env = Env::default();
    let contract_id = env.register(SettlementEscrow, ());
    let client = SettlementEscrowClient::new(&env, &contract_id);

    let party_a = Address::generate(&env);
    let party_b = Address::generate(&env);
    let cash_token = Address::generate(&env);
    let asset_token = Address::generate(&env);
    let compliance_gate = Address::generate(&env);
    let trade_id = BytesN::from_array(&env, &[1; 32]);
    let expiry_ledger = env.ledger().sequence() + 100;

    client.init_trade(
        &trade_id,
        &party_a,
        &party_b,
        &cash_token,
        &1000,
        &asset_token,
        &10,
        &compliance_gate,
        &expiry_ledger,
    );

    client.lock_cash_leg(&trade_id, &party_a);
    client.lock_asset_leg(&trade_id, &party_b);
    client.settle(&trade_id);

    let trade = client.get_trade(&trade_id);
    assert_eq!(trade.state, TradeState::Settled);
}
