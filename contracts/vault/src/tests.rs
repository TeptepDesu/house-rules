#![allow(unused_must_use)]
//! Unit tests: every policy rule in docs/vault-spec.md, the check order, owner-only access,
//! and both callback paths. Promises aren't executed here, and #[private]/no-deposit guards live in
//! the wasm entry points, so those are covered in tests/sandbox.rs.

use super::*;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{NearToken, PromiseResult, RuntimeFeesConfig, testing_env};
use std::panic::{AssertUnwindSafe, catch_unwind};

const HOUR: u64 = 3_600_000_000_000;
const DAY: u64 = 24 * HOUR;
const USD: u128 = 1_000_000; // 1 USDC in raw units
const STORAGE: NearToken = NearToken::from_micronear(1_250);

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn owner() -> AccountId {
    acc("operator.near")
}
fn agent() -> AccountId {
    acc("agent.near")
}
fn vault_id() -> AccountId {
    acc("vault.near")
}
fn owen() -> AccountId {
    acc("owen.near") // property owner
}
fn maria() -> AccountId {
    acc("maria.near") // cleaner
}

fn ctx(caller: &AccountId, deposit: NearToken, now: u64) {
    ctx_with(caller, deposit, now, vec![]);
}

fn ctx_with(caller: &AccountId, deposit: NearToken, now: u64, results: Vec<PromiseResult>) {
    let c = VMContextBuilder::new()
        .current_account_id(vault_id())
        .predecessor_account_id(caller.clone())
        .signer_account_id(caller.clone())
        .attached_deposit(deposit)
        .block_timestamp(now)
        .build();
    testing_env!(
        c,
        near_sdk::test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        results
    );
}

/// Vault with owen (owner role, $800 cap) and maria (cleaner, $100 cap) added at t=0,
/// a $3,000 daily limit and a 1h payee delay. Returns it with the clock at t=2h.
fn setup() -> Vault {
    ctx(&owner(), STORAGE, 0);
    let mut v = Vault::new(
        owner(),
        agent(),
        acc("usdc.near"),
        U128(3_000 * USD),
        U64(HOUR),
    );
    ctx(&owner(), STORAGE, 0);
    v.add_payee(owen(), PayeeRole::Owner, U128(800 * USD));
    ctx(&owner(), STORAGE, 0);
    v.add_payee(maria(), PayeeRole::Cleaner, U128(100 * USD));
    ctx(&agent(), NearToken::from_yoctonear(0), 2 * HOUR);
    v
}

fn item(key: &str, payee: AccountId, amount: u128) -> Item {
    Item {
        key: key.into(),
        payee,
        amount: U128(amount),
    }
}

fn panic_msg(r: std::thread::Result<impl Sized>) -> String {
    match r {
        Ok(_) => "<no panic>".into(),
        Err(e) => e
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_default(),
    }
}

/// Runs `f`, expects it to panic with `POLICY_REJECTED:<code>`, and checks no state changed.
fn rejects(v: &mut Vault, code: &str, f: impl FnOnce(&mut Vault)) {
    let before = snapshot(v);
    let msg = panic_msg(catch_unwind(AssertUnwindSafe(|| f(v))));
    assert_eq!(
        policy_code(&msg).as_deref(),
        Some(code),
        "wrong rejection: {msg}"
    );
    assert_eq!(snapshot(v), before, "state changed on rejection");
}

/// Same extraction the app does on real tx errors: /POLICY_REJECTED:([A-Za-z]+)/.
fn policy_code(msg: &str) -> Option<String> {
    let rest = msg.split("POLICY_REJECTED:").nth(1)?;
    Some(
        rest.chars()
            .take_while(|c| c.is_ascii_alphabetic())
            .collect(),
    )
}

fn snapshot(v: &Vault) -> String {
    format!(
        "{:?}|{:?}|{:?}",
        v.get_policy(),
        v.get_payees(),
        v.remaining_today()
    )
}

fn events(name: &str) -> Vec<String> {
    get_logs()
        .into_iter()
        .filter(|l| l.contains(&format!("\"event\":\"{name}\"")))
        .collect()
}

