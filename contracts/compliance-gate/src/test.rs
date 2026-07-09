#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Symbol};
use crate::{ComplianceGate, ComplianceGateClient};

#[test]
fn test_check_returns_false_for_non_whitelisted() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let gate_id = env.register(ComplianceGate, (&admin,));
    let client = ComplianceGateClient::new(&env, &gate_id);

    let party = Address::generate(&env);
    let asset = Address::generate(&env);

    let result = client.check(&party, &asset, &1000);
    assert!(!result);
}

#[test]
fn test_add_and_check_whitelist() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let gate_id = env.register(ComplianceGate, (&admin,));
    let client = ComplianceGateClient::new(&env, &gate_id);

    let party = Address::generate(&env);
    let asset = Address::generate(&env);

    client.add_to_whitelist(&party, &asset);

    let result = client.check(&party, &asset, &1000);
    assert!(result);
}

#[test]
fn test_remove_from_whitelist() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let gate_id = env.register(ComplianceGate, (&admin,));
    let client = ComplianceGateClient::new(&env, &gate_id);

    let party = Address::generate(&env);
    let asset = Address::generate(&env);

    client.add_to_whitelist(&party, &asset);
    let result = client.check(&party, &asset, &1000);
    assert!(result);

    client.remove_from_whitelist(&party, &asset);
    let result = client.check(&party, &asset, &1000);
    assert!(!result);
}

#[test]
fn test_set_and_get_rule() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let gate_id = env.register(ComplianceGate, (&admin,));
    let client = ComplianceGateClient::new(&env, &gate_id);

    let jurisdiction_pair = Symbol::new(&env, "US_EU");
    let config = BytesN::from_array(&env, &[0x01; 32]);

    client.set_rule(&jurisdiction_pair, &config);

    let stored = client.get_rule(&jurisdiction_pair);
    assert_eq!(stored, Some(config));
}

#[test]
#[should_panic(expected = "HostError")]
fn test_unauthorized_add_to_whitelist() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let gate_id = env.register(ComplianceGate, (&admin,));
    let client = ComplianceGateClient::new(&env, &gate_id);

    let party = Address::generate(&env);
    let asset = Address::generate(&env);

    client.add_to_whitelist(&party, &asset);
}
