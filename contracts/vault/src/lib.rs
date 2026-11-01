//! House Rules Vault — holds an operator's USDC and pays out only within the operator's rules.
//!
//! Spec (source of truth): docs/vault-spec.md. Design notes from spikes #1 and #3: docs/notes.md.
//! - Payout batches are ONE Promise::new(token) with chained ft_transfer actions → atomic.
//! - The vault pays the 1 yocto per ft_transfer itself; `settle` takes no deposit, so a
//!   function-call key (which can't attach deposits) can call it and nothing else.
//! - Owner-only methods require a deposit (1 yocto or storage), which function-call keys can't send.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{Value, json};
use near_sdk::store::{IterableMap, LookupSet};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, assert_one_yocto, env,
    near, require,
};

pub const MAX_BATCH: usize = 40;
pub const MAX_KEY_LEN: usize = 64;
pub const WINDOW_NS: u64 = 24 * 60 * 60 * 1_000_000_000;

const TRANSFER_GAS: Gas = Gas::from_tgas(5);
const SETTLE_CALLBACK_GAS: Gas = Gas::from_tgas(30);
const STORAGE_DEPOSIT_GAS: Gas = Gas::from_tgas(10);
const SMALL_CALLBACK_GAS: Gas = Gas::from_tgas(5);
const WITHDRAW_GAS: Gas = Gas::from_tgas(10);

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Payees,
    Paid,
}

#[near(serializers = [json, borsh])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PayeeRole {
    Owner,
    Cleaner,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Payee {
    pub role: PayeeRole,
    pub cap_per_payout: u128,
    /// Fixed when the payee is approved: approval time + the delay in force then. Changing the
    /// delay later never moves it. (Same slot/type as the old `added_at_ns`, so upgrades keep state.)
    pub payable_from_ns: u64,
    pub active: bool,
}

/// One payout. `key` is "<booking_id>:<role>" and is unique forever.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Item {
    pub key: String,
    pub payee: AccountId,
    pub amount: U128,
}

/// 24h spend window. It starts at the first settle after the previous window expired.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default)]
pub struct Window {
    pub start_ns: u64,
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
    window: Option<Window>,
    payee_delay_ns: u64,
    paid: LookupSet<String>,
    token_registered: bool,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq, Eq)]
pub struct Policy {
    pub owner: AccountId,
    pub agent: AccountId,
    pub token: AccountId,
    pub daily_limit: U128,
    pub payee_delay_ns: U64,
    pub max_batch: u32,
    pub token_registered: bool,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq, Eq)]
pub struct PayeeView {
    pub account_id: AccountId,
    pub role: PayeeRole,
    pub cap_per_payout: U128,
    pub payable_from_ns: U64,
    pub active: bool,
}

fn reject(code: &str) -> ! {
    env::panic_str(&format!("POLICY_REJECTED:{code}"))
}

fn emit(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "houserules", "version": "1.0.0", "event": event, "data": data })
    ));
}

fn require_deposit() -> NearToken {
    let d = env::attached_deposit();
    require!(!d.is_zero(), "Attach a storage deposit for the token");
    d
}

fn last_promise_ok() -> bool {
    env::promise_results_count() == 1 && env::promise_result_checked(0, 256).is_ok()
}

#[near]
impl Vault {
    // ---------- init & registration ----------

    #[init]
    #[payable]
    pub fn new(
        owner: AccountId,
        agent: AccountId,
        token: AccountId,
        daily_limit: U128,
        payee_delay_ns: U64,
    ) -> Self {
        let deposit = require_deposit();
        let v = Self {
            owner,
            agent,
            token,
            payees: IterableMap::new(StorageKey::Payees),
            daily_limit: daily_limit.0,
            window: None,
            payee_delay_ns: payee_delay_ns.0,
            paid: LookupSet::new(StorageKey::Paid),
            token_registered: false,
        };
        v.register_self(deposit).detach();
        v
    }

    /// Retry the vault's own registration on the token (owner, storage deposit).
    #[payable]
    pub fn register_on_token(&mut self) -> Promise {
        self.assert_owner();
        let deposit = require_deposit();
        self.register_self(deposit)
    }

    #[private]
    pub fn on_registered(&mut self) {
        if last_promise_ok() {
            self.token_registered = true;
            emit("vault_registered", json!({ "token": self.token }));
        } else {
            emit("vault_registration_failed", json!({ "token": self.token }));
        }
    }

