import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const home = os.homedir();
const codexHome = process.env.CODEX_HOME || path.join(home, ".codex");
const configPath = path.join(codexHome, "config.toml");
const skillRoot = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const serverPath = path.join(skillRoot, "scripts", "server.mjs");

function parseArgs(argv) {
  const args = { root: null, uninstall: false, status: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      args.root = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--root=")) {
      args.root = arg.slice("--root=".length);
    } else if (arg === "--uninstall" || arg === "--remove") {
      args.uninstall = true;
    } else if (arg === "--status" || arg === "--check") {
      args.status = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/install-bridge.mjs [--root <workspace-root>] [--status] [--uninstall]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.uninstall && args.status) {
    throw new Error("--uninstall and --status cannot be used together");
  }
  return args;
}

function findNodePath(config) {
  const match = config.match(/NODE_REPL_NODE_PATH\s*=\s*'([^']+)'/);
  if (match) return match[1];
  return process.execPath || "node";
}

function safeRealpath(value) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value);
  } catch {
    return null;
  }
}

function normalizeForCompare(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function validateAllowedRoot(value) {
  if (!value || !String(value).trim()) throw new Error("Workspace root is required");
  const resolved = path.resolve(String(value));
  const real = safeRealpath(resolved);
  if (!real) throw new Error(`Workspace root does not exist: ${resolved}`);
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) throw new Error(`Workspace root is not a directory: ${real}`);
  const parsed = path.parse(real);
  if (real === parsed.root) throw new Error(`Workspace root cannot be a filesystem root: ${real}`);
  if (isBroadUserParent(real)) throw new Error(`Workspace root cannot be a broad user parent directory: ${real}`);

  const home = safeRealpath(os.homedir()) || path.resolve(os.homedir());
  if (normalizeForCompare(real) === normalizeForCompare(home)) {
    throw new Error(`Workspace root cannot be the user home directory: ${real}`);
  }

  const sensitiveNames = [".ssh", ".gnupg", ".aws", ".azure", ".claude", ".codex"];
  const parts = real.split(path.sep).map((part) => (process.platform === "win32" ? part.toLowerCase() : part));
  const sensitive = process.platform === "win32" ? sensitiveNames.map((name) => name.toLowerCase()) : sensitiveNames;
  if (parts.some((part) => sensitive.includes(part))) {
    throw new Error(`Workspace root cannot be inside a sensitive directory: ${real}`);
  }
  return real;
}

function isBroadUserParent(real) {
  const normalized = normalizeForCompare(real);
  if (process.platform === "win32") {
    return /^[a-z]:\\users$/i.test(normalized);
  }
  return normalized === "/users" || normalized === "/home";
}

function tomlString(value) {
  if (!value.includes("'")) return `'${value}'`;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function block(nodePath, allowedRoot) {
  return [
    "[mcp_servers.claude_code_bridge]",
    `command = ${tomlString(nodePath)}`,
    `args = [${tomlString(serverPath)}]`,
    "startup_timeout_sec = 120",
    "",
    "[mcp_servers.claude_code_bridge.env]",
    `CLAUDE_CODE_ALLOWED_ROOTS = ${tomlString(allowedRoot)}`,
    "",
  ].join("\n");
}

function removeBridgeSections(config) {
  const lines = config.split(/\r?\n/);
  const output = [];
  let skipping = false;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      const section = header[1];
      skipping = section === "mcp_servers.claude_code_bridge" || section === "mcp_servers.claude_code_bridge.env";
    }
    if (!skipping) output.push(line);
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function insertBridgeSection(config, bridgeBlock) {
  const rootRe = /^\[mcp_servers\]\s*$/m;
  if (rootRe.test(config)) {
    return config.replace(rootRe, `[mcp_servers]\n\n${bridgeBlock.trimEnd()}`);
  }
  return `${config.trimEnd()}\n\n[mcp_servers]\n\n${bridgeBlock.trimEnd()}`;
}

function hasBridgeSection(config) {
  return /^\s*\[mcp_servers\.claude_code_bridge\]\s*$/m.test(config);
}

if (!fs.existsSync(configPath)) {
  throw new Error(`Codex config not found: ${configPath}`);
}
if (!fs.existsSync(serverPath)) {
  throw new Error(`Bridge server not found: ${serverPath}`);
}

const args = parseArgs(process.argv.slice(2));
const original = fs.readFileSync(configPath, "utf8");

if (args.status) {
  if (hasBridgeSection(original)) {
    console.log(`claude_code_bridge is registered in ${configPath}`);
  } else {
    console.log(`claude_code_bridge is not registered in ${configPath}`);
  }
  process.exit(0);
}

const backup = `${configPath}.backup.${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17)}`;
fs.writeFileSync(backup, original, "utf8");

if (args.uninstall) {
  const updated = removeBridgeSections(original);
  fs.writeFileSync(configPath, updated, "utf8");
  console.log(`Removed claude_code_bridge from ${configPath}`);
  console.log(`Backup: ${backup}`);
  console.log("Restart Codex to apply the change.");
  process.exit(0);
}

const nodePath = findNodePath(original);
const requestedRoot = args.root || process.cwd();
const allowedRoot = validateAllowedRoot(requestedRoot);
const nextBlock = block(nodePath, allowedRoot);
const updated = insertBridgeSection(removeBridgeSections(original), nextBlock);

fs.writeFileSync(configPath, updated, "utf8");
console.log(`Updated ${configPath}`);
console.log(`Backup: ${backup}`);
console.log(`Allowed root: ${allowedRoot}`);
console.log("Restart Codex to load claude_code_bridge.");
