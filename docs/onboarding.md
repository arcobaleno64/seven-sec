# 用 7sec 起手或接手專案

> 角括號 `<…>` 是**佔位符，必須換成實際值，不可照字面執行**。指令預設在 WSL／Linux bash 執行；Windows cmd 的指令會明確標示。

前置（每台機器一次）：Node 24+、git、已登入的 `agy` 與 `codex`；在本 repo 執行 `npm link`；`7sec doctor` 全綠。
注意：每次審查都會把 diff 送給外部模型，私人程式碼請先確認可以。

## A. 起手新專案
1. `git init`，先 commit 一次當基線；`7sec init` 寫入 pre-commit hook（`7sec --staged`）。
2. 把本 repo `AGENTS.md` 的「呼叫 7sec 的 OODA 迴圈」整節複製到新專案的 `AGENTS.md`。**不要**照抄「350 行上限」，那是本專案自己的鐵律。
3. 規則寫成一份 spec（框架限制、安全規則），用 `7sec --spec <file>` 檢查偏離。spec 必須與現況一致：drift 一律算 BLOCK。
4. 先設計再寫碼（README 的 EGM 流程），寫完用 `--spec` 抓漂移；`--intent "<一句話>"` 檢查是否超出本次意圖。
5. 日常：改碼 → `7sec` → 依 exit code 行動（0 通過／1 只修列出的項目／2 回報環境問題），最多 3 輪。
6. 發佈前另做深度稽核（ADR-03）。改到 auth／token／`.env` 等路徑時 7sec 會印出提示。

## B. 接手既有專案
1. **不要一次審整個 repo**：上限 128 KB（含 spec），超過 exit 2、不截斷。看既有程式碼用 `git diff 4b825dc642cb6eb9a060e54bf8d69288fbee4904 HEAD -- <資料夾>` 分批（`4b825dc…` 是 git 固定的「空樹」雜湊，代表「什麼都沒有」）；之後的變更用 `7sec --base origin/main`。
2. **先建基線再裝 hook**：既有程式碼必有一堆 findings，先記下已知問題，BLOCK 才有意義。
3. **spec 先對照現況**：規則若沒人遵守，reviewer 的 drift 會是「字面正確、規則過期」的假 BLOCK。
4. **7sec 找不到既有機密**：它只看 diff，不掃歷史；另行掃描。
5. **非 git（TFVC）**：見 README「非 git 專案」與 `tools/`（編碼、排除設定檔、新增檔案）。

## 實務提醒
- reviewer 會誤報、每輪結果不同：懷疑誤報就先實測，確認後附證據回報，可行時寫成測試（見 `AGENTS.md`）。
- 遮蔽只認特定格式（`ghp_`、`sk-`、`AKIA…`、私鑰、`Password=…`），主機、帳號、cookie 不會被遮；機密請放在不進版本控制的地方。
- 每次 commit 約多 7–40 秒；`git commit --no-verify` 會繞過閘門。
- 目前只有本機 hook 與手動執行，沒有 CI 版本。
