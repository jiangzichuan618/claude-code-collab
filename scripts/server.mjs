import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";

const serverName = "claude-code-collab";
const genericToolName = "ask_claude_code";
const toolAliases = {
  claude_code_ask: "ask_claude_code",
  claude_code_review: "review_with_claude_code",
  claude_code_edit: "edit_with_claude_code",
  claude_code_compare: "compare_with_claude_code",
};

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function discoverClaudeExe() {
  const envPath = process.env.CLAUDE_CODE_PATH;
  if (envPath && fs.existsSync(envPath)) return assertExecutablePath(envPath);

  const pathHit = findOnPath(process.platform === "win32" ? ["claude.exe"] : ["claude"]);
  if (pathHit) return pathHit;

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const packageRoot = path.join(
    localAppData,
    "Packages",
    "Claude_pzs8sxrjxfjjc",
    "LocalCache",
    "Roaming",
    "Claude"
  );
  const candidates = [...findClaudePackageExecutables(packageRoot)];
  if (process.platform !== "win32") candidates.push("claude");
  for (const candidate of candidates) {
    if (candidate === "claude" || fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Claude Code executable not found. Install Claude Code, add claude.exe to PATH, or set CLAUDE_CODE_PATH.");
}

function assertExecutablePath(value) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(value)) {
    throw new Error("CLAUDE_CODE_PATH must point to claude.exe, not a .cmd or .bat wrapper.");
  }
  return value;
}

function findOnPath(names) {
  const entries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const entry of entries) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findClaudePackageExecutables(packageRoot) {
  const roots = ["claude-code", "claude-code-vm"].map((name) => path.join(packageRoot, name));
  const exeName = process.platform === "win32" ? "claude.exe" : "claude";
  const hits = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const versions = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareVersions)
      .reverse();
    for (const version of versions) hits.push(path.join(root, version, exeName));
  }
  return hits;
}

function compareVersions(a, b) {
  const pa = a.split(".").map((part) => Number(part) || 0);
  const pb = b.split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return a.localeCompare(b);
}

function mergeClaudeEnv() {
  const env = { ...process.env };
  const settings = readJsonFile(path.join(os.homedir(), ".claude", "settings.json"));
  const fileEnv = settings?.env && typeof settings.env === "object" ? settings.env : {};
  for (const [key, value] of Object.entries(fileEnv)) {
    if (typeof value === "string" && value && !env[key]) env[key] = value;
  }
  return env;
}

function textContent(text) {
  return [{ type: "text", text }];
}

function normalizeArgs(input = {}) {
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) throw new Error("prompt is required");

  const rawCwd = typeof input.cwd === "string" && input.cwd.trim() ? input.cwd.trim() : process.cwd();
  const cwd = validateAllowedPath(rawCwd, "cwd");
  const permissionMode = ["plan", "default", "acceptEdits"].includes(input.permission_mode)
    ? input.permission_mode
    : "plan";
  const model = typeof input.model === "string" && input.model.trim() ? input.model.trim() : "";
  const outputFormat = ["json", "text"].includes(input.output_format) ? input.output_format : "json";
  const continueSession = input.continue_session === true;
  const timeoutMs =
    Number.isFinite(input.timeout_ms) && input.timeout_ms > 0 ? Math.min(Number(input.timeout_ms), 1800000) : 600000;
  const addDir = Array.isArray(input.add_dir)
    ? input.add_dir.filter((x) => typeof x === "string" && x.trim()).map((dir) => validateAllowedPath(dir, "add_dir"))
    : [];
  return { prompt, cwd, permissionMode, model, outputFormat, continueSession, timeoutMs, addDir };
}

function validateAllowedPath(value, label) {
  const resolved = realDirectory(value, label);
  validateWorkspaceRootShape(resolved, label);
  if (!isInsideAllowedRoot(resolved)) {
    throw new Error(`${label} is outside allowed workspace roots: ${redactHome(resolved)}`);
  }
  return resolved;
}

