//! Sandbox integration test: build the wasm, deploy, init, read policy back.
//! Day-1 smoke test only; the full policy suite (with a mock FT) lands Nov 2–3.

use near_api::{AccountId, NearToken};
use near_sdk::serde_json::{Value, json};

async fn create_account(
    sandbox: &near_sandbox::Sandbox,
    name: &str,
) -> testresult::TestResult<near_api::Account> {
    let account_id: AccountId = name.parse()?;
    sandbox
        .create_account(account_id.clone())
        .initial_balance(NearToken::from_near(10))
        .send()
        .await?;
    Ok(near_api::Account(account_id))
}

#[tokio::test]
async fn deploys_and_reports_policy() -> testresult::TestResult<()> {
    let wasm_path = cargo_near_build::build_with_cli(Default::default())?;
    let wasm = std::fs::read(wasm_path)?;

    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let network = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = near_api::Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?,
    )?;

    let operator = create_account(&sandbox, "operator.sandbox").await?;
    let agent = create_account(&sandbox, "agent.sandbox").await?;
    let vault = create_account(&sandbox, "vault.sandbox").await?.as_contract();

    near_api::Contract::deploy(vault.account_id().clone())
        .use_code(wasm)
        .with_init_call(
            "new",
            json!({
                "owner": operator.account_id(),
                "agent": agent.account_id(),
                "token": "usdc.sandbox",
                "daily_limit": "3000000000",
                "payee_delay_ns": "60000000000",
            }),
        )?
        .with_signer(signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    let policy: Value = vault
        .call_function("get_policy", ())
        .read_only()
        .fetch_from(&network)
        .await?
        .data;

    assert_eq!(policy["owner"], json!(operator.account_id()));
    assert_eq!(policy["agent"], json!(agent.account_id()));
    assert_eq!(policy["daily_limit"], json!("3000000000"));
    assert_eq!(policy["payee_delay_ns"], json!("60000000000"));
    Ok(())
}
