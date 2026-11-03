#!/usr/bin/env node
import { parseArgs, styleText } from "node:util";
import { text } from "node:stream/consumers";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pkg from "../package.json" with { type: "json" };
import { deps, review, resolveNativeWindowsBinary, RANK } from "./goldfish.mjs";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // repo with no commits
const MAX_BYTES = 128 * 1024;
const TIER1 = ["**/{auth,security,crypto,jwt,login,token,permission,.github/workflows}/**", // matched lowercased
  "**/package.json", "**/dockerfile*", "**/.env*",
  "**/web.config", "**/app.config", "**/appsettings*.json", "**/global.asax*"];
const HOOK_CMD = "7sec --staged"; // needs a global `npm link`; no local devDependency
const OPTIONS = {
  staged: { type: "boolean", short: "s" }, base: { type: "string" }, spec: { type: "string" },
  intent: { type: "string" }, json: { type: "boolean" }, help: { type: "boolean", short: "h" },
  diff: { type: "string" },
};
const HELP = `7sec v${pkg.version} — stateless goldfish diff review
Usage: 7sec [review] [-s|--staged] [--base <ref>] [--diff <file|->] [--spec <file>] [--intent <text>] [--json]
       7sec doctor | 7sec init
Exit:  0 PASS · 1 BLOCK · 2 TOOL_ERROR`;

const c = (fmt, s) => styleText(fmt, s);
const git = async (args) => (await deps.execFile("git", args, { maxBuffer: 2 ** 26 })).stdout;

export function parseNumstat(raw) {
  const parts = raw.split("\0"), files = [];
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    const [added, deleted, ...rest] = parts[i].split("\t");
    const file = rest.join("\t") || (i += 2, parts[i]); // rename: "a\td\t\0old\0new"
    files.push({ file, lines: (Number(added) || 0) + (Number(deleted) || 0) });
  }
  return files;
}

/** Unified diff (git, or TFVC `tf diff /format:unified`: "+++ 本機: D:\x\Foo.cs") → [{ file, lines }]. */
export function parseUnifiedDiff(raw) {
  const out = [], ls = raw.replace(/^\uFEFF/, "").split(/\r?\n/); // Windows UTF-8 BOM
  const pathOf = (l) => l.match(/^[-+]{3}\s+(?:[ab]\/|[^:\r\n]+:\s*)?(.+?)(?:\t|;C\d+|$)/)?.[1];
  let cur = null, o = 0, n = 0; // o/n: old/new lines left in the current hunk (headers only count outside a hunk)
  for (let i = 0; i < ls.length; i++) {
    const h = o < 1 && n < 1 && ls[i].match(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/);
    if (o > 0 || n > 0) {
      const k = ls[i][0];
      if (k === "-") o--; else if (k === "+") n--; else if (k !== "\\") o--, n--;
      if (cur && (k === "-" || k === "+")) cur.lines++;
    } else if (h) [o, n] = [+(h[1] ?? 1), +(h[2] ?? 1)];
    else if (ls[i].startsWith("--- ") && ls[i + 1]?.startsWith("+++ ")) {
      const p = [pathOf(ls[i + 1]), pathOf(ls[i])].find((x) => x && x !== "/dev/null"); // deleted → old path
      cur = p ? { file: p.replaceAll("\\", "/").replace(/^(?:[A-Za-z]:|\$)?\/+/, ""), lines: 0 } : null;
      if (cur) out.push(cur);
      i++;
    } else if (cur && /^[-+]/.test(ls[i])) cur.lines++;
  }
  return out;
}

async function collectDiff({ staged, base, diff: diffArg }) {
  if (diffArg) { // external diff (e.g. TFVC): no git calls at all
    const raw = diffArg === "-" ? await text(process.stdin) : fs.readFileSync(diffArg, "utf8");
    return { root: process.cwd(), files: parseUnifiedDiff(raw), diff: raw };
  }
  if (base?.startsWith("-")) throw new Error(`--base must be a git ref, got "${base}"`); // git option injection
  const root = (await git(["rev-parse", "--show-toplevel"])).trim();
  const range = base ? [`${base}...HEAD`] : staged ? ["--cached"]
    : [await git(["rev-parse", "--verify", "-q", "HEAD"]).then(() => "HEAD", () => EMPTY_TREE)];
  const common = ["diff", ...range, "--no-color", "--no-ext-diff"];
  const [numstat, diff] = await Promise.all([git([...common, "--numstat", "-z"]), git([...common, "-U10"])]);
  return { root, files: parseNumstat(numstat), diff };
}

/** Pre-flight `node --check`; `ref` = revision to read (null: working tree). */
async function preflight(root, files, ref) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "7sec-"));
  const results = await Promise.all(files.filter((f) => /\.m?js$/.test(f.file)).map(async ({ file }, i) => {
    let p = path.join(root, file);
    if (ref !== null) {
      const src = await git(["show", `${ref}${file}`]).catch(() => "");
      if (!src) return "";
      fs.writeFileSync(p = path.join(tmp, `${i}-${path.basename(file)}`), src);
    } else if (!fs.existsSync(p)) return "";
    return deps.execFile(process.execPath, ["--check", p]).then(() => "", (e) => String(e.stderr || e.message).trim());
  }));
  fs.rmSync(tmp, { recursive: true });
  return results.filter(Boolean);
}

export const isTier1 = (file) => TIER1.some((g) => path.posix.matchesGlob(file.toLowerCase(), g));
const countLines = (files) => files.reduce((n, f) => n + f.lines, 0);
export const isDual = (files) => countLines(files) >= 50 || files.some((f) => isTier1(f.file));
const isSerious = (f) => RANK[f.severity] <= RANK.high || f.category === "drift";

