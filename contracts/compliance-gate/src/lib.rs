#![no_std]

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
        let key = DataKey::Whitelisted(party, asset);
        env.storage()
            .persistent()
            .get::<_, bool>(&key)
            .unwrap_or(false)
    }

    pub fn add_to_whitelist(env: Env, party: Address, asset: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::Whitelisted(party, asset), &true);
    }

    pub fn remove_from_whitelist(env: Env, party: Address, asset: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        env.storage()
            .persistent()
            .remove(&DataKey::Whitelisted(party, asset));
    }

    pub fn set_rule(env: Env, jurisdiction_pair: Symbol, config: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::Rule(jurisdiction_pair), &config);
    }

    pub fn get_rule(env: Env, jurisdiction_pair: Symbol) -> Option<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::Rule(jurisdiction_pair))
    }
}

#[cfg(test)]
mod test;

