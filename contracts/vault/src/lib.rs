//! SettleStay Vault — holds an operator's USDC and enforces payout policy on-chain.
//!
//! Day-1 skeleton: state layout from plan.md §4 plus `new` and `get_policy`.
//! Policy methods (add_payee, settle, on_settled, withdraw, …) land Nov 2–3, test-first.

use near_sdk::json_types::{U64, U128};
use near_sdk::store::{IterableMap, IterableSet};
use near_sdk::{AccountId, BorshStorageKey, PanicOnDefault, env, near};

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Payees,
    PaidKeys,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PayeeRole {
    Owner,
    Cleaner,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Payee {
    pub role: PayeeRole,
    /// Max raw micro-USDC per single payout to this payee.
    pub cap_per_payout: U128,
    pub added_at_ns: U64,
    pub active: bool,
}

/// Rolling 24h spend window.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default)]
pub struct SpentWindow {
    pub day_start_ns: u64,
    pub spent: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    owner: AccountId,
    agent: AccountId,
    token: AccountId,
    payees: IterableMap<AccountId, Payee>,
    daily_limit: u128,
    spent_window: SpentWindow,
    payee_delay_ns: u64,
    /// "booking_id:role" keys already paid — on-chain idempotency.
    paid_keys: IterableSet<String>,
}

/// Public policy view for the dashboard's policy cards.
#[near(serializers = [json])]
#[derive(Debug, PartialEq, Eq)]
pub struct Policy {
    pub owner: AccountId,
    pub agent: AccountId,
    pub token: AccountId,
    pub daily_limit: U128,
    pub payee_delay_ns: U64,
}

#[near]
impl Vault {
    /// TODO(Nov 2): make payable and register the vault itself on `token` via storage_deposit.
    #[init]
    pub fn new(
        owner: AccountId,
        agent: AccountId,
        token: AccountId,
        daily_limit: U128,
        payee_delay_ns: U64,
    ) -> Self {
        Self {
            owner,
            agent,
            token,
            payees: IterableMap::new(StorageKey::Payees),
            daily_limit: daily_limit.0,
            spent_window: SpentWindow {
                day_start_ns: env::block_timestamp(),
                spent: 0,
            },
            payee_delay_ns: payee_delay_ns.0,
            paid_keys: IterableSet::new(StorageKey::PaidKeys),
        }
    }

    pub fn get_policy(&self) -> Policy {
        Policy {
            owner: self.owner.clone(),
            agent: self.agent.clone(),
            token: self.token.clone(),
            daily_limit: U128(self.daily_limit),
            payee_delay_ns: U64(self.payee_delay_ns),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    #[test]
    fn new_stores_policy() {
        let v = Vault::new(
            acc("operator.near"),
            acc("agent.near"),
            acc("usdc.near"),
            U128(3_000_000_000),
            U64(60_000_000_000),
        );
        assert_eq!(
            v.get_policy(),
            Policy {
                owner: acc("operator.near"),
                agent: acc("agent.near"),
                token: acc("usdc.near"),
                daily_limit: U128(3_000_000_000),
                payee_delay_ns: U64(60_000_000_000),
            }
        );
    }
}
