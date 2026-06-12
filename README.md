# Claude Code Collaboration Skill for Codex

`claude-code-collab` is a Codex skill plus MCP bridge that lets Codex call Claude Code as a second coding agent.

It supports:

- read-only Claude Code review from Codex,
- Codex-vs-Claude plan comparison,
- explicit Claude Code edit mode,
- model/cost/session metadata parsing,
- safe workspace-root boundaries,
- non-persistent sessions by default.

## What This Does Not Include

This repository does not include Claude Code, API keys, provider credentials, or billing access.

Users must install and configure Claude Code separately.

## Install

Copy this folder into your Codex skills directory:

```powershell
$dest = "$HOME\.codex\skills\claude-code-collab"
Copy-Item -Recurse . $dest
```

The bridge registration script requires Node.js. If `node` is not on PATH, use the Node executable bundled with Codex or install Node.js before running the registration command.

Preview the MCP bridge config with an explicit workspace root. This does not modify Codex config:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root "C:\path\to\workspace"
```

On macOS/Linux:

```bash
node "$HOME/.codex/skills/claude-code-collab/scripts/install-bridge.mjs" --root /path/to/workspace
```

To let the script update `~/.codex/config.toml`, opt in explicitly:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root "C:\path\to\workspace" --apply
```

Restart Codex after applying bridge changes.

Check or remove the bridge registration:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --status
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --uninstall
```

If Node is not available on Windows, remove the bridge with PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\claude-code-collab\scripts\remove-bridge.ps1"
```

Use `--uninstall` or `remove-bridge.ps1` if Codex fails to start after registering the bridge, then restart Codex. If neither command can run, restore the newest `config.toml.backup...` from before the install or manually delete only `[mcp_servers.claude_code_bridge]` and `[mcp_servers.claude_code_bridge.env]`.

The installer checks the existing and updated config before writing. If `config.toml` is already malformed, it aborts without modifying the file.

## Prerequisites

- Codex with MCP support.
- Node.js for bridge registration and for the MCP bridge process. Codex-bundled Node can be used if available.
- Claude Code CLI installed.
- Claude Code configured with official auth or an API gateway in the user's own `.claude/settings.json`.

On Windows, the bridge requires a real `claude.exe`; do not point `CLAUDE_CODE_PATH` at a `.cmd` or `.bat` wrapper.

## Tools

The MCP bridge exposes:

- `ask_claude_code`
- `review_with_claude_code`
- `edit_with_claude_code`
- `compare_with_claude_code`

It also exposes service-prefixed aliases:

- `claude_code_ask`
- `claude_code_review`
- `claude_code_edit`
- `claude_code_compare`

If Codex does not expose the MCP tools in a given session, Codex can still call Claude Code through the local `claude` CLI when it is installed and configured. The skill instructs Codex to label this as CLI fallback rather than MCP.

## Safety Defaults

- Read-only review is the default.
- Prompts are sent through stdin rather than process argv.
- Sessions are non-persistent by default.
- `continue_session` is opt-in.
- `bypassPermissions`, `dontAsk`, and arbitrary extra CLI args are not exposed.
- `cwd` and `add_dir` are canonicalized with real paths and must be inside `CLAUDE_CODE_ALLOWED_ROOTS`.

## License

MIT