// ---------- init & registration ----------

#[test]
fn new_stores_policy_and_starts_unregistered() {
    let v = setup();
    let p = v.get_policy();
    assert_eq!(p.owner, owner());
    assert_eq!(p.agent, agent());
    assert_eq!(p.daily_limit, U128(3_000 * USD));
    assert_eq!(p.payee_delay_ns, U64(HOUR));
    assert_eq!(p.max_batch, MAX_BATCH as u32);
    assert!(
        !p.token_registered,
        "registered only once the token confirms"
    );
}

#[test]
#[should_panic(expected = "Attach a storage deposit")]
fn new_requires_a_deposit() {
    ctx(&owner(), NearToken::from_yoctonear(0), 0);
    Vault::new(owner(), agent(), acc("usdc.near"), U128(1), U64(0));
}

#[test]
fn on_registered_success_sets_flag() {
    let mut v = setup();
    ctx_with(
        &vault_id(),
        NearToken::from_yoctonear(0),
        0,
        vec![PromiseResult::Successful(vec![])],
    );
    v.on_registered();
    assert!(v.get_policy().token_registered);
    assert_eq!(events("vault_registered").len(), 1);
}

#[test]
fn on_registered_failure_leaves_flag_and_logs() {
    let mut v = setup();
    ctx_with(
        &vault_id(),
        NearToken::from_yoctonear(0),
        0,
        vec![PromiseResult::Failed],
    );
    v.on_registered();
    assert!(!v.get_policy().token_registered);
    assert_eq!(events("vault_registration_failed").len(), 1);
}

#[test]
fn register_on_token_is_owner_only() {
    let mut v = setup();
    ctx(&agent(), STORAGE, 0);
    rejects(&mut v, "Unauthorized", |v| {
        v.register_on_token();
    });
}

// ---------- owner-only policy changes ----------

#[test]
fn add_payee_is_owner_only() {
    let mut v = setup();
    ctx(&agent(), STORAGE, 0);
    rejects(&mut v, "Unauthorized", |v| {
        v.add_payee(acc("mallory.near"), PayeeRole::Owner, U128(1))
    });
}

#[test]
#[should_panic(expected = "Attach a storage deposit")]
fn add_payee_requires_a_deposit() {
    let mut v = setup();
    ctx(&owner(), NearToken::from_yoctonear(0), 0);
    v.add_payee(acc("new.near"), PayeeRole::Owner, U128(USD));
}

#[test]
#[should_panic(expected = "Payee is already active")]
fn add_payee_twice_fails() {
    let mut v = setup();
    ctx(&owner(), STORAGE, 0);
    v.add_payee(owen(), PayeeRole::Owner, U128(USD));
}

#[test]
#[should_panic(expected = "cap_per_payout must be positive")]
fn add_payee_rejects_zero_cap() {
    let mut v = setup();
    ctx(&owner(), STORAGE, 0);
    v.add_payee(acc("new.near"), PayeeRole::Owner, U128(0));
}

#[test]
fn add_payee_emits_event_with_payable_time() {
    let mut v = setup();
    ctx(&owner(), STORAGE, 5 * HOUR);
    v.add_payee(acc("new.near"), PayeeRole::Cleaner, U128(USD));
    let e = events("payee_added");
    assert_eq!(e.len(), 1);
    assert!(
        e[0].contains(&format!("\"payable_from_ns\":\"{}\"", 6 * HOUR)),
        "{}",
        e[0]
    );
}

#[test]
fn remove_payee_requires_owner_and_one_yocto() {
    let mut v = setup();
    ctx(&agent(), NearToken::from_yoctonear(1), 0);
    rejects(&mut v, "Unauthorized", |v| v.remove_payee(owen()));

    ctx(&owner(), NearToken::from_yoctonear(0), 0);
    let msg = panic_msg(catch_unwind(AssertUnwindSafe(|| v.remove_payee(owen()))));
    assert!(msg.contains("1 yoctoNEAR"), "{msg}");
}

