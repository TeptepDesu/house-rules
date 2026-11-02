# Continuing on a Windows laptop (Ubuntu on WSL)

Everything runs inside Ubuntu on WSL 2: the web app, the tests, the contracts, and Claude Code. Windows only provides the browser (Meteor wallet) and VS Code's window. Allow about an hour, mostly downloads.

**Before you start, on the Mac:**
1. **Push the local commits** so the new laptop can clone them. Check the repo is still private first: `curl -s -o /dev/null -w '%{http_code}\n' https://api.github.com/repos/TeptepDesu/house-rules` must print `404`. A `200` means public: stop.
2. **Copy the secrets you'll need.** They aren't in git, and they must never go through git, email or chat. Use a password manager or a USB stick:
   - `web/.env.testnet.local`, the settle-only agent key file, for `test:testnet`, `break-it` and running the app live on testnet;
   - *optional:* the full-access keys for `vault.` / `usdc.houserules-operator.testnet`. You only need these to redeploy or upgrade the testnet contracts. They're in the macOS Keychain (saved by near-cli).
   - The operator account `houserules-operator.testnet` lives in Meteor, so you only need its seed phrase on the new laptop.

Check the laptop's CPU first: **Settings → System → About → System type**. These steps assume an x64 (Intel/AMD) machine. On an ARM (Snapdragon) laptop, the local NEAR sandbox used by the contract and integration tests may not have a Linux build, so check before relying on it.

## 1. Install Ubuntu on WSL (Windows side, ~15 min)

1. Open **PowerShell as Administrator** and run:
   ```powershell
   wsl --install -d Ubuntu-24.04
   ```
2. Restart when asked. Ubuntu then opens and asks you to create a Linux username and password. This password is for `sudo`; it has nothing to do with Windows.
3. Check it's WSL **2**: `wsl -l -v` in PowerShell should show `VERSION 2`.
4. From now on, everything happens in the **Ubuntu** terminal (Start menu → Ubuntu), not PowerShell.

**Keep the project in the Linux home folder** (`~/house-rules`), never under `/mnt/c/...`. On the Windows drive, installs and the dev server are many times slower and file watching breaks.

## 2. System packages (Ubuntu, ~5 min)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential pkg-config libssl-dev libudev-dev git curl unzip ca-certificates
git config --global user.name "TeptepDesu"
git config --global user.email "caballerojosephirah@gmail.com"
```

## 3. Node 25.9.0 and pnpm 12.16.1

The versions come from `CLAUDE.md`.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
exec $SHELL            # reload so `nvm` exists
nvm install 25.9.0 && nvm alias default 25.9.0
npm install -g pnpm@12.16.1
node -v && pnpm -v     # v25.9.0, 12.16.1
```

## 4. Rust and cargo-near (only for the contracts and integration tests)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"
cargo install --locked cargo-near@0.22.0
# optional, only to deploy or upgrade contracts:
cargo install --locked near-cli-rs@0.30.1
```

You don't need to install Rust 1.93.0 by hand. `contracts/rust-toolchain.toml` pins it, and rustup installs it with the wasm target the first time you run `cargo` inside `contracts/`.

near-cli on WSL has no keychain. When it asks where to keep keys, choose the **legacy keychain** (`~/.near-credentials`). Never put that folder inside the repo.

## 5. GitHub login and clone

```bash
# GitHub CLI: https://github.com/cli/cli/blob/trunk/docs/install_linux.md (apt instructions), then:
gh auth login          # GitHub.com → HTTPS → login with a web browser
gh auth setup-git
cd ~ && git clone https://github.com/TeptepDesu/house-rules.git && cd house-rules
git log --oneline -1   # should match the Mac's last commit
```

## 6. Put the secrets back

Windows drives are visible from Ubuntu under `/mnt/c`. If the file is in your Windows Downloads folder:

```bash
cp /mnt/c/Users/<you>/Downloads/.env.testnet.local ~/house-rules/web/.env.testnet.local
chmod 600 ~/house-rules/web/.env.testnet.local
```

Then **delete the Windows copy** and empty the Recycle Bin. You don't need `web/.env.local` for local dev: with no `DATABASE_URL`, the app uses PGlite in `web/.data/`.

## 7. Install and prove it works (~15 min)

```bash
cd ~/house-rules
pnpm install
pnpm --filter web exec playwright install --with-deps chromium   # asks for your sudo password
pnpm --filter web typecheck && pnpm --filter web lint
pnpm --filter web test            # expect 367 passed
pnpm --filter web e2e             # expect 20 passed, 3 skipped

cd contracts
cargo test -p vault --lib                                 # 33 passed (first run also installs Rust 1.93.0)
(cd vault && cargo near build non-reproducible-wasm)
(cd mock-ft && cargo near build non-reproducible-wasm)
cargo test -p vault --test sandbox -- --test-threads=4    # 8 passed; first run downloads the NEAR sandbox
cd .. && pnpm --filter web test:integration               # 14 passed (+1 live testnet with the key file)
```

If those match, the laptop is a full replacement for the Mac.

**Running the app:** `pnpm --filter web dev`, then open `http://localhost:3000` in your **Windows** browser. WSL forwards localhost, and the Meteor extension in that browser can sign as usual. To run against testnet, see `CLAUDE.md` → Commands.

## 8. VS Code and Claude Code

1. Install **VS Code on Windows**, then its **WSL** extension (by Microsoft).
2. In Ubuntu: `cd ~/house-rules && code .`. VS Code reopens connected to WSL, shown bottom-left as "WSL: Ubuntu-24.04".
3. Install the **Claude Code** extension in that WSL window, so it runs on the Linux side.
4. Install the CLI inside Ubuntu as well: `curl -fsSL https://claude.ai/install.sh | bash`, then run `claude` once to sign in.
5. Start the first session with: *"Read docs/handover.md and continue."*

**Claude's memory doesn't move with the repo.** It's stored per machine and per folder. The facts that matter are already in the repo: `CLAUDE.md`, and the "Moving machines" notes in `docs/handover.md`.

## Gotchas

- `Permission denied` or slow installs usually mean the repo is under `/mnt/c`. Clone it again into `~`.
- Only one Next dev server can run per folder. Stop `pnpm dev` before `pnpm e2e`.
- If WSL's clock drifts after the laptop sleeps, NEAR transactions and JWTs can fail with time errors. Fix it by running `wsl --shutdown` in PowerShell and reopening Ubuntu.
- If Playwright's Chromium is missing libraries, re-run `playwright install --with-deps chromium`.
