# SettleStay Vault

Holds an operator's USDC and enforces payout policy on-chain. Spec: `plan.md` §4 (→ `docs/vault-spec.md`).

```bash
cargo near build non-reproducible-wasm   # → target/near/vault.wasm
cargo test                               # unit + sandbox integration tests
```