#[test]
fn removed_payee_cannot_be_paid_and_re_adding_restarts_delay() {
    let mut v = setup();
    ctx(&owner(), NearToken::from_yoctonear(1), 2 * HOUR);
    v.remove_payee(owen());
    assert_eq!(events("payee_removed").len(), 1);

    ctx(&agent(), NearToken::from_yoctonear(0), 3 * HOUR);
    rejects(&mut v, "PayeeNotAllowed", |v| {
        v.settle(vec![item("b1:owner", owen(), USD)]);
    });

    ctx(&owner(), STORAGE, 3 * HOUR);
    v.add_payee(owen(), PayeeRole::Owner, U128(800 * USD));
    ctx(&agent(), NearToken::from_yoctonear(0), 3 * HOUR + HOUR / 2);
    rejects(&mut v, "PayeeInDelay", |v| {
        v.settle(vec![item("b1:owner", owen(), USD)]);
    });
}

#[test]
fn set_limits_owner_only_and_emits() {
    let mut v = setup();
    ctx(&agent(), NearToken::from_yoctonear(1), 0);
    rejects(&mut v, "Unauthorized", |v| v.set_limits(U128(1), U64(0)));

    ctx(&owner(), NearToken::from_yoctonear(1), 0);
    v.set_limits(U128(500 * USD), U64(2 * HOUR));
    assert_eq!(v.get_policy().daily_limit, U128(500 * USD));
    assert_eq!(v.get_policy().payee_delay_ns, U64(2 * HOUR));
    assert_eq!(events("limits_changed").len(), 1);
}

#[test]
fn set_agent_rotates_who_may_settle() {
    let mut v = setup();
    ctx(&agent(), NearToken::from_yoctonear(1), 0);
    rejects(&mut v, "Unauthorized", |v| v.set_agent(acc("agent2.near")));

    ctx(&owner(), NearToken::from_yoctonear(1), 2 * HOUR);
    v.set_agent(acc("agent2.near"));
    assert_eq!(events("agent_changed").len(), 1);

    ctx(&agent(), NearToken::from_yoctonear(0), 2 * HOUR);
    rejects(&mut v, "Unauthorized", |v| {
        v.settle(vec![item("b1:owner", owen(), USD)]);
    });
    ctx(&acc("agent2.near"), NearToken::from_yoctonear(0), 2 * HOUR);
    v.settle(vec![item("b1:owner", owen(), USD)]);
    assert!(v.is_paid("b1:owner".into()));
}

#[test]
fn withdraw_is_owner_only_with_one_yocto() {
    let mut v = setup();
    ctx(&agent(), NearToken::from_yoctonear(1), 0);
    rejects(&mut v, "Unauthorized", |v| {
        v.withdraw(U128(USD), agent());
    });
    ctx(&owner(), NearToken::from_yoctonear(0), 0);
    let msg = panic_msg(catch_unwind(AssertUnwindSafe(|| {
        v.withdraw(U128(USD), owner())
    })));
    assert!(msg.contains("1 yoctoNEAR"), "{msg}");
    ctx(&owner(), NearToken::from_yoctonear(1), 0);
    v.withdraw(U128(USD), owner()); // schedules ft_transfer; outcome checked in sandbox tests
}

#[test]
fn on_withdrawn_emits_only_on_success() {
    let mut v = setup();
    ctx_with(
        &vault_id(),
        NearToken::from_yoctonear(0),
        0,
        vec![PromiseResult::Successful(vec![])],
    );
    assert!(v.on_withdrawn(U128(USD), owner()));
    assert_eq!(events("withdrawn").len(), 1);
    ctx_with(
        &vault_id(),
        NearToken::from_yoctonear(0),
        0,
        vec![PromiseResult::Failed],
    );
    assert!(!v.on_withdrawn(U128(USD), owner()));
    assert_eq!(events("withdraw_failed").len(), 1);
}

// ---------- settle: happy path ----------

