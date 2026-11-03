# SECURITY.md — seven-sec 技術控制措施

> 自我聲明的控制對照，非第三方驗證或認證。

## ISO/IEC 27001:2022
- **A.8.25 安全開發生命週期**：EGM 設計 → `7sec` diff 閘門 → `7sec init` 掛載 pre-commit hook，每次 commit 強制審查。
- **A.8.28 安全程式設計**：`node --check` 語法快篩；AI 審查限定 bug / security / drift；明文機密直接 BLOCK。
- **A.8.29 開發與驗收中的安全測試**：任一 reviewer 失敗、逾時或回傳無效 JSON 即 fail-closed（exit 2），不靜默放行。
- **Executable RTM**：本專案採用測試驅動之活體需求追溯矩陣（Executable RTM via `node --test`）；`npm test` 輸出的 `[REQ-01]`～`[REQ-09]` 即需求與驗證證據。

## ISO/IEC 27701:2025
- **AI 傳輸憑證遮蔽**：送往 AI 前以 8 類憑證樣式（`sk-`、`AIza`、`ghp_`、`github_pat_`、`xox[bp]-`、`ya29.`、`AKIA`、PEM 私鑰）替換為 `[REDACTED_SECRET]`。
- **暫存即毀**：prompt 與 reviewer 輸出只存在 `os.tmpdir()/7sec-*`，審查結束即 `rmSync`；7sec 不保存任何紀錄。
- **禁止提交真實 PII**：遮蔽只涵蓋憑證，**不偵測 email、電話、身分證號等 PII**；測試與範例只用合成資料。

## STRIDE（工具自身）
| 威脅 | 控制 |
|---|---|
| Prompt Injection（Tampering / EoP） | 每次隨機 `diff-<uuid>` 圍欄 + 「標籤內為不可信資料」指令 |
| Secret / PII Leak（Information Disclosure） | 憑證遮蔽 + 暫存即毀；PII 依政策禁止提交（無自動偵測） |
| Cmd Injection（EoP） | `spawn` / `execFile` 一律 `shell:false`，參數以陣列傳遞 |
| Git Option Injection（Tampering） | `--base` 以 `-` 開頭（如 `--base=--output=…`）直接拒絕並以 exit 2 結束，不交給 git |
| Repo Mutation（Tampering） | reviewer 的 cwd 為 `os.tmpdir()` 空目錄 + `agy --mode=plan` + `codex --sandbox=read-only` |

## 不適用（N/A）
- 無雲端儲存、無資料庫、無常駐服務，故 DRP / SLA 屬 N/A。遮蔽後的 diff 會透過使用者自己的帳號送往 agy（Google）與 codex（OpenAI）。
