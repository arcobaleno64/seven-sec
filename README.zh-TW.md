# seven-sec (`7sec`)

無狀態的 git diff 閘門：零上下文的審查者（agy、codex）擋下 bug、資安問題與偏離意圖。

[English →](README.md)

> **獨立專案。** `seven-sec` 由社群維護，**與 Google LLC、Anthropic 及 OpenAI 均無隸屬、背書或贊助關係**。第三方名稱僅用於指稱本專案互通或討論的工具；使用相關系統時，適用其各自條款。

## 目錄

[上手](#上手) · [何時用](#何時用) · [為什麼是金魚](#為什麼是金魚) · [定位](#定位) · [指令與能力](#指令與能力) · [搭配 coding agent](#搭配-coding-agent) · [已知限制](#已知限制) · [疑難排解](#疑難排解) · [安全與信任邊界](#安全與信任邊界) · [版本與支援](#版本與支援) · [貢獻、授權、相關專案](#貢獻授權相關專案)

## 上手

```bash
# 1. 在 seven-sec 目錄執行，每台機器一次：全域註冊 7sec 指令（hook 依賴它）
npm link
# 2. 在要守護的 repo 根目錄：檢查工具鏈，再安裝 pre-commit hook
7sec doctor
7sec init
# 3. 日常：審查工作區（staged + unstaged，tracked 檔）
7sec
```

預期：`7sec doctor` 每項檢查（node、git、git repo、agy、codex）各印一行，通過為 `✔`。`7sec init` 印出 `✔ pre-commit hook: <路徑>`，hook 內容只有一行 `7sec --staged`。工作區沒有變更時，`7sec` 印出 `✔ Clean working tree (0 lines changed)` 並 exit 0。

`7sec doctor` 必須在 git repo 內執行；在其他地方 `git repo` 檢查會失敗並 exit 2。

## 何時用

| 需求 | 用 7sec？ |
|------|-----------|
| 每次 commit 前對 diff 做最後一道檢查，且不用逐專案設定 | 是 |
| 抓 AI coding agent 偏離你給的意圖或規格 | 是（`--intent`、`--spec`） |
| 審整個 PR 分支 | 是（`--base origin/main`） |
| 來自 TFVC 等非 git 系統的 diff | 是，見 [docs/tfvc.zh-TW.md](docs/tfvc.zh-TW.md) |
| 掃描既有程式碼或 git 歷史裡的機密 | 否：它只讀 diff |
| 發佈前的深度資安稽核 | 否：見 [three-lens](#貢獻授權相關專案) |
| 審查不可送給外部模型的程式碼 | 否：每次審查都會把 diff 送出去 |
| CI 任務 | 目前沒有：只有本機 hook 與手動執行 |

## 為什麼是金魚

每次審查都會在空的暫存目錄啟動全新的審查者行程，只帶 diff、選用的 spec 與選用的意圖。它沒有先前執行的記憶，也讀不到你的 repo，所以只能判斷 diff 顯示的內容（`src/goldfish.mjs`）。代價是偶爾誤報、每次結果不盡相同；見[已知限制](#已知限制)。

## 定位

7sec 位於三段流程的中間。三者各自獨立，任一方都不需要另外兩者。

```text
 寫碼前                   提交時                     發佈前
 Google EGM       -->     7sec（本 repo）    -->     three-lens (3lens)
 先設計變更               把關每一份 diff            深度資安稽核
 （產出 spec）            （--spec / --intent）      （/three-lens:3lens）
```

| 階段 | 工具 | 交接內容 |
|------|------|----------|
| 事前 | Google EGM：先寫設計 | 一份設計稿，用 `--spec` 交給 7sec |
| 事中 | 7sec：零上下文審查者拿設計稿檢查每份 diff | PASS 或 BLOCK 報表；觸碰高風險路徑時印出提示，建議跑 3lens |
| 事後 | [`three-lens`](https://github.com/arcobaleno64/three-lens)：對變更做多階段稽核 | 出貨前的資安保證報告 |

交接都是手動的：7sec 只讀你指定的 spec 檔並印出提示，不會呼叫 EGM 或 3lens。

## 指令與能力

| 指令 | 作用 |
|------|------|
| `7sec` | 審查工作區（staged + unstaged，tracked 檔） |
| `7sec --staged`（`-s`） | 只審暫存區；hook 執行的就是它 |
| `7sec --base <ref>` | 審 `<ref>...HEAD`，例如整個 PR 分支 |
| `7sec --diff <file\|->` | 審來自檔案或 stdin 的 unified diff；完全不碰 git |
| `7sec --spec <file>` | 另外對照設計稿或規則檔 |
| `7sec --intent "<文字>"` | 另外對照一句話意圖 |
| `7sec --json` | 機器可讀輸出 |
| `7sec doctor` / `7sec init` / `7sec --help` | 檢查工具鏈／安裝 pre-commit hook／印出用法 |

環境變數：`SEVENSEC_FAST`（預設 `codex`，可改 `agy`；其他值 exit 2）、`SEVENSEC_TIMEOUT_MS`（審查者逾時，單位毫秒，預設 60000，須為正整數）、`TF7SEC_SPEC`（`tools/tf7sec` 用的 spec）。

Exit：`0` PASS · `1` BLOCK（語法錯誤、critical、high、drift 或明文機密）· `2` TOOL_ERROR。

| 能力 | 狀態 | 證據 |
|------|------|------|
| Fast Path：一般小改動由單一審查者（預設 codex）審查 | Active | `src/goldfish.mjs` 的 `fastReviewer()`；`[REQ-02]` 測試 |
| Dual Quorum：≥ 50 行，或觸碰 auth/security/crypto/jwt/login/token/permission/.github/workflows、package.json、Dockerfile*、.env*、Web.config、app.config、appsettings*.json、Global.asax* 時，agy + codex 並審；任一失敗即 fail-closed | Active | `src/cli.mjs` 的 `isDual()` 與 `TIER1` |
| Pre-commit hook（`7sec init`） | Active | `src/cli.mjs` 的 `init()` |
| 對照 `--spec` / `--intent` 的偏離檢查 | Active | `src/goldfish.mjs` 的 `drift` 類別 |
| TFVC 輸入（`tools/tf7sec`，需要 `python3`） | Active | [docs/tfvc.zh-TW.md](docs/tfvc.zh-TW.md) |
| 量化宣稱（準確率、速度） | 不適用 | 不做任何宣稱：上列數字是固定規則，不是量測值 |

## 搭配 coding agent

在目標專案根目錄的 `AGENTS.md`（或 `CLAUDE.md`）加入下列守則，並執行 `7sec init`。**請整段複製**：「修到綠燈為止」而沒有輪數上限與誤報規則，AI 會為了消掉誤報去改正確的程式碼，並在工具出錯時也亂改程式。完整版見 [AGENTS.md](AGENTS.md)。

```markdown
- 提交前必須通過 `7sec --staged` 門禁。
- exit 1 (BLOCK)：只修報表列出的項目，最多 3 輪；懷疑誤報先實測，確認誤報就不要為了消掉它而改碼，附證據回報；第 3 輪仍 BLOCK 就停下，交給使用者裁示。
- exit 2 (TOOL_ERROR)：不要改程式碼，回報環境問題（未登入、額度、逾時、diff 過大）。
```

與 Google EGM 搭配（寫碼前設計，寫碼後抓漂移）：

```bash
7sec --spec docs/designs/auth-flow.md        # 事先用 EGM 產出的設計稿
7sec --intent "只加重試日誌，不改變回傳型別"
```

新專案起手或接手既有專案：見 [docs/onboarding.md](docs/onboarding.md)。

## 已知限制

- **128 KB 門檻**：`diff + spec` 超過 128 KB 時 exit 2 拒絕，絕不偷偷截斷。請改用 `git add <關鍵檔案>` 搭配 `7sec --staged` 做小提交審查。
- 只讀 diff：不掃 git 歷史，所以找不到已經提交的機密。
- 語法預檢（`node --check`）只涵蓋 `.js` 與 `.mjs` 檔。
- 審查者會誤報，且每次結果不盡相同；改動正確的程式碼之前先確認。
- 機密遮蔽只認特定憑證格式；不會遮主機、帳號、cookie 或個資（細節見 [SECURITY.md](SECURITY.md)）。
- `git commit --no-verify` 會繞過 hook。
- 沒有 CI 版本，只有本機 hook 與手動執行。

## 疑難排解

| 症狀 | 原因 | 修法 |
|------|------|------|
| `7sec doctor` 顯示 `✖ git repo` | 不在 git repo 內執行 | `cd` 到 repo 根目錄再跑 |
| `✖ agy` 或 `✖ codex`：`not found on PATH` | 未安裝，或不在 `PATH` | 安裝並登入後重跑 `7sec doctor` |
| `Diff + spec N KB > 128 KB`（exit 2） | 變更超過大小上限 | 用 `git add <檔案>` 搭配 `7sec --staged` 分批提交 |
| `TOOL_ERROR: ... timed out or aborted` | 審查者超過逾時 | 調高 `SEVENSEC_TIMEOUT_MS`（毫秒）後重跑 |
| `TOOL_ERROR: SEVENSEC_FAST must be "codex" or "agy"` | 值不合法 | 取消設定，或設為 `codex`／`agy` |
| `TOOL_ERROR: --base must be a git ref` | 值以 `-` 開頭 | 傳入分支名稱或 commit |
| `Unknown command: ...`（exit 2） | 只有 `review`、`doctor`、`init` | 見 `7sec --help` |

## 安全與信任邊界

| 問題 | 答案 |
|------|------|
| 什麼會離開你的機器？ | 遮蔽憑證後的 diff、spec 與意圖，經由你自己的 `agy`（Google）與 `codex`（OpenAI）帳號送出 |
| 存了什麼？ | prompt 與審查者輸出只存在 `os.tmpdir()/7sec-*`，審查結束即刪除；7sec 不保存任何紀錄 |
| 審查者能碰什麼？ | 工作目錄是空的暫存目錄；`agy --mode=plan` 與 `codex --sandbox=read-only` |
| 審查者失敗、逾時或回傳無效 JSON 時？ | exit 2；不會靜默放行 |
| 哪些沒涵蓋？ | 不偵測個資與非憑證類機密；測試與範例請勿放真實個資 |

控制措施對照與威脅模型：[SECURITY.md](SECURITY.md)（自我聲明，非第三方認證）。

## 版本與支援

- 套件版本 `0.1.0`（`package.json`）。 <!-- volatile -->
- 需要 Node.js `>= 24`（`package.json` 的 `engines`），`7sec doctor` 會檢查。 <!-- volatile -->
- `git`、`agy`、`codex` 須在 `PATH` 上。不強制任何最低版本。
- 最近一次實測可用：Node v24.14.1、git 2.54.0、agy 1.5.2、codex-cli 0.166.0，Windows 11，2026-11-06（跑過 `7sec doctor`、`--help`、`init` 與乾淨工作區；審查者路徑未實際執行）。 <!-- volatile -->

## 貢獻、授權、相關專案

- 在本 repo 工作的 coding agent 守則：[AGENTS.md](AGENTS.md)。沒有 `CONTRIBUTING.md`。
- 測試：`npm test`（在 seven-sec 目錄執行）。
- 授權：MIT，見 [LICENSE](LICENSE)。
- 相關專案，兩者互不綁定（任一方都不隨另一方提供，也不是使用另一方的必要條件）：[`three-lens`](https://github.com/arcobaleno64/three-lens)，Antigravity CLI 的多階段資安保證外掛。發佈前想做深度稽核時使用；變更觸碰高風險路徑時，7sec 會印出提示。
