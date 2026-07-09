#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, BytesN, Env,
};
use crate::{SettlementEscrow, SettlementEscrowClient, TradeState};

mod mock_gate {
    use soroban_sdk::{contract, contractimpl, Address, Env};

    #[contract]
    pub struct MockGate;

    #[contractimpl]
    impl MockGate {
        pub fn check(_env: Env, _party: Address, _asset: Address, _amount: i128) -> bool {
            true
        }
    }
}

fn setup_token(env: &Env, admin: &Address) -> Address {
    env.register_stellar_asset_contract_v2(admin.clone()).address()
}

fn fund(env: &Env, token: &Address, to: &Address, amount: i128) {
    let admin = token::StellarAssetClient::new(env, token);
    admin.mint(to, &amount);
}

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
    assert_eq!(trade.trade_id, trade_id);
    assert_eq!(trade.party_a, party_a);
    assert_eq!(trade.party_b, party_b);
    assert_eq!(trade.state, TradeState::Created);
    assert!(!trade.cash_locked);
    assert!(!trade.asset_locked);
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
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let cash_token = setup_token(&env, &token_admin);
    let asset_token = setup_token(&env, &token_admin);

    let party_a = Address::generate(&env);
    let party_b = Address::generate(&env);
    fund(&env, &cash_token, &party_a, 1000);
    fund(&env, &asset_token, &party_b, 10);

    let contract_id = env.register(SettlementEscrow, ());
    let client = SettlementEscrowClient::new(&env, &contract_id);

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
    assert!(trade.cash_locked);
    assert_eq!(trade.state, TradeState::PartiallyLocked);

    client.lock_asset_leg(&trade_id, &party_b);
    let trade = client.get_trade(&trade_id);
    assert!(trade.cash_locked);
    assert!(trade.asset_locked);
    assert_eq!(trade.state, TradeState::BothLocked);
}

#[test]
fn test_settle() {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let cash_token = setup_token(&env, &token_admin);
    let asset_token = setup_token(&env, &token_admin);

    let party_a = Address::generate(&env);
    let party_b = Address::generate(&env);
    fund(&env, &cash_token, &party_a, 1000);
    fund(&env, &asset_token, &party_b, 10);

    let gate_id = env.register(mock_gate::MockGate, ());
    let contract_id = env.register(SettlementEscrow, ());
    let client = SettlementEscrowClient::new(&env, &contract_id);

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
        &gate_id,
        &expiry_ledger,
    );

    client.lock_cash_leg(&trade_id, &party_a);
    client.lock_asset_leg(&trade_id, &party_b);
    client.settle(&trade_id);

    let trade = client.get_trade(&trade_id);
    assert_eq!(trade.state, TradeState::Settled);
}

#[test]
fn test_cancel() {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let cash_token = setup_token(&env, &token_admin);
    let asset_token = setup_token(&env, &token_admin);

    let party_a = Address::generate(&env);
    let party_b = Address::generate(&env);
    fund(&env, &cash_token, &party_a, 1000);
    fund(&env, &asset_token, &party_b, 10);

    let contract_id = env.register(SettlementEscrow, ());
    let client = SettlementEscrowClient::new(&env, &contract_id);

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
    client.cancel(&trade_id, &party_a);

    let trade = client.get_trade(&trade_id);
    assert_eq!(trade.state, TradeState::Refunded);
}