#[test]
fn settle_marks_keys_spends_and_emits() {
    let mut v = setup();
    v.settle(vec![
        item("b1:owner", owen(), 300 * USD),
        item("b1:cleaner", maria(), 50 * USD),
    ]);
    assert!(v.is_paid("b1:owner".into()) && v.is_paid("b1:cleaner".into()));
    assert!(!v.is_paid("b2:owner".into()));
    assert_eq!(v.remaining_today(), U128(2_650 * USD));
    let e = events("settle_started");
    assert_eq!(e.len(), 1);
    assert!(e[0].contains("\"total\":\"350000000\""), "{}", e[0]);
}

#[test]
fn owner_may_settle_too() {
    let mut v = setup();
    ctx(&owner(), NearToken::from_yoctonear(0), 2 * HOUR);
    v.settle(vec![item("b1:owner", owen(), USD)]);
    assert!(v.is_paid("b1:owner".into()));
}

// ---------- settle: each rule ----------

#[test]
fn settle_rejects_strangers() {
    let mut v = setup();
    ctx(&acc("mallory.near"), NearToken::from_yoctonear(0), 2 * HOUR);
    rejects(&mut v, "Unauthorized", |v| {
        v.settle(vec![item("b1:owner", owen(), USD)]);
    });
}

#[test]
fn settle_batch_size_bounds() {
    let mut v = setup();
    rejects(&mut v, "BatchTooLarge", |v| {
        v.settle(vec![]);
    });
    let too_many: Vec<Item> = (0..=MAX_BATCH)
        .map(|i| item(&format!("b{i}:owner"), owen(), 1))
        .collect();
    rejects(&mut v, "BatchTooLarge", |v| {
        v.settle(too_many);
    });
    let max: Vec<Item> = (0..MAX_BATCH)
        .map(|i| item(&format!("b{i}:owner"), owen(), 1))
        .collect();
    v.settle(max);
    assert!(v.is_paid(format!("b{}:owner", MAX_BATCH - 1)));
}

#[test]
fn settle_rejects_invalid_items() {
    let mut v = setup();
    rejects(&mut v, "InvalidItem", |v| {
        v.settle(vec![item("b1:owner", owen(), 0)]);
    });
    rejects(&mut v, "InvalidItem", |v| {
        v.settle(vec![item("", owen(), 1)]);
    });
    let long = "k".repeat(MAX_KEY_LEN + 1);
    rejects(&mut v, "InvalidItem", |v| {
        v.settle(vec![item(&long, owen(), 1)]);
    });
    v.settle(vec![item(&"k".repeat(MAX_KEY_LEN), owen(), 1)]); // exactly 64 is fine
}

#[test]
fn settle_rejects_unknown_payee() {
    let mut v = setup();
    rejects(&mut v, "PayeeNotAllowed", |v| {
        v.settle(vec![item("b1:owner", acc("mallory.near"), USD)]);
    });
}

#[test]
fn settle_respects_payee_delay_boundary() {
    let mut v = setup();
    ctx(&owner(), STORAGE, 10 * HOUR);
    v.add_payee(acc("new.near"), PayeeRole::Cleaner, U128(USD));

    ctx(&agent(), NearToken::from_yoctonear(0), 11 * HOUR - 1);
    rejects(&mut v, "PayeeInDelay", |v| {
        v.settle(vec![item("b1:cleaner", acc("new.near"), 1)]);
    });
    ctx(&agent(), NearToken::from_yoctonear(0), 11 * HOUR);
    v.settle(vec![item("b1:cleaner", acc("new.near"), 1)]);
}

