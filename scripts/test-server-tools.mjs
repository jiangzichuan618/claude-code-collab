import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(scriptDir, "server.mjs");
const allowedRoot = path.resolve(path.join(scriptDir, "..", ".."));
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

function send(obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
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

function finish(code, message) {
  try {
    child.kill();
  } catch {
    // Best effort shutdown.
  }
  if (code === 0) {
    console.log(message);
  } else {
    console.error(message);
    if (stderr.trim()) console.error(stderr.trim());
  }
  process.exit(code);
}

const timer = setTimeout(() => finish(2, "server tools test timed out"), 10000);

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (const message of parseMessages()) {
    if (message.id !== 2) continue;
    clearTimeout(timer);
    const names = new Set((message.result?.tools || []).map((tool) => tool.name));
    const missing = requiredTools.filter((name) => !names.has(name));
    if (missing.length) {
      finish(1, `missing tools: ${missing.join(", ")}`);
      return;
    }
    finish(0, "server tool list regression tests passed");
  }
});

child.on("error", (err) => {
  clearTimeout(timer);
  finish(1, err.message);
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-server-tools", version: "0" },
  },
});
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
