//! Spike #1 sandbox tests. Run with:
//!   cargo test -p payer --test spike -- --nocapture --test-threads=1
//! Gas numbers print to stdout; copy them into docs/notes.md.

use near_api::{AccountId, NearGas, NearToken, NetworkConfig, Signer};
use near_sdk::serde_json::{Value, json};
use std::sync::Arc;

const CAP: u128 = 800_000_000; // $800 in micro-USDC

struct Env {
    _sandbox: near_sandbox::Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
    ft: near_api::Contract,
    payer: near_api::Contract,
    agent: AccountId,
}

fn wasm(crate_dir: &str) -> Vec<u8> {
    let manifest = format!("{}/../{crate_dir}/Cargo.toml", env!("CARGO_MANIFEST_DIR"));
    let opts = cargo_near_build::BuildOpts::builder()
        .manifest_path(manifest)
        .no_abi(true)
        .build();
    let path = cargo_near_build::build_with_cli(opts).expect("wasm build");
    std::fs::read(path).unwrap()
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

async fn setup() -> Env {
    let sb = near_sandbox::Sandbox::start_sandbox().await.unwrap();
    let net = NetworkConfig::from_rpc_url("sandbox", sb.rpc_addr.parse().unwrap());
    let signer = Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse().unwrap(),
    )
    .unwrap();

    let ft_id = account(&sb, "usdc.sandbox").await;
    let payer_id = account(&sb, "vault.sandbox").await;
    let agent = account(&sb, "agent.sandbox").await;

    near_api::Contract::deploy(ft_id.clone())
        .use_code(wasm("mock-ft"))
        .with_init_call("new", json!({}))
        .unwrap()
        .with_signer(signer.clone())
        .send_to(&net)
        .await
        .unwrap()
        .assert_success();

    // (e) payable init registers the vault on the token
    near_api::Contract::deploy(payer_id.clone())
        .use_code(wasm("payer"))
        .with_init_call("new", json!({ "token": ft_id, "cap": CAP.to_string() }))
        .unwrap()
        .gas(NearGas::from_tgas(100))
        .deposit(NearToken::from_millinear(10))
        .with_signer(signer.clone())
        .send_to(&net)
        .await
        .unwrap()
        .assert_success();

    Env {
        _sandbox: sb,
        net,
        signer,
        ft: near_api::Contract(ft_id),
        payer: near_api::Contract(payer_id),
        agent,
    }
}

impl Env {
    async fn view(&self, c: &near_api::Contract, method: &str, args: Value) -> Value {
        c.call_function(method, args)
            .read_only()
            .fetch_from(&self.net)
            .await
            .unwrap()
            .data
    }

    async fn call(
        &self,
        c: &near_api::Contract,
        method: &str,
        args: Value,
        tgas: u64,
    ) -> near_api::types::transaction::result::ExecutionFinalResult {
        c.call_function(method, args)
            .transaction()
            .gas(NearGas::from_tgas(tgas))
            .with_signer(self.agent.clone(), self.signer.clone())
            .send_to(&self.net)
            .await
            .unwrap()
            .into_full()
            .expect("tx still pending")
    }

    async fn balance(&self, who: &str) -> u128 {
        let v = self.view(&self.ft, "ft_balance_of", json!({ "account_id": who })).await;
        v.as_str().unwrap().parse().unwrap()
    }

    async fn fund_vault(&self, amount: u128) {
        self.call(
            &self.ft,
            "mint",
            json!({ "account_id": self.payer.0, "amount": amount.to_string() }),
            30,
        )
        .await
        .assert_success();
    }

    async fn register(&self, ids: &[String]) {
        self.call(&self.ft, "register_many", json!({ "account_ids": ids }), 300)
            .await
            .assert_success();
    }

    async fn is_paid(&self, key: &str) -> bool {
        self.view(&self.payer, "is_paid", json!({ "key": key }))
            .await
            .as_bool()
            .unwrap()
    }

    async fn spent(&self) -> u128 {
        let v = self.view(&self.payer, "get_spent", json!({})).await;
        v.as_str().unwrap().parse().unwrap()
    }
}

fn item(key: &str, payee: &str, amount: u128) -> Value {
    json!({ "key": key, "payee": payee, "amount": amount.to_string() })
}

fn final_bool(r: near_api::types::transaction::result::ExecutionFinalResult) -> bool {
    r.into_result().expect("tx failed").json::<bool>().unwrap()
}

#[tokio::test]
async fn e_init_registers_vault_on_token() {
    let env = setup().await;
    let sb = env
        .view(&env.ft, "storage_balance_of", json!({ "account_id": env.payer.0 }))
        .await;
    assert!(!sb.is_null(), "vault should be storage-registered on the token after init");
}

