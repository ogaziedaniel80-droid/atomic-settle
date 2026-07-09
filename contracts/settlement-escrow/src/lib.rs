#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env, IntoVal, Symbol, Val, vec};

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

#[contracttype]
enum DataKey {
    Trade(BytesN<32>),
}

#[contract]
pub struct SettlementEscrow;

#[contractimpl]
impl SettlementEscrow {
    pub fn init_trade(
        env: Env,
        trade_id: BytesN<32>,
        party_a: Address,
        party_b: Address,
        cash_token: Address,
        cash_amount: i128,
        asset_token: Address,
        asset_amount: i128,
        compliance_gate: Address,
        expiry_ledger: u32,
    ) {
        let key = DataKey::Trade(trade_id.clone());
        if env.storage().persistent().has(&key) {
            panic!("trade already exists");
        }

        let trade = Trade {
            trade_id,
            party_a,
            party_b,
            cash_token,
            cash_amount,
            asset_token,
            asset_amount,
            compliance_gate,
            expiry_ledger,
            state: TradeState::Created,
            cash_locked: false,
            asset_locked: false,
        };

        env.storage().persistent().set(&key, &trade);
    }

    pub fn lock_cash_leg(env: Env, trade_id: BytesN<32>, party: Address) {
        party.require_auth();

        let key = DataKey::Trade(trade_id.clone());
        let mut trade: Trade = env.storage().persistent().get(&key).expect("trade not found");

        if trade.state != TradeState::Created && trade.state != TradeState::PartiallyLocked {
            panic!("invalid state");
        }
        if trade.cash_locked {
            panic!("cash already locked");
        }
        if party != trade.party_a {
            panic!("only party a can lock cash");
        }

        let client = token::Client::new(&env, &trade.cash_token);
        client.transfer(&party, &env.current_contract_address(), &trade.cash_amount);

        trade.cash_locked = true;
        trade.state = if trade.asset_locked {
            TradeState::BothLocked
        } else {
            TradeState::PartiallyLocked
        };

        env.storage().persistent().set(&key, &trade);
    }

    pub fn lock_asset_leg(env: Env, trade_id: BytesN<32>, party: Address) {
        party.require_auth();

        let key = DataKey::Trade(trade_id.clone());
        let mut trade: Trade = env.storage().persistent().get(&key).expect("trade not found");

        if trade.state != TradeState::Created && trade.state != TradeState::PartiallyLocked {
            panic!("invalid state");
        }
        if trade.asset_locked {
            panic!("asset already locked");
        }
        if party != trade.party_b {
            panic!("only party b can lock asset");
        }

        let client = token::Client::new(&env, &trade.asset_token);
        client.transfer(&party, &env.current_contract_address(), &trade.asset_amount);

        trade.asset_locked = true;
        trade.state = if trade.cash_locked {
            TradeState::BothLocked
        } else {
            TradeState::PartiallyLocked
        };

        env.storage().persistent().set(&key, &trade);
    }

    pub fn settle(env: Env, trade_id: BytesN<32>) {
        let key = DataKey::Trade(trade_id.clone());
        let mut trade: Trade = env.storage().persistent().get(&key).expect("trade not found");

        if trade.state != TradeState::BothLocked {
            panic!("invalid state");
        }

        let args_a = vec![
            &env,
            trade.party_a.to_val(),
            trade.asset_token.to_val(),
            trade.asset_amount.into_val(&env),
        ];
        let check_a: Val = env.invoke_contract(
            &trade.compliance_gate,
            &Symbol::new(&env, "check"),
            args_a,
        );

        let args_b = vec![
            &env,
            trade.party_b.to_val(),
            trade.cash_token.to_val(),
            trade.cash_amount.into_val(&env),
        ];
        let check_b: Val = env.invoke_contract(
            &trade.compliance_gate,
            &Symbol::new(&env, "check"),
            args_b,
        );

        if !check_a.is_true() || !check_b.is_true() {
            trade.state = TradeState::Refunding;
            env.storage().persistent().set(&key, &trade);
            panic!("compliance check failed");
        }

        let cash_client = token::Client::new(&env, &trade.cash_token);
        let asset_client = token::Client::new(&env, &trade.asset_token);

        cash_client.transfer(
            &env.current_contract_address(),
            &trade.party_b,
            &trade.cash_amount,
        );
        asset_client.transfer(
            &env.current_contract_address(),
            &trade.party_a,
            &trade.asset_amount,
        );

        trade.state = TradeState::Settled;
        env.storage().persistent().set(&key, &trade);
    }

    pub fn cancel(env: Env, trade_id: BytesN<32>, party: Address) {
        party.require_auth();

        let key = DataKey::Trade(trade_id.clone());
        let mut trade: Trade = env.storage().persistent().get(&key).expect("trade not found");

        if trade.state != TradeState::PartiallyLocked {
            panic!("invalid state - can only cancel when partially locked");
        }

        trade.state = TradeState::Refunding;
        env.storage().persistent().set(&key, &trade);

        if trade.cash_locked {
            let client = token::Client::new(&env, &trade.cash_token);
            client.transfer(
                &env.current_contract_address(),
                &trade.party_a,
                &trade.cash_amount,
            );
        }
        if trade.asset_locked {
            let client = token::Client::new(&env, &trade.asset_token);
            client.transfer(
                &env.current_contract_address(),
                &trade.party_b,
                &trade.asset_amount,
            );
        }

        trade.cash_locked = false;
        trade.asset_locked = false;
        trade.state = TradeState::Refunded;
        env.storage().persistent().set(&key, &trade);
    }

    pub fn refund(env: Env, trade_id: BytesN<32>) {
        let key = DataKey::Trade(trade_id.clone());
        let mut trade: Trade = env.storage().persistent().get(&key).expect("trade not found");

        if trade.state != TradeState::Refunding && env.ledger().sequence() < trade.expiry_ledger {
            panic!("refund not available yet - trade not expired or not in refunding state");
        }

        trade.state = TradeState::Refunded;
        env.storage().persistent().set(&key, &trade);

        if trade.cash_locked {
            let client = token::Client::new(&env, &trade.cash_token);
            client.transfer(
                &env.current_contract_address(),
                &trade.party_a,
                &trade.cash_amount,
            );
        }
        if trade.asset_locked {
            let client = token::Client::new(&env, &trade.asset_token);
            client.transfer(
                &env.current_contract_address(),
                &trade.party_b,
                &trade.asset_amount,
            );
        }

        trade.cash_locked = false;
        trade.asset_locked = false;
        env.storage().persistent().set(&key, &trade);
    }

    pub fn get_trade(env: Env, trade_id: BytesN<32>) -> Trade {
        let key = DataKey::Trade(trade_id);
        env.storage().persistent().get(&key).expect("trade not found")
    }
}

#[cfg(test)]
mod test;