function render({ findings, dual, ms, files, block }) {
  const mode = dual ? "🛡️ Dual Quorum (agy + codex)" : "⚡ Fast Path (agy)";
  const out = [`${c(["cyan", "bold"], mode)} · ${files.length} file(s), ${countLines(files)} lines · ${(ms / 1000).toFixed(1)}s`];
  const counts = [...Map.groupBy(findings, (f) => f.severity)].map(([sev, g]) => `${g.length} ${sev}`);
  if (counts.length) out.push(c("dim", counts.join(", ")));
  for (const f of findings) {
    out.push("", `${c([isSerious(f) ? "red" : "yellow", "bold"], `[${f.severity.toUpperCase()}]`)} ${f.file}:${f.line} — ${f.title} ${c("dim", `(${f.category})`)}`);
    if (f.counterexample) out.push(`   💥 反例 (Counter-example): ${f.counterexample}`);
    if (f.fix) out.push(`   🔧 建議修法 (Fix): ${f.fix}`);
  }
  out.push("", block ? c(["red", "bold"], "✖ BLOCK") : c(["green", "bold"], "✔ PASS"));
  if (files.some((f) => isTier1(f.file))) {
    out.push(c("yellow", "💡 High-risk security path modified. Consider running '/security-audit:security-audit --scope changes' before release."));
  }
  return out.join("\n");
}

async function doctor() {
  const probe = (label, file, args) => deps.execFile(file, args, { timeout: 3000 }).then(
    (r) => [label, true, String(r.stdout).trim().split("\n")[0]],
    (e) => [label, false, e.code === "ENOENT" ? "not found on PATH" : String(e.message).split("\n")[0]]);
  const major = Number(process.versions.node.split(".")[0]);
  const checks = [["node", major >= 24, `v${process.versions.node} (>=24)`], ...await Promise.all([
    probe("git", "git", ["--version"]), probe("git repo", "git", ["rev-parse", "--is-inside-work-tree"]),
    probe("agy", "agy", ["--version"]), probe("codex", resolveNativeWindowsBinary("codex"), ["--version"])])];
  for (const [label, ok, info] of checks) console.log(`${ok ? c("green", "✔") : c("red", "✖")} ${label.padEnd(9)} ${info}`);
  return checks.every(([, ok]) => ok) ? 0 : 2;
}

export function init(dir = process.cwd()) {
  const gitDir = path.join(dir, ".git");
  if (!fs.statSync(gitDir, { throwIfNoEntry: false })?.isDirectory()) return console.error("✖ No .git directory here"), 2;
  const hook = path.join(gitDir, "hooks", "pre-commit");
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  const old = fs.existsSync(hook) ? fs.readFileSync(hook, "utf8") : "";
  const at = old.startsWith("#!") ? old.indexOf("\n") + 1 : 0; // run 7sec FIRST so an existing `exit 0` cannot skip it
  if (!old.includes(HOOK_CMD)) fs.writeFileSync(hook, `${at ? old.slice(0, at) : "#!/bin/sh\n"}${HOOK_CMD}${old ? " || exit 1" : ""}\n${old.slice(at)}`);
  fs.chmodSync(hook, 0o755);
  console.log(c("green", `✔ pre-commit hook: ${hook}`));
  return 0;
}

export async function run(argv = process.argv.slice(2), { signal, timeoutMs } = {}) {
  let parsed;
  try { parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true }); } catch (e) {
    return console.error(`${e.message}\n${HELP}`), 2;
  }
  const { values: v, positionals: [cmd = "review", ...extra] } = parsed;
  if (v.help) return console.log(HELP), 0;
  if (cmd === "doctor") return doctor();
  if (cmd === "init") return init();
  if (cmd !== "review" || extra.length) return console.error(`Unknown command: ${[cmd, ...extra].join(" ")}\n${HELP}`), 2;
  try {
    const t0 = performance.now();
    const { root, files, diff } = await collectDiff(v);
    if (!diff.trim()) {
      console.log(v.json ? JSON.stringify({ verdict: "PASS", findings: [] }) : c("green", "✔ Clean working tree (0 lines changed)"));
      return 0;
    }
    const syntax = v.diff ? [] : await preflight(root, files, v.base ? "HEAD:" : v.staged ? ":" : null); // external diff: no local copy to check
    if (syntax.length) return console.error(c(["red", "bold"], "✖ BLOCK: syntax error (node --check)"), `\n${syntax.join("\n\n")}`), 1;
    const spec = v.spec ? fs.readFileSync(v.spec, "utf8") : "";
    const n = Buffer.byteLength(diff) + Buffer.byteLength(spec);
    if (n > MAX_BYTES) return console.error(c("yellow", `✖ Diff + spec ${Math.ceil(n / 1024)} KB > 128 KB; split the change (never truncated).`)), 2;
    const dual = isDual(files);
    const findings = await review({ diff, spec, intent: v.intent ?? "", dual, signal, timeoutMs });
    const block = findings.some(isSerious), ms = performance.now() - t0;
    console.log(v.json ? JSON.stringify({ verdict: block ? "BLOCK" : "PASS", mode: dual ? "dual" : "fast", ms: Math.round(ms), findings })
      : render({ findings, dual, ms, files, block }));
    return block ? 1 : 0;
  } catch (e) {
    console.error(c(["red", "bold"], `✖ TOOL_ERROR: ${e.message}`));
    return 2;
  }
}

if (import.meta.main) {
  const ac = new AbortController();
  process.once("SIGINT", () => ac.abort());
  process.exitCode = await run(undefined, { signal: ac.signal });
}