function validateWorkspaceRootShape(resolved, label) {
  const home = safeRealpath(os.homedir()) || path.resolve(os.homedir());
  if (normalizeForCompare(resolved) === normalizeForCompare(home)) {
    throw new Error(`${label} cannot be the user home directory`);
  }
  const parsed = path.parse(resolved);
  if (normalizeForCompare(resolved) === normalizeForCompare(parsed.root)) {
    throw new Error(`${label} cannot be a filesystem root`);
  }
  if (isBroadUserParent(resolved)) {
    throw new Error(`${label} cannot be a broad user parent directory: ${redactHome(resolved)}`);
  }
  const sensitiveNames = [".ssh", ".gnupg", ".aws", ".azure", ".claude", ".codex"];
  const parts = resolved.split(path.sep).map((part) => (process.platform === "win32" ? part.toLowerCase() : part));
  const sensitive = process.platform === "win32" ? sensitiveNames.map((name) => name.toLowerCase()) : sensitiveNames;
  if (parts.some((part) => sensitive.includes(part))) {
    throw new Error(`${label} points to a sensitive directory: ${redactHome(resolved)}`);
  }
}

function isBroadUserParent(resolved) {
  const normalized = normalizeForCompare(resolved);
  if (process.platform === "win32") {
    return /^[a-z]:\\users$/i.test(normalized);
  }
  return normalized === "/users" || normalized === "/home";
}

