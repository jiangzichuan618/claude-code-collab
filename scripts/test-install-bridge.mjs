import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const installer = path.join(scriptDir, "install-bridge.mjs");
const remover = path.join(scriptDir, "remove-bridge.ps1");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-bridge-test-"));
const root = path.join(tmp, "workspace");
const configPath = path.join(tmp, "config.toml");
fs.mkdirSync(root, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      CLAUDE_CODE_BRIDGE_CONFIG_PATH: configPath,
      CODEX_HOME: tmp,
    },
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeConfig(text) {
  fs.writeFileSync(configPath, text.trimStart(), "utf8");
}

function readConfig() {
  return fs.readFileSync(configPath, "utf8");
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where.exe" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(probe, args, { encoding: "utf8", shell: process.platform !== "win32" });
  return result.status === 0;
}

const validConfig = `
model_provider = "aioc"
model = "gpt-5.5"

[model_providers.aioc]
name = "aioc"
base_url = "https://aioc.cc/v1"
wire_api = "responses"
requires_openai_auth = true

[windows]
sandbox = "elevated"

[projects.'c:\\users\\leluan\\documents\\免疫荧光']
trust_level = "trusted"

[mcp_servers.node_repl]
args = []
command = 'C:\\Users\\leluan\\AppData\\Local\\OpenAI\\Codex\\bin\\node_repl.exe'

[mcp_servers.node_repl.env]
NODE_REPL_NODE_PATH = 'C:\\Users\\leluan\\AppData\\Local\\OpenAI\\Codex\\bin\\node.exe'
`;

try {
  const missingStatus = run(process.execPath, [installer, "--status"]);
  assert(missingStatus.status === 0, `missing-config status failed: ${missingStatus.stderr || missingStatus.stdout}`);
  assert(missingStatus.stdout.includes("Codex config not found"), "missing-config status did not explain config absence");

  writeConfig(validConfig);
  const cleanStatus = run(process.execPath, [installer, "--status"]);
  assert(cleanStatus.status === 0, `clean status failed: ${cleanStatus.stderr || cleanStatus.stdout}`);
  assert(cleanStatus.stdout.includes("is not registered"), "clean status did not report unregistered bridge");

  const before = readConfig();
  const dryRun = run(process.execPath, [installer, "--root", root]);
  assert(dryRun.status === 0, `dry-run failed: ${dryRun.stderr || dryRun.stdout}`);
  assert(readConfig() === before, "dry-run modified config");
  assert(dryRun.stdout.includes("Dry run: no files were modified."), "dry-run output missing marker");

  const apply = run(process.execPath, [installer, "--root", root, "--apply"]);
  assert(apply.status === 0, `apply failed: ${apply.stderr || apply.stdout}`);
  assert(readConfig().includes("[mcp_servers.claude_code_bridge]"), "apply did not add bridge section");
  assert(readConfig().includes("[mcp_servers.node_repl]"), "apply removed unrelated MCP section");

  const registeredStatus = run(process.execPath, [installer, "--status"]);
  assert(registeredStatus.status === 0, `registered status failed: ${registeredStatus.stderr || registeredStatus.stdout}`);
  assert(registeredStatus.stdout.includes("is registered"), "registered status did not report bridge");

  const secondApply = run(process.execPath, [installer, "--root", root, "--apply"]);
  assert(secondApply.status === 0, `second apply failed: ${secondApply.stderr || secondApply.stdout}`);
  const bridgeHeaders = readConfig().match(/^\s*\[mcp_servers\.claude_code_bridge\]\s*$/gm) || [];
  assert(bridgeHeaders.length === 1, "second apply left duplicate bridge sections");

  const uninstall = run(process.execPath, [installer, "--uninstall"]);
  assert(uninstall.status === 0, `uninstall failed: ${uninstall.stderr || uninstall.stdout}`);
  assert(!readConfig().includes("[mcp_servers.claude_code_bridge]"), "uninstall left bridge section");
  assert(readConfig().includes("[mcp_servers.node_repl]"), "uninstall removed unrelated MCP section");

  if (commandExists("powershell")) {
    writeConfig(`${validConfig}\n[mcp_servers.claude_code_bridge]\ncommand = 'node'\nargs = ['server.mjs']\n\n[mcp_servers.claude_code_bridge.env]\nCLAUDE_CODE_ALLOWED_ROOTS = '${root.replace(/\\/g, "\\\\")}'\n`);
    const ps = run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", remover, "-ConfigPath", configPath]);
    assert(ps.status === 0, `PowerShell remove failed: ${ps.stderr || ps.stdout}`);
    assert(!readConfig().includes("[mcp_servers.claude_code_bridge]"), "PowerShell remove left bridge section");
    assert(readConfig().includes("[mcp_servers.node_repl]"), "PowerShell remove removed unrelated MCP section");
  }

  writeConfig(`
model = "x"
[projects.'c:\\broken]
trust_level = "trusted"
`);
  const broken = run(process.execPath, [installer, "--root", root, "--apply"]);
  assert(broken.status !== 0, "apply succeeded on malformed TOML");
  assert(readConfig().includes("[projects.'c:\\broken]"), "malformed config was modified");

  console.log("install-bridge regression tests passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
