# AGENTS.md — seven-sec 守則（Claude Code / Codex / AGY 共讀）

## 呼叫 7sec 的 OODA 迴圈（最多 3 輪）
1. 改完碼 → 執行 `7sec`（或 `7sec --intent "<一句話意圖>"` / `7sec --spec <設計稿>`）。
2. 依 exit code 行動：
   - `0` PASS → 可 commit。
   - `1` BLOCK → 只修報表列出的語法錯誤 / critical / high / drift / 機密項，再回到步驟 1。
     - 懷疑是誤報的 finding：**先用測試或實測驗證**；確認誤報就不要改程式碼，並在回報中附上證據（反例輸入與實際輸出）。誤報不計入「要修的項目」，但仍須列給使用者；可行時把該反例寫成 `[REQ-xx]` 測試固定下來。
   - `2` TOOL_ERROR → **不要改程式碼**；回報環境問題（未登入、額度、Timeout、diff 過大）給使用者。Timeout 可用環境變數 `SEVENSEC_TIMEOUT_MS`（毫秒，預設 60000，須為正整數）調高後重跑。
3. 第 3 輪仍為 BLOCK → 停止，把剩餘 findings 交給使用者裁示（reviewer 無跨次記憶，已驗證的誤報可能再次出現；回報時標明「已驗證誤報」與「待裁示」兩類）。

## TFVC／非 git 專案（AI 必讀，避免誤判）
- 一律用 `tools/tf7sec --spec <該專案的 spec>`；**必須明確指定 spec**（`--spec` 或環境變數 `TF7SEC_SPEC`），沒有預設值，沒給會被拒絕（exit 2）。spec 由各專案自備（放在該專案自己的 `docs/` 下），**不可跨專案套用**。**不要**自己拼 `tf2utf8 | 7sec`。自拼管線若未加 `set -o pipefail`，上游失敗會變成空輸入，7sec 會印 `Clean working tree` 並 exit 0——**這是假通過**。預期有變更卻看到 `Clean working tree`，一律視為失敗，不是 PASS。
- 7sec 會把 diff 送給外部模型（agy、codex）。**不得**送審含連線字串、密碼、金鑰、真實個資的檔案；遮蔽只認特定格式，不認主機、帳號、cookie。`tf7sec` 只依「檔名」排除設定檔，不檢查內容。
- `tf difference` 看不到新增檔案，須另外審（見 README），且該路徑不經 `tf-exclude`，送審前要自行確認內容。
- 文件與指令中的 `<…>` 是佔位符，必須換成實際值；每個區塊都標明在 Windows cmd 或 WSL 執行，不可混用。`wsl bash -c` 會被外層 shell 重新解析，`exit=` 不可信，請用 `wsl -e`。
- 跑不明的專案腳本（例如 `verify.ps1`）之前先讀過它會做什麼；整合測試可能真的寄信或改資料。

## 鐵律
- 核心只有 `src/cli.mjs` 與 `src/goldfish.mjs`；`src/**/*.mjs` 總行數 ≤ 350（`npm test` 守門，無位元組上限）。
- 只用 Node 24 原生 API，零依賴。
- 效能 SLO：7sec 自身開銷（git、遮蔽、路由、解析）< 300 ms。
- 每個 `test()` 標題以 `[REQ-xx]` 開頭，對應規格書 §5 驗收基準；新增需求先加測試。

## 架構決策紀錄（ADR）
- **ADR-01 Stateless tmpdir isolation**：每次審查在新建的 `os.tmpdir()/7sec-*` 空目錄執行並於結束時刪除；reviewer 不帶任何跨次記憶。
- **ADR-02 Node 24 zero-dependency**：只用 `node:` 內建模組，無 npm 執行期依賴，供應鏈攻擊面趨近於零（`npm run sbom` 可驗證）。
- **ADR-03 3-tool temporal decoupling**：EGM（寫碼前設計）→ 7sec（commit 前 diff 閘門）→ security-audit（發佈前深度稽核），三者只以檔案與提示訊息銜接，無程式碼耦合。
- **ADR-04 350-LOC hard ceiling**：`src/` ≤ 350 行由 REQ-09 強制；新功能須以刪減換取預算。