#[tokio::test]
async fn a_batch_pays_everyone() {
    let env = setup().await;
    env.fund_vault(1_000_000_000).await;
    env.register(&["owner1.sandbox".into(), "cleaner1.sandbox".into(), "owner2.sandbox".into()])
        .await;

    let r = env
        .call(
            &env.payer,
            "settle",
            json!({ "items": [
                item("b1:owner", "owner1.sandbox", 300_000_000),
                item("b1:cleaner", "cleaner1.sandbox", 50_000_000),
                item("b2:owner", "owner2.sandbox", 120_000_000),
            ]}),
            300,
        )
        .await;
    let logs: Vec<String> = r.logs().iter().map(|s| s.to_string()).collect();
    assert!(final_bool(r), "callback should report success");

    assert_eq!(env.balance("owner1.sandbox").await, 300_000_000);
    assert_eq!(env.balance("cleaner1.sandbox").await, 50_000_000);
    assert_eq!(env.balance("owner2.sandbox").await, 120_000_000);
    assert_eq!(env.balance(env.payer.0.as_str()).await, 1_000_000_000 - 470_000_000);
    assert!(env.is_paid("b1:owner").await && env.is_paid("b2:owner").await);
    assert_eq!(env.spent().await, 470_000_000);
    assert!(logs.iter().any(|l| l.contains("\"event\":\"settled\"")), "logs: {logs:?}");
}

#[tokio::test]
async fn b_one_unregistered_receiver_reverts_whole_batch() {
    let env = setup().await;
    env.fund_vault(1_000_000_000).await;
    env.register(&["owner1.sandbox".into(), "owner2.sandbox".into()]).await;

    // first and last receivers are registered; the middle one is not
    let r = env
        .call(
            &env.payer,
            "settle",
            json!({ "items": [
                item("b1:owner", "owner1.sandbox", 100_000_000),
                item("b9:cleaner", "ghost.sandbox", 10_000_000),
                item("b2:owner", "owner2.sandbox", 100_000_000),
            ]}),
            300,
        )
        .await;

    let failures: Vec<String> = r
        .receipt_failures()
        .iter()
        .map(|o| format!("{} {:?}", o.executor_id, o))
        .collect();
    let logs: Vec<String> = r.logs().iter().map(|s| s.to_string()).collect();
    println!("[b] receipt failures: {}", failures.len());
    for f in &failures {
        println!("[b]   {}", &f[..f.len().min(300)]);
    }
    assert!(!final_bool(r), "callback should report failure");

    // atomicity: the FIRST transfer, which ran before the failing one, must be rolled back
    assert_eq!(env.balance("owner1.sandbox").await, 0, "first transfer must revert");
    assert_eq!(env.balance("owner2.sandbox").await, 0);
    assert_eq!(env.balance(env.payer.0.as_str()).await, 1_000_000_000);
    // callback restored state
    assert!(!env.is_paid("b1:owner").await);
    assert!(!env.is_paid("b9:cleaner").await);
    assert_eq!(env.spent().await, 0);
    assert!(logs.iter().any(|l| l.contains("\"event\":\"settle_failed\"")), "logs: {logs:?}");
    assert!(
        failures.iter().any(|f| f.contains("not registered")),
        "token receipt should fail with the registration error"
    );
}

#[tokio::test]
async fn c_policy_rejection_is_readable() {
    let env = setup().await;
    env.fund_vault(1_000_000_000).await;
    env.register(&["owner1.sandbox".into()]).await;

    let r = env
        .call(
            &env.payer,
            "settle",
            json!({ "items": [item("b1:owner", "owner1.sandbox", CAP + 1)] }),
            300,
        )
        .await;
    assert!(r.is_failure());
    let err = format!("{:?}", r.into_result().unwrap_err());
    let code = err
        .split("POLICY_REJECTED:")
        .nth(1)
        .map(|s| s.chars().take_while(|c| c.is_ascii_alphanumeric()).collect::<String>());
    println!("[c] parsed code: {code:?}");
    println!("[c] raw error: {}", &err[..err.len().min(400)]);
    assert_eq!(code.as_deref(), Some("OverCap"));
    assert!(!env.is_paid("b1:owner").await, "rejected call must not change state");
    assert_eq!(env.balance("owner1.sandbox").await, 0);
}