#[test]
fn set_limits_does_not_move_existing_payees_waiting_period() {
    // payee approved at 10h with a 1h delay is payable from 11h, whatever the delay becomes later
    let mut v = setup();
    ctx(&owner(), STORAGE, 10 * HOUR);
    v.add_payee(acc("new.near"), PayeeRole::Cleaner, U128(USD));
    ctx(&owner(), NearToken::from_yoctonear(1), 10 * HOUR);
    v.set_limits(U128(3_000 * USD), U64(0)); // shortening the delay…
    ctx(&agent(), NearToken::from_yoctonear(0), 10 * HOUR + 1);
    rejects(&mut v, "PayeeInDelay", |v| {
        v.settle(vec![item("b1:cleaner", acc("new.near"), 1)]);
    }); // …doesn't make the already-added payee payable early
    assert_eq!(
        v.get_payee(acc("new.near")).unwrap().payable_from_ns,
        U64(11 * HOUR)
    );

    ctx(&owner(), NearToken::from_yoctonear(1), 10 * HOUR + 2);
    v.set_limits(U128(3_000 * USD), U64(100 * HOUR)); // lengthening it doesn't push it back either
    ctx(&agent(), NearToken::from_yoctonear(0), 11 * HOUR);
    v.settle(vec![item("b1:cleaner", acc("new.near"), 1)]);
}

#[test]
fn settle_respects_cap_boundary() {
    let mut v = setup();
    rejects(&mut v, "OverCap", |v| {
        v.settle(vec![item("b1:cleaner", maria(), 100 * USD + 1)]);
    });
    v.settle(vec![item("b1:cleaner", maria(), 100 * USD)]);
}

#[test]
fn settle_rejects_replayed_and_duplicated_keys() {
    let mut v = setup();
    v.settle(vec![item("b1:owner", owen(), USD)]);
    rejects(&mut v, "AlreadyPaid", |v| {
        v.settle(vec![item("b1:owner", owen(), USD)]);
    });
    rejects(&mut v, "AlreadyPaid", |v| {
        v.settle(vec![
            item("b2:owner", owen(), USD),
            item("b2:owner", owen(), USD),
        ]);
    });
}

#[test]
fn settle_enforces_daily_limit_and_rolls_over() {
    let mut v = setup();
    // $3,000 limit; $800 cap → four $750 payouts hit it exactly.
    let batch = |p: &str| {
        (0..4)
            .map(|i| item(&format!("{p}{i}:owner"), owen(), 750 * USD))
            .collect::<Vec<_>>()
    };
    v.settle(batch("a"));
    assert_eq!(v.remaining_today(), U128(0));
    rejects(&mut v, "DailyLimitExceeded", |v| {
        v.settle(vec![item("x:owner", owen(), 1)]);
    });

    // still inside the window one ns before it ends
    ctx(&agent(), NearToken::from_yoctonear(0), 2 * HOUR + DAY - 1);
    rejects(&mut v, "DailyLimitExceeded", |v| {
        v.settle(vec![item("x:owner", owen(), 1)]);
    });

    // window rolls over at start + 24h
    ctx(&agent(), NearToken::from_yoctonear(0), 2 * HOUR + DAY);
    assert_eq!(v.remaining_today(), U128(3_000 * USD));
    v.settle(batch("b"));
    assert_eq!(v.remaining_today(), U128(0));
}

#[test]
fn daily_limit_counts_the_whole_batch() {
    let mut v = setup();
    ctx(&owner(), NearToken::from_yoctonear(1), 2 * HOUR);
    v.set_limits(U128(100 * USD), U64(HOUR));
    ctx(&agent(), NearToken::from_yoctonear(0), 2 * HOUR);
    rejects(&mut v, "DailyLimitExceeded", |v| {
        v.settle(vec![
            item("b1:owner", owen(), 60 * USD),
            item("b1:cleaner", maria(), 41 * USD),
        ]);
    });
    v.settle(vec![
        item("b1:owner", owen(), 60 * USD),
        item("b1:cleaner", maria(), 40 * USD),
    ]);
}

