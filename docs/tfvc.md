# Non-git projects: TFVC

[繁體中文 →](tfvc.zh-TW.md)

`--diff` reads a unified diff directly (a file, or `-` for stdin). It never calls git and does no syntax pre-check. TFVC output has several pitfalls, which `tools/` handles (needs `python3`, which is not part of the 7sec core):

- **Mixed encodings**: the header and the local side are Big5 (CP950), while the server side may be UTF-8, so one diff has no single encoding → `tf2utf8` decides line by line.
- **Files carrying connection details would be sent out**: `tf-exclude` drops whole entries by file name — `app.config`, `web.config`, `appsettings*.json`, `.env*`, `Configuration.cs`, `*.pubxml`, `secret(s).*` and so on — and fails closed when it cannot recognise the format. It looks at file names only, never at contents.
- **`tf difference` cannot see newly added files** (they have no server version) → see below.

> **Read this first**: angle brackets `<…>` (`<repo>`, `<spec>`, `<path to TF.exe>`, `<one-line intent>`) are **placeholders that must be replaced with real values; do not run them literally**. `[…]` means optional. Every block names its environment (Windows cmd or WSL bash); do not mix them.

```bat
:: 1.【Windows cmd】Do not use a PowerShell pipeline (it re-encodes the data). One folder at a time, saved as a raw file
cd /d C:\temp
"<path to TF.exe>" difference "D:\repos\X\SomeProject" /recursive /format:unified > some.diff

:: 2.【Windows cmd calling WSL】One-line review (wsl -e bypasses the default shell; use the full path, since PATH may not include ~/.local/bin)
type C:\temp\some.diff | wsl -e <repo>/tools/tf7sec --spec <spec> [--intent "<one-line intent>"]
del C:\temp\some.diff
```
`tf7sec` = `tf2utf8 | tf-exclude | 7sec --diff - --spec <spec>`. **If the conversion or filter stage fails, it exits 2 and never calls a reviewer**; once both stages succeed, the exit code is 7sec's own 0 / 1 / 2. `Clean working tree` (exit 0) is printed only when the input is genuinely empty. **When you chain the pipeline yourself**, add `set -o pipefail`; otherwise an upstream failure becomes empty input and is falsely reported as a pass. **`--spec <file>` (or the environment variable `TF7SEC_SPEC`) is required and has no default**; without it, 7sec exits 2 and refuses, without calling a reviewer. This is deliberate: a default would quietly apply one project's rules to another project's diff. The spec for the PROJ1 project is this repo's `docs/example-spec.md`.

**Newly added files** (first confirm the content holds no credentials or hosts): build a "new from empty file" diff with git. This path **cannot use `tf7sec`** (it accepts only TF format and rejects git format):
```bat
:: 【Windows cmd】`NUL` is the Windows empty file; the Linux equivalent is /dev/null
git diff --no-index --no-color -- NUL Mail/New.cs > C:\temp\new.diff
:: 【Windows cmd calling WSL】This path skips tf-exclude, so before sending, confirm yourself that the file holds no credentials, hosts or personal data
type C:\temp\new.diff | wsl -e bash -c "set -o pipefail; <repo>/tools/tf2utf8 | 7sec --diff - --spec <spec>"
```
**Limits**: `diff + spec` over 128 KB exits 2 (no truncation) → split by folder. The default `wsl` distribution may not mount `C:`, so feed data through stdin rather than relying on `/mnt/c`. Trust the `exit=` value from `wsl -e` (`wsl bash -c` is re-parsed by the outer shell and is not reliable).

