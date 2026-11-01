//! Sandbox integration tests: the real wasm, a real NEP-141 token (contracts/mock-ft), real receipts.
//! Covers what unit tests can't: transfers, atomic revert, storage registration, #[private] and
//! no-deposit guards, and the agent's function-call key scope.
//!
//!   cargo test -p vault --test sandbox -- --test-threads=4

use near_api::types::AccessKeyPermission;
use near_api::types::transaction::actions::FunctionCallPermission;
use near_api::types::transaction::result::ExecutionFinalResult;
use near_api::{AccountId, NearGas, NearToken, NetworkConfig, Signer};
use near_sdk::serde_json::{Value, json};
use std::sync::Arc;

const USD: u128 = 1_000_000;
const STORAGE: NearToken = NearToken::from_millinear(10);

struct Env {
    _sb: near_sandbox::Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
    ft: near_api::Contract,
    vault: near_api::Contract,
    owner: AccountId,
    agent: AccountId,
    owen: AccountId,
    maria: AccountId,
}

fn wasm(crate_dir: &str) -> Vec<u8> {
    let manifest = format!("{}/../{crate_dir}/Cargo.toml", env!("CARGO_MANIFEST_DIR"));
    let opts = cargo_near_build::BuildOpts::builder()
        .manifest_path(manifest)
        .no_abi(true)
        .build();
    std::fs::read(cargo_near_build::build_with_cli(opts).expect("wasm build")).unwrap()
}

async fn account(sb: &near_sandbox::Sandbox, name: &str) -> AccountId {
    let id: AccountId = name.parse().unwrap();
    sb.create_account(id.clone())
        .initial_balance(NearToken::from_near(50))
        .send()
        .await
        .unwrap();
    id
}

/// Vault with owen (owner, $800 cap) and maria (cleaner, $100 cap), no payee delay, $3,000/day,
/// funded with $1,000 of mock USDC.
async fn setup() -> Env {
    let sb = near_sandbox::Sandbox::start_sandbox().await.unwrap();
    let net = NetworkConfig::from_rpc_url("sandbox", sb.rpc_addr.parse().unwrap());
    let signer = Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY
            .parse()
            .unwrap(),
    )
    .unwrap();

    let ft = account(&sb, "usdc.sandbox").await;
    let vault = account(&sb, "vault.sandbox").await;
    let owner = account(&sb, "operator.sandbox").await;
    let agent = account(&sb, "agent.sandbox").await;
    let owen = account(&sb, "owen.sandbox").await;
    let maria = account(&sb, "maria.sandbox").await;

    near_api::Contract::deploy(ft.clone())
        .use_code(wasm("mock-ft"))
        .with_init_call("new", json!({}))
        .unwrap()
        .with_signer(signer.clone())
        .send_to(&net)
        .await
        .unwrap()
        .assert_success();
    near_api::Contract::deploy(vault.clone())
        .use_code(wasm("vault"))
        .with_init_call(
            "new",
            json!({
                "owner": owner, "agent": agent, "token": ft,
                "daily_limit": (3_000 * USD).to_string(), "payee_delay_ns": "0"
            }),
        )
        .unwrap()
        .gas(NearGas::from_tgas(100))
        .deposit(STORAGE)
        .with_signer(signer.clone())
        .send_to(&net)
        .await
        .unwrap()
        .assert_success();

    let env = Env {
        _sb: sb,
        net,
        signer,
        ft: near_api::Contract(ft),
        vault: near_api::Contract(vault),
        owner,
        agent,
        owen,
        maria,
    };
    let (o, m) = (env.owen.clone(), env.maria.clone());
    env.owner_call(
        "add_payee",
        json!({ "account_id": o, "role": "owner", "cap_per_payout": (800 * USD).to_string() }),
        STORAGE,
    )
    .await
    .assert_success();
    env.owner_call(
        "add_payee",
        json!({ "account_id": m, "role": "cleaner", "cap_per_payout": (100 * USD).to_string() }),
        STORAGE,
    )
    .await
    .assert_success();
    let (ft_id, v) = (env.ft.0.clone(), env.vault.0.clone());
    env.call_as(
        &ft_id,
        &env.ft,
        "mint",
        json!({ "account_id": v, "amount": (1_000 * USD).to_string() }),
        NearToken::from_yoctonear(0),
        30,
    )
    .await
    .assert_success();
    env
}