#[test]
fn settle_check_order_matches_spec() {
    let mut v = setup();
    // stranger + empty batch → Unauthorized first
    ctx(&acc("mallory.near"), NearToken::from_yoctonear(0), 2 * HOUR);
    rejects(&mut v, "Unauthorized", |v| {
        v.settle(vec![]);
    });
    ctx(&agent(), NearToken::from_yoctonear(0), 2 * HOUR);
    // unknown payee AND over any cap → PayeeNotAllowed (payee check precedes cap)
    rejects(&mut v, "PayeeNotAllowed", |v| {
        v.settle(vec![item("b1:owner", acc("mallory.near"), 10_000 * USD)]);
    });
    // first bad item wins: item 1 over cap, item 2 unknown payee → OverCap
    rejects(&mut v, "OverCap", |v| {
        v.settle(vec![
            item("b1:cleaner", maria(), 101 * USD),
            item("b2:owner", acc("mallory.near"), 1),
        ]);
    });
    // per-item checks precede the daily limit
    ctx(&owner(), NearToken::from_yoctonear(1), 2 * HOUR);
    v.set_limits(U128(1), U64(HOUR));
    ctx(&agent(), NearToken::from_yoctonear(0), 2 * HOUR);
    rejects(&mut v, "OverCap", |v| {
        v.settle(vec![item("b1:cleaner", maria(), 101 * USD)]);
    });
}

// ---------- on_settled callback ----------

fn settled_batch(v: &mut Vault) -> (Vec<Item>, U64) {
    let items = vec![
        item("b1:owner", owen(), 300 * USD),
        item("b1:cleaner", maria(), 50 * USD),
    ];
    v.settle(items.clone());
    (items, U64(2 * HOUR)) // window started at the first settle
}

#[test]
fn on_settled_success_keeps_state_and_emits() {
    let mut v = setup();
    let (items, ws) = settled_batch(&mut v);
    ctx_with(
        &vault_id(),
        NearToken::from_yoctonear(0),
        2 * HOUR,
        vec![PromiseResult::Successful(vec![])],
    );
    assert!(v.on_settled(items, U128(350 * USD), ws));
    assert!(v.is_paid("b1:owner".into()));
    assert_eq!(v.remaining_today(), U128(2_650 * USD));
    assert_eq!(events("settled").len(), 1);
}

#[test]
fn on_settled_failure_restores_keys_and_spend() {
    let mut v = setup();
    let (items, ws) = settled_batch(&mut v);
    ctx_with(
        &vault_id(),
        NearToken::from_yoctonear(0),
        2 * HOUR,
        vec![PromiseResult::Failed],
    );
    assert!(!v.on_settled(items, U128(350 * USD), ws));
    assert!(!v.is_paid("b1:owner".into()) && !v.is_paid("b1:cleaner".into()));
    assert_eq!(v.remaining_today(), U128(3_000 * USD));
    assert_eq!(events("settle_failed").len(), 1);

    // and the same keys can be paid again afterwards
    ctx(&agent(), NearToken::from_yoctonear(0), 2 * HOUR);
    v.settle(vec![item("b1:owner", owen(), 300 * USD)]);
}

#[test]
fn on_settled_failure_after_rollover_doesnt_touch_new_window() {
    let mut v = setup();
    let (items, ws) = settled_batch(&mut v);
    // a new window opens and spends before the old callback lands
    ctx(&agent(), NearToken::from_yoctonear(0), 2 * HOUR + DAY);
    v.settle(vec![item("n1:owner", owen(), 100 * USD)]);
    ctx_with(
        &vault_id(),
        NearToken::from_yoctonear(0),
        2 * HOUR + DAY,
        vec![PromiseResult::Failed],
    );
    assert!(!v.on_settled(items, U128(350 * USD), ws));
    assert!(!v.is_paid("b1:owner".into()), "keys are still unmarked");
    assert_eq!(
        v.remaining_today(),
        U128(2_900 * USD),
        "new window's spend untouched"
    );
}

// ---------- views ----------

#[test]
fn get_payees_reports_payable_time_and_status() {
    let v = setup();
    let ps = v.get_payees();
    assert_eq!(ps.len(), 2);
    let o = ps.iter().find(|p| p.account_id == owen()).unwrap();
    assert_eq!(o.role, PayeeRole::Owner);
    assert_eq!(o.cap_per_payout, U128(800 * USD));
    assert_eq!(o.payable_from_ns, U64(HOUR));
    assert!(o.active);
    assert!(v.get_payee(acc("nobody.near")).is_none());
}
