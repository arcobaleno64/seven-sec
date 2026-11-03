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
7sec --json           # 機器可讀輸出
```

路由：一般小改動 → `⚡ Fast Path (agy)`；≥ 50 行或觸碰 auth/security/crypto/jwt/login/token/permission/.github/workflows、package.json、Dockerfile*、.env*、Web.config、app.config、appsettings*.json、Global.asax* → `🛡️ Dual Quorum (agy + codex)`，任一失敗即 fail-closed。

Exit：`0` PASS · `1` BLOCK（語法錯誤 / critical / high / drift / 明文機密）· `2` TOOL_ERROR。

## 非 git 專案：TFVC（`--diff <file|->`）
`--diff` 直接讀入 unified diff（檔案或 `-` 代表 stdin），完全不呼叫 git；支援 TFVC 繁中標頭（`--- 伺服器: $/…;C120` / `+++ 本機: D:\…`）。
```bash
# 1. Windows（TFVC 工作區根目錄）：輸出 unified diff，存成 UTF-8（無 BOM）
tf diff . /recursive /format:unified > proj1.diff
# 2. WSL：搭配 PROJ1 審查規範
7sec --diff /mnt/d/repos/PROJ1/proj1.diff --spec /root/projects/seven-sec/docs/example-spec.md
cat proj1.diff | 7sec --diff -      # 或由管線餵入
```

## 與 Google EGM 搭配（寫碼前設計 → 寫碼後抓漂移）
```bash
# 1. 用 EGM 產出設計稿 docs/designs/auth-flow.md
# 2. 實作後檢查是否偏離設計
7sec --spec docs/designs/auth-flow.md
7sec --intent "只加重試日誌，不改變回傳型別"
```

## 測試
```bash
npm test
```