impl Env {
    async fn call_as(
        &self,
        who: &AccountId,
        c: &near_api::Contract,
        method: &str,
        args: Value,
        deposit: NearToken,
        tgas: u64,
    ) -> ExecutionFinalResult {
        c.call_function(method, args)
            .transaction()
            .deposit(deposit)
            .gas(NearGas::from_tgas(tgas))
            .with_signer(who.clone(), self.signer.clone())
            .send_to(&self.net)
            .await
            .unwrap()
            .into_full()
            .expect("pending")
    }
    async fn owner_call(
        &self,
        method: &str,
        args: Value,
        deposit: NearToken,
    ) -> ExecutionFinalResult {
        let owner = self.owner.clone();
        self.call_as(&owner, &self.vault, method, args, deposit, 100)
            .await
    }
    async fn settle(&self, items: Value) -> ExecutionFinalResult {
        let agent = self.agent.clone();
        self.call_as(
            &agent,
            &self.vault,
            "settle",
            json!({ "items": items }),
            NearToken::from_yoctonear(0),
            300,
        )
        .await
    }
    async fn view(&self, c: &near_api::Contract, method: &str, args: Value) -> Value {
        c.call_function(method, args)
            .read_only()
            .fetch_from(&self.net)
            .await
            .unwrap()
            .data
    }
    async fn balance(&self, who: &AccountId) -> u128 {
        let v = self
            .view(&self.ft, "ft_balance_of", json!({ "account_id": who }))
            .await;
        v.as_str().unwrap().parse().unwrap()
    }
    async fn is_paid(&self, key: &str) -> bool {
        self.view(&self.vault, "is_paid", json!({ "key": key }))
            .await
            .as_bool()
            .unwrap()
    }
    async fn remaining(&self) -> u128 {
        let v = self.view(&self.vault, "remaining_today", json!({})).await;
        v.as_str().unwrap().parse().unwrap()
    }
}

fn item(key: &str, payee: &AccountId, amount: u128) -> Value {
    json!({ "key": key, "payee": payee, "amount": amount.to_string() })
}
fn returned_bool(r: ExecutionFinalResult) -> bool {
    r.into_result().expect("tx failed").json::<bool>().unwrap()
}
fn err_text(r: ExecutionFinalResult) -> String {
    format!("{:?}", r.into_result().expect_err("expected failure"))
}
/// Count vault events from *successful* receipts only (spike #1: reverted receipts still carry logs).
fn ok_events(r: &ExecutionFinalResult, name: &str) -> usize {
    r.receipt_outcomes()
        .iter()
        .filter(|o| o.is_success())
        .flat_map(|o| o.logs.iter())
        .filter(|l| {
            l.starts_with("EVENT_JSON:")
                && l.contains("\"standard\":\"houserules\"")
                && l.contains(&format!("\"event\":\"{name}\""))
        })
        .count()
}

#[tokio::test]
async fn init_registers_vault_and_add_payee_registers_payees() {
    let env = setup().await;
    let p = env.view(&env.vault, "get_policy", json!({})).await;
    assert_eq!(p["token_registered"], json!(true), "{p}");
    for who in [&env.vault.0, &env.owen, &env.maria] {
        let sb = env
            .view(&env.ft, "storage_balance_of", json!({ "account_id": who }))
            .await;
        assert!(
            !sb.is_null(),
            "{who} should be storage-registered on the token"
        );
    }
}

#[tokio::test]
async fn agent_settles_a_batch() {
    let env = setup().await;
    let r = env
        .settle(json!([
            item("b1:owner", &env.owen, 300 * USD),
            item("b1:cleaner", &env.maria, 50 * USD)
        ]))
        .await;
    assert_eq!(ok_events(&r, "settle_started"), 1);
    assert_eq!(ok_events(&r, "settled"), 1);
    assert!(returned_bool(r));
    assert_eq!(env.balance(&env.owen).await, 300 * USD);
    assert_eq!(env.balance(&env.maria).await, 50 * USD);
    assert_eq!(env.balance(&env.vault.0).await, 650 * USD);
    assert!(env.is_paid("b1:owner").await);
    assert_eq!(env.remaining().await, 2_650 * USD);
}

