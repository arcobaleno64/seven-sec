# seven-sec (`7sec`)

A stateless git-diff gate: a zero-context reviewer (agy, codex) that blocks bugs, security issues and drift.

[繁體中文說明 →](README.zh-TW.md)

> **Independent project.** `seven-sec` is community-maintained and is **not affiliated with, endorsed by, or sponsored by Google LLC, Anthropic, or OpenAI**. Third-party names identify tools this project interoperates with or discusses; their respective terms govern those systems.

## Contents

[Start here](#start-here) · [When to use it](#when-to-use-it) · [Why a goldfish](#why-a-goldfish) · [Commands and capabilities](#commands-and-capabilities) · [Use it with a coding agent](#use-it-with-a-coding-agent) · [Known limitations](#known-limitations) · [Troubleshooting](#troubleshooting) · [Security and trust boundary](#security-and-trust-boundary) · [Versions and support](#versions-and-support) · [Contributing, license, related projects](#contributing-license-related-projects)

## Start here

```bash
# 1. In the seven-sec directory, once per machine: registers the global 7sec command (the hook depends on it)
npm link
# 2. At the root of the repo you want to guard: check the toolchain, then install the pre-commit hook
7sec doctor
7sec init
# 3. Daily: review your working tree (staged + unstaged, tracked files)
7sec
```

Expected: `7sec doctor` prints one line per check (node, git, git repo, agy, codex), `✔` when it passes. `7sec init` prints `✔ pre-commit hook: <path>`, and the hook contains the single line `7sec --staged`. On a tree with no changes, `7sec` prints `✔ Clean working tree (0 lines changed)` and exits 0.

`7sec doctor` must run inside a git repository; elsewhere the `git repo` check fails and it exits 2.

## When to use it

| You need | Use 7sec? |
|----------|-----------|
| A last check on a diff before every commit, with no setup per project | Yes |
| To catch an AI coding agent drifting from the intent or spec you gave it | Yes (`--intent`, `--spec`) |
| A review of a whole PR branch | Yes (`--base origin/main`) |
| A diff from a non-git system such as TFVC | Yes, via [docs/tfvc.md](docs/tfvc.md) |
| A scan of existing code or git history for secrets | No: it reads only the diff |
| A deep pre-release security audit | No: see [three-lens](#contributing-license-related-projects) |
| A review of code you may not send to external models | No: every review sends the diff out |
| A CI job | Not yet: only the local hook and manual runs exist |

## Why a goldfish

Each review starts a fresh reviewer process in an empty temporary directory, with only the diff, an optional spec and an optional intent. It carries no memory from earlier runs and cannot read your repository, so it can only judge what the diff shows (`src/goldfish.mjs`). The price is that it sometimes reports false positives and gives different answers across runs; see [Known limitations](#known-limitations).

## Commands and capabilities

| Command | What it does |
|---------|--------------|
| `7sec` | Review the working tree (staged + unstaged, tracked files) |
| `7sec --staged` (`-s`) | Review the staging area only; this is what the hook runs |
| `7sec --base <ref>` | Review `<ref>...HEAD`, e.g. a whole PR branch |
| `7sec --diff <file\|->` | Review a unified diff from a file or stdin; no git involved |
| `7sec --spec <file>` | Also check the diff against a design or rules file |
| `7sec --intent "<text>"` | Also check the diff against a one-line intent |
| `7sec --json` | Machine-readable output |
| `7sec doctor` / `7sec init` / `7sec --help` | Check the toolchain / install the pre-commit hook / print usage |

Environment variables: `SEVENSEC_FAST` (`codex` by default, or `agy`; any other value exits 2), `SEVENSEC_TIMEOUT_MS` (reviewer timeout in milliseconds, default 60000, must be a positive integer), `TF7SEC_SPEC` (the spec for `tools/tf7sec`).

Exit codes: `0` PASS · `1` BLOCK (syntax error, critical, high, drift, or a plaintext secret) · `2` TOOL_ERROR.

| Capability | Status | Evidence |
|------------|--------|----------|
| Fast Path: one reviewer (codex by default) for ordinary small changes | Active | `fastReviewer()` in `src/goldfish.mjs`; `[REQ-02]` test |
| Dual Quorum: agy + codex for a change of 50 lines or more, or one touching auth/security/crypto/jwt/login/token/permission/.github/workflows, package.json, Dockerfile*, .env*, Web.config, app.config, appsettings*.json, Global.asax*; if either reviewer fails, the gate fails closed | Active | `isDual()` and `TIER1` in `src/cli.mjs` |
| Pre-commit hook (`7sec init`) | Active | `init()` in `src/cli.mjs` |
| Drift check against `--spec` / `--intent` | Active | `drift` category in `src/goldfish.mjs` |
| TFVC input (`tools/tf7sec`, needs `python3`) | Active | [docs/tfvc.md](docs/tfvc.md) |
| Quantitative claims (accuracy, speed) | Not applicable | None are made: the numbers above are fixed rules, not measurements |

## Use it with a coding agent

Add these rules to `AGENTS.md` (or `CLAUDE.md`) at the target project root, then run `7sec init`. **Copy the whole block**: "fix until green" with no round limit and no false-positive rule leads an AI to change correct code just to silence a false positive, and to edit code when the tool itself fails. The full version is [AGENTS.md](AGENTS.md).

```markdown
- A commit must pass the `7sec --staged` gate first.
- exit 1 (BLOCK): fix only the listed items, at most 3 rounds; if you suspect a false positive, test it first, and once confirmed do not change code to silence it — report it with evidence; if the 3rd round is still BLOCK, stop and hand it to the user.
- exit 2 (TOOL_ERROR): do not change code; report the environment problem (not logged in, quota, timeout, oversized diff).
```

Pairing with Google EGM (design before coding, catch drift after):

```bash
7sec --spec docs/designs/auth-flow.md        # a design doc produced beforehand
7sec --intent "only add retry logging; do not change the return type"
```

Onboarding a new or existing project: [docs/onboarding.md](docs/onboarding.md) (Traditional Chinese).

## Known limitations

- **128 KB limit**: when `diff + spec` exceeds 128 KB, 7sec exits 2 and refuses; it never truncates silently. Use `git add <key files>` with `7sec --staged` to review in small commits.
- It reads only the diff: it does not scan git history, so it cannot find secrets already committed.
- The syntax pre-check (`node --check`) covers `.js` and `.mjs` files only.
- Reviewers produce false positives and answers that differ from run to run; confirm before changing correct code.
- Secret redaction recognises specific credential formats only; it does not mask hosts, accounts, cookies or personal data (details in [SECURITY.md](SECURITY.md)).
- `git commit --no-verify` bypasses the hook.
- No CI version; local hook and manual runs only.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `7sec doctor` shows `✖ git repo` | Not run inside a git repository | `cd` to the repo root and rerun |
| `✖ agy` or `✖ codex`: `not found on PATH` | The CLI is not installed or not on `PATH` | Install it, log in, rerun `7sec doctor` |
| `Diff + spec N KB > 128 KB` (exit 2) | The change is over the size limit | Commit in smaller pieces with `git add <files>` and `7sec --staged` |
| `TOOL_ERROR: ... timed out or aborted` | A reviewer exceeded the timeout | Raise `SEVENSEC_TIMEOUT_MS` (milliseconds) and rerun |
| `TOOL_ERROR: SEVENSEC_FAST must be "codex" or "agy"` | Invalid value | Unset it, or set `codex` or `agy` |
| `TOOL_ERROR: --base must be a git ref` | The value starts with `-` | Pass a branch name or commit |
| `Unknown command: ...` (exit 2) | Only `review`, `doctor` and `init` exist | See `7sec --help` |

## Security and trust boundary

| Question | Answer |
|----------|--------|
| What leaves your machine? | The diff, the spec and the intent, after credential redaction, sent through your own `agy` (Google) and `codex` (OpenAI) accounts |
| What is stored? | Prompts and reviewer output live only in `os.tmpdir()/7sec-*` and are deleted when the review ends; 7sec keeps no logs |
| What can a reviewer touch? | Its working directory is an empty temporary directory; `agy --mode=plan` and `codex --sandbox=read-only` |
| What if a reviewer fails, times out or returns invalid JSON? | Exit 2; the change is never silently passed |
| What is not covered? | Personal data and non-credential secrets are not detected; do not put real personal data in tests or examples |

Control mapping and threat model: [SECURITY.md](SECURITY.md) (self-declared, not third-party certified).

## Versions and support

- Package version `0.1.0` (`package.json`). <!-- volatile -->
- Node.js `>= 24` is required (`engines` in `package.json`); `7sec doctor` checks it. <!-- volatile -->
- `git`, `agy` and `codex` must be on `PATH`. No minimum version is enforced for any of them.
- Last observed working: Node v24.14.1, git 2.54.0, agy 1.5.2, codex-cli 0.166.0 on Windows 11, 2026-11-06 (`7sec doctor`, `--help`, `init` and a clean-tree run; the reviewer path was not exercised). <!-- volatile -->

## Contributing, license, related projects

- Rules for coding agents working on this repository: [AGENTS.md](AGENTS.md). There is no `CONTRIBUTING.md`.
- Tests: `npm test` (run in the seven-sec directory).
- License: MIT, see [LICENSE](LICENSE).
- Related, and independent of each other (neither is bundled with or required by the other): [`three-lens`](https://github.com/arcobaleno64/three-lens), a multi-stage security assurance plugin for Antigravity CLI. Run it for a deeper audit before release; 7sec prints a hint when a change touches a high-risk path.
