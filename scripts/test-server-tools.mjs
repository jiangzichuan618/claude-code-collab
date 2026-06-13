import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(scriptDir, "server.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-server-test-"));
const allowedRoot = path.join(tmp, "allowed");
const outsideRoot = path.join(tmp, "outside");
fs.mkdirSync(allowedRoot, { recursive: true });
fs.mkdirSync(outsideRoot, { recursive: true });

const requiredTools = [
  "ask_claude_code",
  "review_with_claude_code",
  "edit_with_claude_code",
  "compare_with_claude_code",
  "claude_code_ask",
  "claude_code_review",
  "claude_code_edit",
  "claude_code_compare",
];

const child = spawn(process.execPath, [server], {
  env: { ...process.env, CLAUDE_CODE_ALLOWED_ROOTS: allowedRoot },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

let buffer = Buffer.alloc(0);
let stderr = "";
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId;
  nextId += 1;
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }), "utf8");
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function notify(method, params = {}) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", method, params }), "utf8");
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}

function parseMessages() {
  const messages = [];
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const headerText = buffer.slice(0, headerEnd).toString("utf8");
    const match = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error(`Bad MCP header: ${headerText}`);
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) break;
    messages.push(JSON.parse(buffer.slice(bodyStart, bodyEnd).toString("utf8")));
    buffer = buffer.slice(bodyEnd);
  }
  return messages;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function shutdown() {
  try {
    child.kill();
  } catch {
    // Best effort shutdown.
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

const timer = setTimeout(() => {
  for (const { reject } of pending.values()) reject(new Error("server tools test timed out"));
  pending.clear();
}, 10000);

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

child.stdout.on("data", (chunk) => {
  try {
    buffer = Buffer.concat([buffer, chunk]);
    for (const message of parseMessages()) {
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      waiter.resolve(message);
    }
  } catch (err) {
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  }
});

child.on("error", (err) => {
  for (const { reject } of pending.values()) reject(err);
  pending.clear();
});

try {
  const initialized = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-server-tools", version: "0" },
  });
  assert(initialized.result?.capabilities?.tools, "initialize did not advertise tools capability");
  notify("notifications/initialized");

  const listed = await send("tools/list");
  const names = new Set((listed.result?.tools || []).map((tool) => tool.name));
  const missing = requiredTools.filter((name) => !names.has(name));
  assert(!missing.length, `missing tools: ${missing.join(", ")}`);

  const ask = (listed.result.tools || []).find((tool) => tool.name === "ask_claude_code");
  const modes = ask?.inputSchema?.properties?.permission_mode?.enum || [];
  assert(!modes.includes("acceptEdits"), "ask_claude_code schema still exposes acceptEdits");

  const editDenied = await send("tools/call", {
    name: "ask_claude_code",
    arguments: {
      prompt: "Do not run Claude.",
      cwd: allowedRoot,
      permission_mode: "acceptEdits",
    },
  });
  assert(editDenied.error?.message?.includes("edit_with_claude_code"), "ask accepted acceptEdits");

  const outsideDenied = await send("tools/call", {
    name: "claude_code_review",
    arguments: {
      task: "Do not run Claude.",
      cwd: outsideRoot,
    },
  });
  assert(outsideDenied.error?.message?.includes("outside allowed workspace roots"), "outside cwd was not rejected");

  const unknownDenied = await send("tools/call", {
    name: "claude_code_missing",
    arguments: {},
  });
  assert(unknownDenied.error?.message?.includes("Unknown tool"), "unknown alias was not rejected");

  clearTimeout(timer);
  shutdown();
  console.log("server tool regression tests passed");
} catch (err) {
  clearTimeout(timer);
  shutdown();
  console.error(err?.message || String(err));
  if (stderr.trim()) console.error(stderr.trim());
  process.exit(1);
}
