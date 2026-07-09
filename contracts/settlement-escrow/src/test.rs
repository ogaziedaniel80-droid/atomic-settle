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

mod real_gate {
    use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol};

    #[contracttype]
    enum DataKey {
        Admin,
        Whitelisted(Address, Address),
        Rule(Symbol),
    }

    #[contract]
    pub struct ComplianceGate;

    #[contractimpl]
    impl ComplianceGate {
        pub fn __constructor(env: Env, admin: Address) {
            env.storage().instance().set(&DataKey::Admin, &admin);
        }

        pub fn check(env: Env, party: Address, asset: Address, _amount: i128) -> bool {
            env.storage()
                .persistent()
                .get::<_, bool>(&DataKey::Whitelisted(party, asset))
                .unwrap_or(false)
        }

        pub fn add_to_whitelist(env: Env, party: Address, asset: Address) {
            let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
            admin.require_auth();
            env.storage()
                .persistent()
                .set(&DataKey::Whitelisted(party, asset), &true);
        }

        pub fn set_rule(env: Env, jurisdiction_pair: Symbol, config: BytesN<32>) {
            let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
            admin.require_auth();
            env.storage()
                .persistent()
                .set(&DataKey::Rule(jurisdiction_pair), &config);
        }

        pub fn get_rule(env: Env, jurisdiction_pair: Symbol) -> Option<BytesN<32>> {
            env.storage().persistent().get(&DataKey::Rule(jurisdiction_pair))
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

#[test]
fn test_integration_full_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let cash_token = setup_token(&env, &token_admin);
    let asset_token = setup_token(&env, &token_admin);

    let party_a = Address::generate(&env);
    let party_b = Address::generate(&env);
    fund(&env, &cash_token, &party_a, 1000);
    fund(&env, &asset_token, &party_b, 10);

    let gate_admin = Address::generate(&env);
    let gate_id = env.register(real_gate::ComplianceGate, (&gate_admin,));

    let contract_id = env.register(SettlementEscrow, ());
    let client = SettlementEscrowClient::new(&env, &contract_id);

    let trade_id = BytesN::from_array(&env, &[42; 32]);
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

    let created = client.get_trade(&trade_id);
    assert_eq!(created.state, TradeState::Created);

    client.lock_cash_leg(&trade_id, &party_a);
    let partial = client.get_trade(&trade_id);
    assert_eq!(partial.state, TradeState::PartiallyLocked);

    client.lock_asset_leg(&trade_id, &party_b);
    let locked = client.get_trade(&trade_id);
    assert_eq!(locked.state, TradeState::BothLocked);

    let gate_client = real_gate::ComplianceGateClient::new(&env, &gate_id);
    gate_client.add_to_whitelist(&party_a, &asset_token);
    gate_client.add_to_whitelist(&party_b, &cash_token);

    client.settle(&trade_id);

    let settled = client.get_trade(&trade_id);
    assert_eq!(settled.state, TradeState::Settled);
}

#[test]
#[should_panic(expected = "compliance check failed")]
fn test_integration_compliance_failure() {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let cash_token = setup_token(&env, &token_admin);
    let asset_token = setup_token(&env, &token_admin);

    let party_a = Address::generate(&env);
    let party_b = Address::generate(&env);
    fund(&env, &cash_token, &party_a, 1000);
    fund(&env, &asset_token, &party_b, 10);

    let gate_admin = Address::generate(&env);
    let gate_id = env.register(real_gate::ComplianceGate, (&gate_admin,));

    let contract_id = env.register(SettlementEscrow, ());
    let client = SettlementEscrowClient::new(&env, &contract_id);

    let trade_id = BytesN::from_array(&env, &[99; 32]);
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
}

#[test]
fn test_refund_after_expiry() {
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
    let expiry_ledger = env.ledger().sequence() + 1;

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

    env.ledger().set_sequence_number(expiry_ledger + 1);

    client.refund(&trade_id);

    let trade = client.get_trade(&trade_id);
    assert_eq!(trade.state, TradeState::Refunded);
}
