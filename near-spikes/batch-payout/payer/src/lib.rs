//! Spike #1: pay N accounts via ONE Promise::new(token) with chained ft_transfer actions,
//! then a #[private] callback that restores state if the batch failed.
//!
//! Questions this answers (see tests/spike.rs):
//!  (a) all transfers land when every receiver is registered
//!  (b) one unregistered receiver -> whole batch reverts, callback restores paid keys + spent
//!  (c) a POLICY_REJECTED:OverCap panic is readable from the failed tx outcome
//!  (d) gas per transfer -> MAX_BATCH
//!  (e) the vault can register itself on the token from a payable init

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::IterableSet;
use near_sdk::{AccountId, Gas, NearToken, PanicOnDefault, Promise, env, near, require};

/// Gas attached to each ft_transfer action. Tunable per call so the test can measure.
const DEFAULT_TRANSFER_TGAS: u64 = 5;
const CALLBACK_TGAS: u64 = 15;

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Item {
    pub key: String,
    pub payee: AccountId,
    pub amount: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Payer {
    token: AccountId,
    cap: u128,
    spent: u128,
    paid: IterableSet<String>,
}

fn reject(code: &str) -> ! {
    env::panic_str(&format!("POLICY_REJECTED:{code}"))
}

fn event(name: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "settlestay", "version": "0.0.1", "event": name, "data": data })
    ));
}

#[near]
impl Payer {
    /// Payable: the attached deposit pays for the vault's own storage registration on `token`.
    #[init]
    #[payable]
    pub fn new(token: AccountId, cap: U128) -> Self {
        let deposit = env::attached_deposit();
        require!(!deposit.is_zero(), "attach a deposit for storage_deposit on the token");
        Promise::new(token.clone())
            .function_call(
                "storage_deposit",
                json!({ "account_id": env::current_account_id(), "registration_only": true })
                    .to_string()
                    .into_bytes(),
                deposit,
                Gas::from_tgas(10),
            )
            .detach();
        Self {
            token,
            cap: cap.0,
            spent: 0,
            paid: IterableSet::new(b"p".to_vec()),
        }
    }

    pub fn settle(&mut self, items: Vec<Item>, transfer_tgas: Option<u64>) -> Promise {
        require!(!items.is_empty(), "empty batch");
        let mut total: u128 = 0;
        for it in &items {
            if it.amount.0 > self.cap {
                reject("OverCap");
            }
            if self.paid.contains(&it.key) {
                reject("AlreadyPaid");
            }
            total += it.amount.0;
        }
        for it in &items {
            self.paid.insert(it.key.clone());
        }
        self.spent += total;
        event("settle_started", json!({ "count": items.len(), "total": U128(total) }));

        let gas = Gas::from_tgas(transfer_tgas.unwrap_or(DEFAULT_TRANSFER_TGAS));
        let mut batch = Promise::new(self.token.clone());
        for it in &items {
            batch = batch.function_call(
                "ft_transfer",
                json!({ "receiver_id": it.payee, "amount": it.amount, "memo": it.key })
                    .to_string()
                    .into_bytes(),
                NearToken::from_yoctonear(1),
                gas,
            );
        }
        batch.then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(CALLBACK_TGAS))
                .on_settled(items, U128(total)),
        )
    }

    #[private]
    pub fn on_settled(&mut self, items: Vec<Item>, total: U128) -> bool {
        // ft_transfer returns nothing, so the payload is empty; we only care about success.
        let ok = env::promise_result_checked(0, 64).is_ok();
        if ok {
            event("settled", json!({ "count": items.len(), "total": total }));
        } else {
            for it in &items {
                self.paid.remove(&it.key);
            }
            self.spent -= total.0;
            event("settle_failed", json!({ "count": items.len(), "total": total }));
        }
        ok
    }

    pub fn is_paid(&self, key: String) -> bool {
        self.paid.contains(&key)
    }

    pub fn get_spent(&self) -> U128 {
        U128(self.spent)
    }
}