function realDirectory(value, label) {
  const resolved = path.resolve(value);
  const real = safeRealpath(resolved);
  if (!real) throw new Error(`${label} does not exist: ${redactHome(resolved)}`);
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory: ${redactHome(real)}`);
  const parsed = path.parse(real);
  if (real === parsed.root) throw new Error(`${label} cannot be a filesystem root`);
  return real;
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

function allowedRoots() {
  const roots = [];
  const envRoots = process.env.CLAUDE_CODE_ALLOWED_ROOTS || process.env.CODEX_WORKSPACE_ROOTS || "";
  for (const part of envRoots.split(path.delimiter)) {
    if (!part.trim()) continue;
    const real = safeRealpath(part.trim());
    if (real) {
      validateWorkspaceRootShape(real, "allowed root");
      roots.push(real);
    }
  }
  return Array.from(new Set(roots.map((root) => path.resolve(root))));
}

function isInsideAllowedRoot(value) {
  const roots = allowedRoots();
  if (roots.length === 0) {
    throw new Error("No allowed workspace roots configured. Set CLAUDE_CODE_ALLOWED_ROOTS for claude_code_bridge.");
  }
  return roots.some((root) => isSameOrChildPath(value, root));
}

function isSameOrChildPath(child, root) {
  const normalizedChild = normalizeForCompare(child);
  const normalizedRoot = normalizeForCompare(root);
  if (normalizedChild === normalizedRoot) return true;
  const relative = path.relative(normalizedRoot, normalizedChild);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function redactHome(value) {
  const home = path.resolve(os.homedir());
  const resolved = path.resolve(value);
  return resolved.startsWith(home) ? resolved.replace(home, "~") : resolved;
}

function runClaude(input) {
  const { prompt, cwd, permissionMode, model, outputFormat, continueSession, timeoutMs, addDir } = normalizeArgs(input);
  const claudeExe = discoverClaudeExe();
  const args = ["-p", "--input-format", "text", "--output-format", outputFormat, "--permission-mode", permissionMode];
  if (continueSession) args.unshift("--continue");
  if (!continueSession) args.push("--no-session-persistence");
  if (model) args.push("--model", model);
  for (const dir of addDir) args.push("--add-dir", dir);

  return new Promise((resolve, reject) => {
    const { command, args: spawnArgs, displayCommand } = spawnSpec(claudeExe, args);
    const child = spawn(command, spawnArgs, {
      cwd,
      env: mergeClaudeEnv(),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.stdin.end(prompt);
    let killTimer = null;
    const timer = setTimeout(() => {
      timedOut = true;
      stderr += `\nTimed out after ${timeoutMs}ms`;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 5000);
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        code: timedOut && code === null ? 124 : code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        outputFormat,
        command: displayCommand,
      });
    });
  });
}

function spawnSpec(claudeExe, args) {
  const displayCommand = `${redactPathForDisplay(claudeExe)} ${redactArgsForDisplay(args).join(" ")} < <prompt stdin>`;
  return { command: claudeExe, args, displayCommand };
}

function redactArgsForDisplay(args) {
  const pathValueFlags = new Set(["--add-dir", "--mcp-config", "--settings", "--plugin-dir", "--debug-file"]);
  const redacted = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    redacted.push(arg);
    if (pathValueFlags.has(arg) && i + 1 < args.length) {
      redacted.push(redactPathForDisplay(args[i + 1]));
      i += 1;
    }
  }
  return redacted;
}

function redactPathForDisplay(value) {
  if (!looksLikePath(value)) return value;
  return redactHome(value);
}

function looksLikePath(value) {
  if (typeof value !== "string") return false;
  return (
    path.isAbsolute(value) ||
    value.startsWith("~") ||
    value.startsWith(`.${path.sep}`) ||
    value.startsWith(`..${path.sep}`) ||
    /^[A-Za-z]:[\\/]/.test(value)
  );
}

function block(label, value) {
  if (!value) return "";
  return `${label}:\n${value}\n`;
}

function listBlock(label, values) {
  if (!Array.isArray(values) || values.length === 0) return "";
  return `${label}:\n${values.map((value) => `- ${value}`).join("\n")}\n`;
}

function specializedPrompt(toolName, args = {}) {
  toolName = canonicalToolName(toolName);
  const task = typeof args.task === "string" && args.task.trim() ? args.task.trim() : args.prompt?.trim();
  if (!task) throw new Error("task or prompt is required");
  const cwd = typeof args.cwd === "string" && args.cwd.trim() ? args.cwd.trim() : process.cwd();
  const context = typeof args.context_summary === "string" ? args.context_summary.trim() : "";
  const codexView = typeof args.codex_view === "string" ? args.codex_view.trim() : "";
  const codexPlan = typeof args.codex_plan === "string" ? args.codex_plan.trim() : "";
  const relevantFiles = Array.isArray(args.relevant_files) ? args.relevant_files : [];

  if (toolName === "review_with_claude_code") {
    return [
      "You are Claude Code acting as an independent second-opinion reviewer for Codex.",
      "Mode: review only. Do not edit files.",
      block("Task", task),
      block("Workspace", cwd),
      block("Codex context summary", context),
      listBlock("Relevant files", relevantFiles),
      "Return this structure:",
      "1. Findings",
      "2. Risks or missing assumptions",
      "3. Disagreements with Codex, if any",
      "4. Concrete next steps",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (toolName === "edit_with_claude_code") {
    return [
      "You are Claude Code acting as a coding agent coordinated by Codex.",
      "Mode: edits allowed. Make the smallest correct change.",
      block("Task", task),
      block("Workspace", cwd),
      block("Codex context summary", context),
      listBlock("Relevant files", relevantFiles),
      "After editing, return:",
      "1. Files changed",
      "2. What changed",
      "3. Validation performed",
      "4. Remaining risks",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (toolName === "compare_with_claude_code") {
    return [
      "You are Claude Code reviewing Codex's reasoning. Be direct and evidence-focused.",
      "Mode: review only. Do not edit files.",
      block("Task", task),
      block("Workspace", cwd),
      block("Codex context summary", context),
      block("Codex view", codexView),
      block("Codex plan", codexPlan),
      listBlock("Relevant files", relevantFiles),
      "Return this structure:",
      "1. Where Claude agrees",
      "2. Where Claude disagrees",
      "3. Conflict resolution recommendation",
      "4. Final action checklist",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return task;
}

function canonicalToolName(toolName) {
  return toolAliases[toolName] || toolName;
}

function toolDefinitions() {
  const commonProperties = {
    cwd: { type: "string" },
    model: { type: "string" },
    output_format: { type: "string", enum: ["json", "text"] },
    continue_session: { type: "boolean" },
    timeout_ms: { type: "number" },
    add_dir: { type: "array", items: { type: "string" } },
  };
  const specializedProperties = {
    task: { type: "string" },
    prompt: { type: "string" },
    context_summary: { type: "string" },
    relevant_files: { type: "array", items: { type: "string" } },
    cwd: commonProperties.cwd,
    model: commonProperties.model,
    output_format: commonProperties.output_format,
    continue_session: commonProperties.continue_session,
    timeout_ms: commonProperties.timeout_ms,
    add_dir: commonProperties.add_dir,
  };
  const canonicalTools = [
    {
      name: genericToolName,
      description:
        "Run Claude Code from Codex with a caller-provided prompt. Use for custom Claude Code tasks.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: { type: "string" },
          permission_mode: {
            type: "string",
            enum: ["plan", "default"],
          },
          ...commonProperties,
        },
        required: ["prompt"],
      },
    },
    {
      name: "review_with_claude_code",
      description:
        "Ask Claude Code for a second-opinion review without editing files. Use for plans, designs, diffs, bug analysis, and risk checks.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: specializedProperties,
        required: ["task"],
      },
    },
    {
      name: "edit_with_claude_code",
      description:
        "Ask Claude Code to make code edits. Use only when the user explicitly allows Claude Code to write or fix files.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: specializedProperties,
        required: ["task"],
      },
    },
    {
      name: "compare_with_claude_code",
      description:
        "Ask Claude Code to compare against Codex's view or plan and return agreement, disagreement, conflict resolution, and final actions.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ...specializedProperties,
          codex_view: { type: "string" },
          codex_plan: { type: "string" },
        },
        required: ["task"],
      },
    },
  ];
  const aliasTools = [
    {
      ...canonicalTools[0],
      name: "claude_code_ask",
      description:
        "Alias for ask_claude_code. Run Claude Code from Codex with a caller-provided prompt.",
    },
    {
      ...canonicalTools[1],
      name: "claude_code_review",
      description:
        "Alias for review_with_claude_code. Ask Claude Code for a second-opinion review without editing files.",
    },
    {
      ...canonicalTools[2],
      name: "claude_code_edit",
      description:
        "Alias for edit_with_claude_code. Ask Claude Code to make code edits only after explicit user permission.",
    },
    {
      ...canonicalTools[3],
      name: "claude_code_compare",
      description:
        "Alias for compare_with_claude_code. Ask Claude Code to compare against Codex's view or plan.",
    },
  ];
  return [...canonicalTools, ...aliasTools];
}

function argumentsForTool(toolName, args = {}) {
  toolName = canonicalToolName(toolName);
  if (toolName === genericToolName) {
    if (args.permission_mode === "acceptEdits") {
      throw new Error("acceptEdits is only available through edit_with_claude_code after explicit user permission.");
    }
    return args;
  }
  const permissionMode = toolName === "edit_with_claude_code" ? "acceptEdits" : "plan";
  const safeArgs = { ...args };
  delete safeArgs.extra_args;
  if (toolName !== "edit_with_claude_code") delete safeArgs.permission_mode;
  return {
    ...safeArgs,
    prompt: specializedPrompt(toolName, safeArgs),
    permission_mode: permissionMode,
  };
}

function formatClaudeOutput(result) {
  if (result.outputFormat !== "json") return result.stdout || "(no stdout)";
  try {
    const parsed = JSON.parse(result.stdout);
    const modelUsage = parsed.modelUsage && typeof parsed.modelUsage === "object" ? parsed.modelUsage : {};
    const models = Object.keys(modelUsage);
    const lines = [];
    if (models.length) lines.push(`models: ${models.join(", ")}`);
    if (typeof parsed.total_cost_usd === "number") lines.push(`cost_usd: ${parsed.total_cost_usd}`);
    if (parsed.session_id) lines.push(`session_id: ${parsed.session_id}`);
    if (typeof parsed.num_turns === "number") lines.push(`turns: ${parsed.num_turns}`);
    lines.push("", parsed.result || "(no result)");
    return lines.join("\n");
  } catch {
    return result.stdout || "(no stdout)";
  }
}

let buffer = Buffer.alloc(0);

function send(obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function handleRequest(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        serverInfo: { name: serverName, version: "1.2.0" },
        capabilities: { tools: {} },
      },
    });
    return;
  }
  if (method === "notifications/initialized") return;
  if (method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: toolDefinitions(),
      },
    });
    return;
  }
  if (method === "tools/call") {
    const requestedName = params?.name;
    const names = new Set(toolDefinitions().map((tool) => tool.name));
    if (!names.has(requestedName)) {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
      return;
    }
    let toolArgs;
    try {
      toolArgs = argumentsForTool(requestedName, params?.arguments || {});
    } catch (err) {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: err?.message || String(err) } });
      return;
    }
    Promise.resolve()
      .then(() => runClaude(toolArgs))
      .then((result) => {
        const lines = [`exit_code: ${result.code}`, `command: ${result.command}`, "", formatClaudeOutput(result)];
        if (result.stderr) lines.push("", "[stderr]", result.stderr);
        send({
          jsonrpc: "2.0",
          id,
          result: { content: textContent(lines.join("\n")), isError: result.code !== 0 },
        });
      })
      .catch((err) => {
        send({ jsonrpc: "2.0", id, error: { code: -32000, message: err?.message || String(err) } });
      });
    return;
  }
  if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const headerText = buffer.slice(0, headerEnd).toString("utf8");
    const match = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) break;
    const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
    buffer = buffer.slice(bodyEnd);
    try {
      handleRequest(JSON.parse(body));
    } catch (err) {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: err?.message || "Parse error" } });
    }
  }
});
