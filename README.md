# Claude Code Collaboration Skill for Codex

`claude-code-collab` is a Codex skill for using Claude Code as an explicit second coding agent from a Codex workflow.

The reliable baseline is Claude Code CLI fallback. The optional MCP bridge is included, but Codex Desktop may not expose custom MCP bridge tools to the model in every session even when the server starts and lists tools correctly.

## Capability Matrix

| Capability | Status | Notes |
| --- | --- | --- |
| Claude CLI fallback | Supported | Requires a working local `claude` command. Codex can run `claude -p ...` and report that it used CLI fallback. |
| MCP bridge tools | Experimental | The bridge can expose tools, but the current Codex surface may not make custom MCP tools available to the model. |
| Read-only second opinion | Supported | Default mode. Uses `--permission-mode plan` and non-persistent Claude sessions. |
| Claude edits files | Explicit opt-in | Use only through `edit_with_claude_code` or an explicit user-approved CLI command. |

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

## Safe Install For Classmates

First verify Claude Code works outside Codex:

```powershell
claude -p "Reply exactly OK." --output-format json --permission-mode plan --no-session-persistence
```

If this fails, fix Claude Code, the API gateway, or billing before installing the skill.

Then install the skill folder into Codex:

```powershell
$dest = "$HOME\.codex\skills\claude-code-collab"
Copy-Item -Recurse . $dest
```

Restart Codex. At this point the skill can still guide Codex to use CLI fallback even without MCP bridge registration.

## Optional MCP Bridge

Preview the MCP bridge config with an explicit workspace root. This does not modify Codex config:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root "C:\path\to\workspace"
```

On macOS/Linux:

```bash
node "$HOME/.codex/skills/claude-code-collab/scripts/install-bridge.mjs" --root /path/to/workspace
```

The bridge registration script requires Node.js. If `node` is not on PATH, use the Node executable bundled with Codex or install Node.js before running the registration command.

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

The installer runs a conservative config safety check before writing. If `config.toml` is malformed, or uses TOML syntax outside this conservative checker, `--apply` aborts without modifying the file.

## Prerequisites

- Claude Code CLI installed.
- Claude Code configured with official auth or an API gateway in the user's own `.claude/settings.json`.
- Codex with skills enabled.
- Node.js only if using the optional MCP bridge. Codex-bundled Node can be used if available.

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
- Generic `ask_claude_code` cannot request `acceptEdits`; edit mode is reserved for the explicit edit tool.
- `cwd` and `add_dir` are canonicalized with real paths and must be inside `CLAUDE_CODE_ALLOWED_ROOTS`.

## Manual Smoke Tests

Run these before giving the skill to someone else:

```powershell
claude --version
claude -p "Reply exactly OK." --output-format json --permission-mode plan --no-session-persistence
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --status
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root "C:\path\to\workspace"
```

## License

MIT