/// (d) Measure gas. Prints a table; asserts only that the measured MAX_BATCH succeeds.
#[tokio::test]
async fn d_measure_gas_and_max_batch() {
    let env = setup().await;
    env.fund_vault(1_000_000_000_000).await;
    let payees: Vec<String> = (0..120).map(|i| format!("p{i}.sandbox")).collect();
    env.register(&payees[..60]).await;
    env.register(&payees[60..]).await;

    let mut key_seq = 0u32;
    let mut batch = |n: usize| -> Value {
        let items: Vec<Value> = (0..n)
            .map(|i| {
                key_seq += 1;
                item(&format!("k{key_seq}:owner"), &payees[i], 1_000_000)
            })
            .collect();
        Value::Array(items)
    };

    // 1. actual gas burnt by the token receipt, per ft_transfer action
    println!("\n[d] n | settle receipt TGas | token receipt TGas | per transfer TGas | callback TGas | total burnt TGas");
    for n in [1usize, 5, 10, 20] {
        let r = env.call(&env.payer, "settle", json!({ "items": batch(n) }), 300).await;
        let outcomes = r.receipt_outcomes().to_vec();
        let total = r.total_gas_burnt.as_gas() as f64 / 1e12;
        assert!(final_bool(r));
        let tg = |o: &near_api::types::transaction::result::ExecutionOutcome| o.gas_burnt.as_gas() as f64 / 1e12;
        let settle = outcomes.iter().find(|o| o.executor_id == env.payer.0).map(tg).unwrap_or(0.0);
        let token = outcomes.iter().find(|o| o.executor_id == env.ft.0).map(tg).unwrap_or(0.0);
        let cb = outcomes
            .iter()
            .filter(|o| o.executor_id == env.payer.0)
            .nth(1)
            .map(tg)
            .unwrap_or(0.0);
        println!("[d] {n:>3} | {settle:>8.2} | {token:>8.2} | {:>6.3} | {cb:>6.2} | {total:>7.2}", token / n as f64);
    }

    // 2. minimum per-transfer attachment that still succeeds (n=5)
    println!("\n[d] transfer_tgas | n=5 ok?");
    for t in [1u64, 2, 3, 4, 5] {
        let r = env
            .call(&env.payer, "settle", json!({ "items": batch(5), "transfer_tgas": t }), 300)
            .await;
        let ok = r.into_result().ok().and_then(|v| v.json::<bool>().ok()).unwrap_or(false);
        println!("[d] {t:>3} | {ok}");
    }

    // 3. largest batch that fits, at a few per-transfer attachments and both prepaid ceilings
    println!("\n[d] prepaid TGas | transfer_tgas | max n that succeeds");
    for prepaid in [300u64, 1000] {
        for t in [3u64, 5] {
            let (mut lo, mut hi) = (1usize, 120usize);
            while lo < hi {
                let mid = (lo + hi + 1) / 2;
                let r = env
                    .call(&env.payer, "settle", json!({ "items": batch(mid), "transfer_tgas": t }), prepaid)
                    .await;
                let ok = r.into_result().ok().and_then(|v| v.json::<bool>().ok()).unwrap_or(false);
                if ok { lo = mid } else { hi = mid - 1 }
            }
            println!("[d] {prepaid:>5} | {t:>3} | {lo}");
        }
    }

    // 4. what happens just over the 1000 TGas ceiling?
    let r = env
        .payer
        .call_function("settle", json!({ "items": batch(1) }))
        .transaction()
        .gas(NearGas::from_tgas(1001))
        .with_signer(env.agent.clone(), env.signer.clone())
        .send_to(&env.net)
        .await;
    match r {
        Ok(res) => println!("\n[d] 1001 TGas prepaid: accepted, full={}", res.is_full()),
        Err(e) => println!("\n[d] 1001 TGas prepaid rejected: {}", format!("{e}").chars().take(200).collect::<String>()),
    }
}

/// What stops a batch at 100 when gas isn't the constraint?
#[tokio::test]
async fn f_batch_of_101_error() {
    let env = setup().await;
    env.fund_vault(1_000_000_000_000).await;
    let payees: Vec<String> = (0..101).map(|i| format!("p{i}.sandbox")).collect();
    env.register(&payees[..60]).await;
    env.register(&payees[60..]).await;
    let items: Vec<Value> = payees.iter().enumerate().map(|(i, p)| item(&format!("x{i}:owner"), p, 1)).collect();
    let r = env.call(&env.payer, "settle", json!({ "items": items, "transfer_tgas": 3 }), 1000).await;
    let failed = r.is_failure();
    let err = format!("{:?}", r.into_result().err());
    let i = err.find("ActionsNumberExceeded").or_else(|| err.find("Exceeded")).or_else(|| err.find("Error")).unwrap_or(0);
    println!("[f] failed={failed} :: {}", &err[i..(i + 220).min(err.len())]);
    assert!(failed);
}
