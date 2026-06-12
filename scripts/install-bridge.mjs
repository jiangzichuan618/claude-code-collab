import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const home = os.homedir();
const codexHome = process.env.CODEX_HOME || path.join(home, ".codex");
const configPath = process.env.CLAUDE_CODE_BRIDGE_CONFIG_PATH || path.join(codexHome, "config.toml");
const skillRoot = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const serverPath = path.join(skillRoot, "scripts", "server.mjs");

function parseArgs(argv) {
  const args = { root: null, apply: false, uninstall: false, status: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      args.root = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--root=")) {
      args.root = arg.slice("--root=".length);
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--uninstall" || arg === "--remove") {
      args.uninstall = true;
    } else if (arg === "--status" || arg === "--check") {
      args.status = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/install-bridge.mjs [--root <workspace-root>] [--apply] [--status] [--uninstall]");
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
  const match = (config || "").match(/NODE_REPL_NODE_PATH\s*=\s*'([^']+)'/);
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
  return `${config.trimEnd()}\n\n${bridgeBlock.trimEnd()}`;
}

function hasBridgeSection(config) {
  return /^\s*\[mcp_servers\.claude_code_bridge\]\s*$/m.test(config);
}

function stripTomlComment(line) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#") return line.slice(0, i);
  }
  return line;
}

function findUnquotedEquals(line) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "=") return i;
  }
  return -1;
}

function splitDottedKey(key) {
  const parts = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (let i = 0; i < key.length; i += 1) {
    const ch = key[i];
    if (quote === '"') {
      current += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }
    if (quote === "'") {
      current += ch;
      if (ch === "'") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ".") {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (quote) return null;
  parts.push(current.trim());
  return parts;
}

function isValidKeyPart(part) {
  if (!part) return false;
  if (/^[A-Za-z0-9_-]+$/.test(part)) return true;
  if (part.startsWith("'") && part.endsWith("'") && part.length >= 2) {
    return !part.slice(1, -1).includes("'");
  }
  if (part.startsWith('"') && part.endsWith('"') && part.length >= 2) {
    let escaped = false;
    for (let i = 1; i < part.length - 1; i += 1) {
      const ch = part[i];
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        return false;
      }
    }
    return !escaped;
  }
  return false;
}

function validateDottedKey(key, lineNo, errors) {
  const parts = splitDottedKey(key);
  if (!parts) {
    errors.push(`line ${lineNo}: unterminated quote in key or table name`);
    return;
  }
  if (!parts.every(isValidKeyPart)) {
    errors.push(`line ${lineNo}: invalid key or table name: ${key}`);
  }
}

function validateValue(value, lineNo, errors) {
  if (value.startsWith('"""') || value.startsWith("'''")) {
    const marker = value.slice(0, 3);
    if (!value.endsWith(marker) || value.length === 3) {
      errors.push(`line ${lineNo}: multiline TOML values are not supported by this safety check`);
    }
    return;
  }

  let quote = null;
  let escaped = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
  }
  if (quote) errors.push(`line ${lineNo}: unterminated quoted value`);
}

function validateConfigSafety(config, label) {
  const errors = [];
  const lines = config.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = stripTomlComment(lines[i]).trim();
    if (!line) continue;

    const eq = findUnquotedEquals(line);
    if (line.startsWith("[") && eq === -1) {
      const match = line.match(/^\[([^\[\]]+)\]$/);
      if (!match) {
        errors.push(`line ${lineNo}: malformed table header`);
        continue;
      }
      validateDottedKey(match[1].trim(), lineNo, errors);
      continue;
    }

    if (eq === -1) {
      errors.push(`line ${lineNo}: expected key = value`);
      continue;
    }
    validateDottedKey(line.slice(0, eq).trim(), lineNo, errors);
    validateValue(line.slice(eq + 1).trim(), lineNo, errors);
  }

  if (errors.length) {
    const shown = errors.slice(0, 8).join("\n");
    const more = errors.length > 8 ? `\n...and ${errors.length - 8} more` : "";
    throw new Error(`${label} failed TOML safety check. No changes were written.\n${shown}${more}`);
  }
}

function backupPathForConfig() {
  return `${configPath}.backup.${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17)}`;
}

function writeConfigWithBackup(original, updated, actionLabel) {
  validateConfigSafety(original, "Existing Codex config");
  validateConfigSafety(updated, "Updated Codex config");

  const backup = backupPathForConfig();
  const temp = `${configPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(backup, original, "utf8");
  try {
    fs.writeFileSync(temp, updated, "utf8");
    validateConfigSafety(fs.readFileSync(temp, "utf8"), "Temporary Codex config");
    fs.copyFileSync(temp, configPath);
  } finally {
    try {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    } catch {
      // Best effort cleanup only.
    }
  }
  console.log(`${actionLabel} ${configPath}`);
  console.log(`Backup: ${backup}`);
}

if (!fs.existsSync(serverPath)) {
  throw new Error(`Bridge server not found: ${serverPath}`);
}

const args = parseArgs(process.argv.slice(2));
const original = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";

if (args.status) {
  if (!original) {
    console.log(`Codex config not found: ${configPath}`);
  } else if (hasBridgeSection(original)) {
    console.log(`claude_code_bridge is registered in ${configPath}`);
  } else {
    console.log(`claude_code_bridge is not registered in ${configPath}`);
  }
  process.exit(0);
}

if (args.uninstall) {
  if (!original) throw new Error(`Codex config not found: ${configPath}`);
  const updated = removeBridgeSections(original);
  writeConfigWithBackup(original, updated, "Removed claude_code_bridge from");
  console.log("Restart Codex to apply the change.");
  process.exit(0);
}

const nodePath = findNodePath(original);
const requestedRoot = args.root || process.cwd();
const allowedRoot = validateAllowedRoot(requestedRoot);
const nextBlock = block(nodePath, allowedRoot);

if (!args.apply) {
  console.log("Dry run: no files were modified.");
  console.log(`Allowed root: ${allowedRoot}`);
  console.log("");
  console.log(`To register the bridge manually, add this block to ${configPath}:`);
  console.log("");
  console.log(nextBlock.trimEnd());
  console.log("");
  console.log("To let this script update the Codex config, rerun the command with --apply.");
  process.exit(0);
}

if (!original) throw new Error(`Codex config not found: ${configPath}`);
const updated = insertBridgeSection(removeBridgeSections(original), nextBlock);
writeConfigWithBackup(original, updated, "Updated");
console.log(`Allowed root: ${allowedRoot}`);
console.log("Restart Codex to load claude_code_bridge.");