    // ---------- owner-only policy ----------

    /// Allowlist a payee and register them on the token. Re-adding a removed payee restarts the delay.
    #[payable]
    pub fn add_payee(&mut self, account_id: AccountId, role: PayeeRole, cap_per_payout: U128) {
        self.assert_owner();
        let deposit = require_deposit();
        require!(cap_per_payout.0 > 0, "cap_per_payout must be positive");
        if let Some(p) = self.payees.get(&account_id) {
            require!(!p.active, "Payee is already active");
        }
        let payable_from_ns = env::block_timestamp().saturating_add(self.payee_delay_ns);
        self.payees.insert(
            account_id.clone(),
            Payee {
                role,
                cap_per_payout: cap_per_payout.0,
                payable_from_ns,
                active: true,
            },
        );
        Promise::new(self.token.clone())
            .function_call(
                "storage_deposit",
                json!({ "account_id": account_id, "registration_only": true })
                    .to_string()
                    .into_bytes(),
                deposit,
                STORAGE_DEPOSIT_GAS,
            )
            .detach();
        emit(
            "payee_added",
            json!({
                "account_id": account_id,
                "role": role,
                "cap_per_payout": cap_per_payout,
                "payable_from_ns": U64(payable_from_ns),
            }),
        );
    }

    #[payable]
    pub fn remove_payee(&mut self, account_id: AccountId) {
        self.assert_owner();
        assert_one_yocto();
        let mut p = self
            .payees
            .get(&account_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Unknown payee"));
        p.active = false;
        self.payees.insert(account_id.clone(), p);
        emit("payee_removed", json!({ "account_id": account_id }));
    }

    #[payable]
    pub fn set_limits(&mut self, daily_limit: U128, payee_delay_ns: U64) {
        self.assert_owner();
        assert_one_yocto();
        self.daily_limit = daily_limit.0;
        self.payee_delay_ns = payee_delay_ns.0;
        emit(
            "limits_changed",
            json!({ "daily_limit": daily_limit, "payee_delay_ns": payee_delay_ns }),
        );
    }

    #[payable]
    pub fn set_agent(&mut self, agent: AccountId) {
        self.assert_owner();
        assert_one_yocto();
        let old = std::mem::replace(&mut self.agent, agent.clone());
        emit("agent_changed", json!({ "old": old, "new": agent }));
    }

    /// Move tokens out of the vault (owner, 1 yocto). Not subject to payout policy.
    #[payable]
    pub fn withdraw(&mut self, amount: U128, receiver_id: AccountId) -> Promise {
        self.assert_owner();
        assert_one_yocto();
        require!(amount.0 > 0, "amount must be positive");
        Promise::new(self.token.clone())
            .function_call(
                "ft_transfer",
                json!({ "receiver_id": receiver_id, "amount": amount, "memo": "withdraw" })
                    .to_string()
                    .into_bytes(),
                NearToken::from_yoctonear(1),
                WITHDRAW_GAS,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(SMALL_CALLBACK_GAS)
                    .on_withdrawn(amount, receiver_id),
            )
    }

    #[private]
    pub fn on_withdrawn(&mut self, amount: U128, receiver_id: AccountId) -> bool {
        let ok = last_promise_ok();
        emit(
            if ok { "withdrawn" } else { "withdraw_failed" },
            json!({ "amount": amount, "receiver_id": receiver_id }),
        );
        ok
    }

    // ---------- payouts ----------

    /// Pay a batch atomically. Owner or agent; no deposit. Checks: docs/vault-spec.md § settle.
    pub fn settle(&mut self, items: Vec<Item>) -> Promise {
        let caller = env::predecessor_account_id();
        if caller != self.agent && caller != self.owner {
            reject("Unauthorized");
        }
        if items.is_empty() || items.len() > MAX_BATCH {
            reject("BatchTooLarge");
        }

        let now = env::block_timestamp();
        let mut seen: Vec<&str> = Vec::with_capacity(items.len());
        let mut total: u128 = 0;
        for it in &items {
            if it.amount.0 == 0 || it.key.is_empty() || it.key.len() > MAX_KEY_LEN {
                reject("InvalidItem");
            }
            let p = match self.payees.get(&it.payee) {
                Some(p) if p.active => p,
                _ => reject("PayeeNotAllowed"),
            };
            if now < p.payable_from_ns {
                reject("PayeeInDelay");
            }
            if it.amount.0 > p.cap_per_payout {
                reject("OverCap");
            }
            if self.paid.contains(&it.key) || seen.contains(&it.key.as_str()) {
                reject("AlreadyPaid");
            }
            seen.push(&it.key);
            total = total
                .checked_add(it.amount.0)
                .unwrap_or_else(|| reject("InvalidItem"));
        }

        let w = self.current_window(now);
        let spent = match w.spent.checked_add(total) {
            Some(s) if s <= self.daily_limit => s,
            _ => reject("DailyLimitExceeded"),
        };

        // effects
        for it in &items {
            self.paid.insert(it.key.clone());
        }
        self.window = Some(Window {
            start_ns: w.start_ns,
            spent,
        });
        emit(
            "settle_started",
            json!({ "items": items, "total": U128(total) }),
        );

        // one receipt, N actions: all succeed or all revert
        let mut batch = Promise::new(self.token.clone());
        for it in &items {
            batch = batch.function_call(
                "ft_transfer",
                json!({ "receiver_id": it.payee, "amount": it.amount, "memo": it.key })
                    .to_string()
                    .into_bytes(),
                NearToken::from_yoctonear(1),
                TRANSFER_GAS,
            );
        }
        batch.then(
            Self::ext(env::current_account_id())
                .with_static_gas(SETTLE_CALLBACK_GAS)
                .on_settled(items, U128(total), U64(w.start_ns)),
        )
    }

    /// Callback for `settle`. On failure, unmark keys and give the spend back (if the window is unchanged).
    #[private]
    pub fn on_settled(&mut self, items: Vec<Item>, total: U128, window_start_ns: U64) -> bool {
        let keys: Vec<&str> = items.iter().map(|i| i.key.as_str()).collect();
        if last_promise_ok() {
            emit("settled", json!({ "keys": keys, "total": total }));
            return true;
        }
        for it in &items {
            self.paid.remove(&it.key);
        }
        // only give the spend back to the window it was taken from
        if let Some(w) = self.window.as_mut()
            && w.start_ns == window_start_ns.0
        {
            w.spent = w.spent.saturating_sub(total.0);
        }
        emit("settle_failed", json!({ "keys": keys, "total": total }));
        false
    }

    // ---------- views ----------

    pub fn get_policy(&self) -> Policy {
        Policy {
            owner: self.owner.clone(),
            agent: self.agent.clone(),
            token: self.token.clone(),
            daily_limit: U128(self.daily_limit),
            payee_delay_ns: U64(self.payee_delay_ns),
            max_batch: MAX_BATCH as u32,
            token_registered: self.token_registered,
        }
    }

    pub fn get_payees(&self) -> Vec<PayeeView> {
        self.payees.iter().map(|(id, p)| self.view(id, p)).collect()
    }

    pub fn get_payee(&self, account_id: AccountId) -> Option<PayeeView> {
        self.payees
            .get(&account_id)
            .map(|p| self.view(&account_id, p))
    }

    pub fn is_paid(&self, key: String) -> bool {
        self.paid.contains(&key)
    }

    pub fn remaining_today(&self) -> U128 {
        let w = self.current_window(env::block_timestamp());
        U128(self.daily_limit.saturating_sub(w.spent))
    }

    // ---------- internals ----------

    fn assert_owner(&self) {
        if env::predecessor_account_id() != self.owner {
            reject("Unauthorized");
        }
    }

    /// The window containing `now`: the current one, or a fresh one if none exists or it expired.
    fn current_window(&self, now: u64) -> Window {
        match &self.window {
            Some(w) if now < w.start_ns.saturating_add(WINDOW_NS) => w.clone(),
            _ => Window {
                start_ns: now,
                spent: 0,
            },
        }
    }

    fn register_self(&self, deposit: NearToken) -> Promise {
        Promise::new(self.token.clone())
            .function_call(
                "storage_deposit",
                json!({ "account_id": env::current_account_id(), "registration_only": true })
                    .to_string()
                    .into_bytes(),
                deposit,
                STORAGE_DEPOSIT_GAS,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(SMALL_CALLBACK_GAS)
                    .on_registered(),
            )
    }

    fn view(&self, id: &AccountId, p: &Payee) -> PayeeView {
        PayeeView {
            account_id: id.clone(),
            role: p.role,
            cap_per_payout: U128(p.cap_per_payout),
            payable_from_ns: U64(p.payable_from_ns),
            active: p.active,
        }
    }
}

#[cfg(test)]
mod tests;
