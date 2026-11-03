# AGENTS.md — seven-sec 守則（Claude Code / Codex / AGY 共讀）

## 呼叫 7sec 的 OODA 迴圈（最多 3 輪）
1. 改完碼 → 執行 `7sec`（或 `7sec --intent "<一句話意圖>"` / `7sec --spec <設計稿>`）。
2. 依 exit code 行動：
   - `0` PASS → 可 commit。
   - `1` BLOCK → 只修報表列出的語法錯誤 / critical / high / drift / 機密項，再回到步驟 1。
     - 懷疑是誤報的 finding：**先用測試或實測驗證**；確認誤報就不要改程式碼，並在回報中附上證據（反例輸入與實際輸出）。誤報不計入「要修的項目」，但仍須列給使用者；可行時把該反例寫成 `[REQ-xx]` 測試固定下來。
   - `2` TOOL_ERROR → **不要改程式碼**；回報環境問題（未登入、額度、Timeout、diff 過大）給使用者。
3. 第 3 輪仍為 BLOCK → 停止，把剩餘 findings 交給使用者裁示（reviewer 無跨次記憶，已驗證的誤報可能再次出現；回報時標明「已驗證誤報」與「待裁示」兩類）。

## 鐵律
- 核心只有 `src/cli.mjs` 與 `src/goldfish.mjs`；`src/**/*.mjs` 總行數 ≤ 350、總大小 ≤ 20,480 bytes（20 KB，`npm test` 守門）。
- 只用 Node 24 原生 API，零依賴。
- 效能 SLO：7sec 自身開銷（git、遮蔽、路由、解析）< 300 ms。
- 每個 `test()` 標題以 `[REQ-xx]` 開頭，對應規格書 §5 驗收基準；新增需求先加測試。

## 架構決策紀錄（ADR）
- **ADR-01 Stateless tmpdir isolation**：每次審查在新建的 `os.tmpdir()/7sec-*` 空目錄執行並於結束時刪除；reviewer 不帶任何跨次記憶。
- **ADR-02 Node 24 zero-dependency**：只用 `node:` 內建模組，無 npm 執行期依賴，供應鏈攻擊面趨近於零（`npm run sbom` 可驗證）。
- **ADR-03 3-tool temporal decoupling**：EGM（寫碼前設計）→ 7sec（commit 前 diff 閘門）→ security-audit（發佈前深度稽核），三者只以檔案與提示訊息銜接，無程式碼耦合。
- **ADR-04 350-LOC hard ceiling**：`src/` ≤ 350 行且 ≤ 20,480 bytes 由 REQ-09 強制；新功能須以刪減換取預算。
