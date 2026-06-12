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

Preview the MCP bridge config with an explicit workspace root. This does not modify Codex config:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root C:\path\to\workspace
```

On macOS/Linux:

```bash
node "$HOME/.codex/skills/claude-code-collab/scripts/install-bridge.mjs" --root /path/to/workspace
```

To let the script update `~/.codex/config.toml`, opt in explicitly:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root C:\path\to\workspace --apply
```

Restart Codex after installing.

Check or remove the bridge registration:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --status
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --uninstall
```

If Node is not available on Windows, remove the bridge with PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\claude-code-collab\scripts\remove-bridge.ps1"
```

Use `--uninstall` if Codex fails to start after registering the bridge, then restart Codex. The installer creates a timestamped `config.toml.backup...` before every change.

## Prerequisites

- Codex with MCP support.
- Claude Code CLI installed.
- Claude Code configured with official auth or an API gateway in the user's own `.claude/settings.json`.

On Windows, the bridge requires a real `claude.exe`; do not point `CLAUDE_CODE_PATH` at a `.cmd` or `.bat` wrapper.

## Tools

The MCP bridge exposes:

- `ask_claude_code`
- `review_with_claude_code`
- `edit_with_claude_code`
- `compare_with_claude_code`

## Safety Defaults

- Read-only review is the default.
- Prompts are sent through stdin rather than process argv.
- Sessions are non-persistent by default.
- `continue_session` is opt-in.
- `bypassPermissions`, `dontAsk`, and arbitrary extra CLI args are not exposed.
- `cwd` and `add_dir` are canonicalized with real paths and must be inside `CLAUDE_CODE_ALLOWED_ROOTS`.

## License

MIT