#[tokio::test]
async fn failed_batch_reverts_everything_and_restores_state() {
    let env = setup().await;
    // maria leaves the token (unregisters), so a transfer to her will fail
    let m = env.maria.clone();
    env.call_as(
        &m,
        &env.ft,
        "storage_unregister",
        json!({}),
        NearToken::from_yoctonear(1),
        30,
    )
    .await
    .assert_success();

    let r = env
        .settle(json!([
            item("b1:owner", &env.owen, 300 * USD),
            item("b1:cleaner", &env.maria, 50 * USD)
        ]))
        .await;
    assert_eq!(ok_events(&r, "settle_failed"), 1);
    assert_eq!(ok_events(&r, "settled"), 0);
    assert!(!returned_bool(r), "tx succeeds but returns false");

    assert_eq!(
        env.balance(&env.owen).await,
        0,
        "owen's transfer ran first and must be rolled back"
    );
    assert_eq!(env.balance(&env.vault.0).await, 1_000 * USD);
    assert!(!env.is_paid("b1:owner").await && !env.is_paid("b1:cleaner").await);
    assert_eq!(env.remaining().await, 3_000 * USD);
}

#[tokio::test]
async fn policy_rejection_is_a_failed_tx_with_readable_code() {
    let env = setup().await;
    let r = env
        .settle(json!([item("b1:cleaner", &env.maria, 101 * USD)]))
        .await;
    let e = err_text(r);
    assert!(e.contains("POLICY_REJECTED:OverCap"), "{e}");
    assert_eq!(env.balance(&env.maria).await, 0);
    assert!(!env.is_paid("b1:cleaner").await);
}

#[tokio::test]
async fn wasm_guards_private_callbacks_and_no_deposit_settle() {
    let env = setup().await;
    let a = env.agent.clone();
    for (method, args) in [
        (
            "on_settled",
            json!({ "items": [], "total": "0", "window_start_ns": "0" }),
        ),
        ("on_registered", json!({})),
        ("on_withdrawn", json!({ "amount": "1", "receiver_id": a })),
    ] {
        let e = err_text(
            env.call_as(
                &a,
                &env.vault,
                method,
                args,
                NearToken::from_yoctonear(0),
                30,
            )
            .await,
        );
        assert!(e.contains("is private"), "{method}: {e}");
    }
    let (owner, o) = (env.owner.clone(), env.owen.clone());
    let e = err_text(
        env.call_as(
            &owner,
            &env.vault,
            "settle",
            json!({ "items": [item("b1:owner", &o, USD)] }),
            NearToken::from_yoctonear(1),
            300,
        )
        .await,
    );
    assert!(e.contains("doesn't accept deposit"), "{e}");
}

#[tokio::test]
async fn owner_withdraws_only_to_a_registered_receiver() {
    let env = setup().await;
    let o = env.owner.clone();
    let args = json!({ "amount": (10 * USD).to_string(), "receiver_id": o });

    // operator isn't registered on the token yet → transfer fails, vault keeps the funds
    let r = env
        .owner_call("withdraw", args.clone(), NearToken::from_yoctonear(1))
        .await;
    assert_eq!(ok_events(&r, "withdraw_failed"), 1);
    assert!(!returned_bool(r));
    assert_eq!(env.balance(&env.vault.0).await, 1_000 * USD);

    // after registering, the same withdraw lands
    env.call_as(
        &o,
        &env.ft,
        "storage_deposit",
        json!({ "registration_only": true }),
        STORAGE,
        30,
    )
    .await
    .assert_success();
    let r = env
        .owner_call("withdraw", args, NearToken::from_yoctonear(1))
        .await;
    assert_eq!(ok_events(&r, "withdrawn"), 1);
    assert!(returned_bool(r));
    assert_eq!(env.balance(&env.owner).await, 10 * USD);
    assert_eq!(env.balance(&env.vault.0).await, 990 * USD);
}

async fn with_key(
    env: &Env,
    key: &Arc<Signer>,
    method: &str,
    args: Value,
    deposit: NearToken,
) -> Result<bool, String> {
    match env
        .vault
        .call_function(method, args)
        .transaction()
        .deposit(deposit)
        .gas(NearGas::from_tgas(300))
        .with_signer(env.agent.clone(), key.clone())
        .send_to(&env.net)
        .await
    {
        Ok(r) => match r.into_full().unwrap().into_result() {
            Ok(v) => Ok(v.json::<bool>().unwrap_or(true)),
            Err(e) => Err(format!("{e:?}")),
        },
        Err(e) => Err(format!("{e}")),
    }
}

