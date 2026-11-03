# seven-sec (`7sec`)

> 7-Second Memory, Zero-Config Diff Gate — 零上下文金魚審查你的 git diff。

## 30 秒上手
```bash
npm link              # 在 seven-sec 目錄執行一次：全域註冊 7sec 指令（hook 依賴它）
7sec init             # 在目標 repo 根目錄執行：寫入 .git/hooks/pre-commit（7sec --staged）
7sec doctor           # 檢查 node>=24 / git / agy / codex
7sec                  # 審工作區（staged + unstaged，tracked 檔）
7sec --staged         # 只審暫存區（適合 pre-commit hook）
7sec --base origin/main   # 審整個 PR 分支（merge-base...HEAD）
7sec --intent "一句話意圖" # 免寫規格手銬：防 AI 擅自重構、改壞型別或擴大戰線 (抓 drift)
7sec --json           # 機器可讀輸出
```

路由：一般小改動 → `⚡ Fast Path (agy)`；≥ 50 行或觸碰 auth/security/crypto/jwt/login/token/permission/.github/workflows、package.json、Dockerfile*、.env*、Web.config、app.config、appsettings*.json、Global.asax* → `🛡️ Dual Quorum (agy + codex)`，任一失敗即 fail-closed。

Exit：`0` PASS · `1` BLOCK（語法錯誤 / critical / high / drift / 明文機密）· `2` TOOL_ERROR。

> **128 KB 門檻**：`diff + spec` 超過 128 KB 時 exit 2 拒絕（拒絕偷偷截斷）。請改用 `git add <關鍵檔案>` 搭配 `7sec --staged` 進行原子化小提交審查。

## 非 git 專案：TFVC（`--diff <file|->` + `tools/`）
`--diff` 直接讀入 unified diff（檔案或 `-` 代表 stdin），完全不呼叫 git，也不做語法預檢。但 TFVC 的輸出有幾個坑，`tools/` 已處理（需要 `python3`，不屬於 7sec 核心）：

- **編碼混雜**：標頭與本機端是 Big5（CP950），伺服器端可能是 UTF-8，同一份 diff 沒有單一編碼 → `tf2utf8` 逐行判斷。
- **帶連線資訊的檔案會被送出去**：`tf-exclude` 依檔名整段排除 `app.config`、`web.config`、`appsettings*.json`、`.env*`、`Configuration.cs`、`*.pubxml`、`secret(s).*` 等；認不得格式時 fail closed。它只看檔名，不看內容。
- **`tf difference` 看不到新增檔案**（沒有伺服器版本）→ 見下方。

> **讀這一節前**：角括號 `<…>`（`<repo>`、`<spec>`、`<TF.exe 路徑>`、`<一句話意圖>`）是**佔位符，必須換成實際值，不可照字面執行**；`[…]` 表示可省略。每個區塊都標明執行環境（Windows cmd 或 WSL bash），不可混用。

```bat
:: 1.【Windows cmd】不要用 PowerShell 管線（會被重新編碼）。每次一個資料夾，存成原始檔
cd /d C:\temp
"<TF.exe 路徑>" difference "D:\repos\X\SomeProject" /recursive /format:unified > some.diff

:: 2.【Windows cmd 呼叫 WSL】一行審查（wsl -e 不經預設 shell；用完整路徑，PATH 不一定含 ~/.local/bin）
type C:\temp\some.diff | wsl -e <repo>/tools/tf7sec --spec <spec> [--intent "<一句話意圖>"]
del C:\temp\some.diff
```
`tf7sec` = `tf2utf8 | tf-exclude | 7sec --diff - --spec <spec>`。**轉換或過濾階段失敗 → exit 2，且不會呼叫 reviewer**；兩階段都成功後，exit code 就是 7sec 本身的 0／1／2。輸入真的是空的才會印 `Clean working tree`（exit 0）。**自己用管線串接時**必須加 `set -o pipefail`，否則上游失敗會變成空輸入而誤報通過。**`--spec <file>`（或環境變數 `TF7SEC_SPEC`）是必填，沒有預設值**；沒給就 exit 2 並拒絕，不會呼叫 reviewer。這是刻意的：預設值會把一個專案的規則悄悄套到另一個專案的 diff 上。PROJ1 專案的 spec 是本 repo 的 `docs/example-spec.md`。

**新增檔案**（先確認內容沒有憑證／主機）：用 git 做成「從空檔案新增」的 diff，這條路**不能用 `tf7sec`**（它只認 TF 格式，遇到 git 格式會拒絕）：
```bat
:: 【Windows cmd】`NUL` 是 Windows 的空檔案；Linux 上等價的是 /dev/null
git diff --no-index --no-color -- NUL Mail/New.cs > C:\temp\new.diff
:: 【Windows cmd 呼叫 WSL】此路徑不經 tf-exclude，所以送審前必須自行確認檔案內容沒有憑證、主機、個資
type C:\temp\new.diff | wsl -e bash -c "set -o pipefail; <repo>/tools/tf2utf8 | 7sec --diff - --spec <spec>"
```
**限制**：`diff + spec` 超過 128 KB 會 exit 2（不截斷）→ 依資料夾分批；`wsl` 預設發行版不一定掛載 `C:`，所以用 stdin 餵入，不要依賴 `/mnt/c`；`exit=` 以 `wsl -e` 為準（`wsl bash -c` 會被外層 shell 重新解析而不可信）。

## 與 Google EGM 搭配（寫碼前設計 → 寫碼後抓漂移）
```bash
# 1. 用 EGM 產出設計稿 docs/designs/auth-flow.md
# 2. 實作後檢查是否偏離設計
7sec --spec docs/designs/auth-flow.md
7sec --intent "只加重試日誌，不改變回傳型別"
```

## 與 Coding Agent (Claude Code / Codex) 自動自癒閉環
在目標專案根目錄的 `AGENTS.md`（或 `CLAUDE.md`）加入守則，並執行 `7sec init`：
```markdown
- 提交前必須通過 `7sec -s` 門禁。
- 若收到 exit 1 (BLOCK)，必須依據反例自行修復代碼，直到 exit 0 方可 commit。
```
從此 AI 在 commit 被擋下時，會自己在背景讀取反例並修復程式碼，直到綠燈通過才向你交差。

## 測試
```bash
npm test
```