/// The agent's real setup: a function-call key on `agent`, scoped to vault.settle.
#[tokio::test]
async fn agent_function_call_key_can_only_settle() {
    let env = setup().await;
    let sk = near_api::signer::generate_secret_key().unwrap();
    near_api::Account(env.agent.clone())
        .add_key(
            AccessKeyPermission::FunctionCall(FunctionCallPermission {
                allowance: Some(NearToken::from_near(2)),
                receiver_id: env.vault.0.to_string(),
                method_names: vec!["settle".into()],
            }),
            sk.public_key(),
        )
        .with_signer(env.signer.clone())
        .send_to(&env.net)
        .await
        .unwrap()
        .into_full()
        .unwrap()
        .assert_success();
    let fc = Signer::from_secret_key(sk).unwrap();

    let o = env.owen.clone();
    let ok = with_key(
        &env,
        &fc,
        "settle",
        json!({ "items": [item("k1:owner", &o, USD)] }),
        NearToken::from_yoctonear(0),
    )
    .await;
    assert_eq!(ok, Ok(true));
    assert_eq!(env.balance(&env.owen).await, USD);

    let a = env.agent.clone();
    for (method, args, deposit) in [
        (
            "withdraw",
            json!({ "amount": "1", "receiver_id": a }),
            NearToken::from_yoctonear(1),
        ),
        (
            "withdraw",
            json!({ "amount": "1", "receiver_id": a }),
            NearToken::from_yoctonear(0),
        ),
        (
            "add_payee",
            json!({ "account_id": a, "role": "owner", "cap_per_payout": "1" }),
            STORAGE,
        ),
        (
            "set_limits",
            json!({ "daily_limit": "999999999999", "payee_delay_ns": "0" }),
            NearToken::from_yoctonear(1),
        ),
        (
            "set_agent",
            json!({ "agent": a }),
            NearToken::from_yoctonear(1),
        ),
    ] {
        let r = with_key(&env, &fc, method, args, deposit).await;
        assert!(
            r.is_err(),
            "{method} with the agent key must fail, got {r:?}"
        );
    }
    assert_eq!(env.balance(&env.agent).await, 0);
    let p = env.view(&env.vault, "get_policy", json!({})).await;
    assert_eq!(p["daily_limit"], json!((3_000 * USD).to_string()));
    assert_eq!(p["agent"], json!(env.agent));
}

/// MAX_BATCH fits in 300 TGas on both the success and the failure (restore) path.
#[tokio::test]
async fn max_batch_fits_in_300_tgas_both_paths() {
    let env = setup().await;
    // 39 ledger-only payees + maria (a real account, so she can unregister herself below)
    let mut payees: Vec<AccountId> = (0..39)
        .map(|i| format!("p{i}.sandbox").parse().unwrap())
        .collect();
    for p in &payees {
        env.owner_call(
            "add_payee",
            json!({ "account_id": p, "role": "owner", "cap_per_payout": "1000000" }),
            STORAGE,
        )
        .await
        .assert_success();
    }
    payees.push(env.maria.clone());
    let batch = |prefix: &str| {
        Value::Array(
            payees
                .iter()
                .enumerate()
                .map(|(i, p)| item(&format!("{prefix}{i}:x"), p, 1))
                .collect(),
        )
    };

    let ok = env.settle(batch("ok")).await;
    let ok_gas = ok.total_gas_burnt.as_gas() as f64 / 1e12;
    assert!(returned_bool(ok), "40-item batch should succeed");

    // failure path: maria (last) leaves the token → revert, callback unmarks all 40 keys
    let last = payees[39].clone();
    env.call_as(
        &last,
        &env.ft,
        "storage_unregister",
        json!({ "force": true }),
        NearToken::from_yoctonear(1),
        30,
    )
    .await
    .assert_success();
    let bad = env.settle(batch("bad")).await;
    let cb_gas = bad
        .receipt_outcomes()
        .iter()
        .rfind(|o| o.executor_id == env.vault.0)
        .map(|o| o.gas_burnt.as_gas() as f64 / 1e12)
        .unwrap();
    let bad_gas = bad.total_gas_burnt.as_gas() as f64 / 1e12;
    assert!(!returned_bool(bad));
    assert!(
        !env.is_paid("bad0:x").await && !env.is_paid("bad39:x").await,
        "all 40 keys unmarked"
    );
    println!(
        "[gas] 40 ok: {ok_gas:.1} TGas burnt; 40 failed: {bad_gas:.1} TGas, restore callback {cb_gas:.1} TGas (30 reserved)"
    );
    assert!(cb_gas < 30.0, "restore callback must fit its reservation");
}
