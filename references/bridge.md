# Codex to Claude Code Bridge Reference

This skill is publishable as a folder. It does not bundle Claude Code, API keys, or provider credentials. Users must install and configure Claude Code separately.

## Current Capability Positioning

Use CLI fallback as the reliable baseline. Treat the MCP bridge as an optional enhancement.

The bridge can start and list tools in local tests while a Codex Desktop session still does not expose custom MCP tools to the model. In that case, call Claude Code through the local `claude` CLI and report that the call used CLI fallback, not MCP.

Windows distinction:

- CLI fallback can work through the user's normal `claude` command, which may resolve to `claude.cmd`.
- MCP bridge process execution intentionally requires a real `claude.exe`; do not set `CLAUDE_CODE_PATH` to a `.cmd` or `.bat` wrapper.

## Included Files

```text
claude-code-collab/
  SKILL.md
  agents/openai.yaml
  references/
  scripts/
    server.mjs
    install-bridge.mjs
    remove-bridge.ps1
```

`server.mjs` exposes these MCP tools:

- `ask_claude_code`
- `review_with_claude_code`
- `edit_with_claude_code`
- `compare_with_claude_code`

It also exposes service-prefixed aliases:

- `claude_code_ask`
- `claude_code_review`
- `claude_code_edit`
- `claude_code_compare`

## User Prerequisites

- Codex with skills enabled.
- Claude Code CLI installed.
- Claude Code configured with either official auth or API gateway environment variables in the user's own `.claude/settings.json`.
- Node.js only if using the optional MCP bridge. Codex-bundled Node can be used if available.

For API gateway usage, `.claude/settings.json` commonly contains:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "<provider base URL>",
    "ANTHROPIC_AUTH_TOKEN": "<provider key>"
  }
}
```

Do not commit this settings file or any real key.

Before installing the bridge for a classmate, verify Claude Code itself:

```powershell
claude -p "Reply exactly OK." --output-format json --permission-mode plan --no-session-persistence
```

If this fails, fix Claude Code configuration, gateway routing, supported model names, or billing first. Installing the skill cannot create Claude access.

## Register The Bridge

After installing the skill under the user's Codex skills directory, preview the optional bridge config:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root "C:\path\to\workspace"
```

On macOS/Linux:

```bash
node "$HOME/.codex/skills/claude-code-collab/scripts/install-bridge.mjs" --root /path/to/workspace
```

The preview command validates the root and prints the TOML block without modifying `~/.codex/config.toml`.

To let the script update `~/.codex/config.toml`, opt in explicitly:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root "C:\path\to\workspace" --apply
```

When `--apply` is used, the installer checks the existing and updated config, creates a timestamped backup, and registers:

```toml
[mcp_servers.claude_code_bridge]
command = "<node executable>"
args = ["<skill-root>/scripts/server.mjs"]
startup_timeout_sec = 120

[mcp_servers.claude_code_bridge.env]
CLAUDE_CODE_ALLOWED_ROOTS = "<workspace root>"
```

Restart Codex after running the installer.

The installer runs a conservative config safety check before writing. If `config.toml` is malformed, or uses TOML syntax outside this conservative checker, `--apply` aborts without modifying the file. Fix or restore the Codex config before applying the bridge.

`CLAUDE_CODE_ALLOWED_ROOTS` is required. It is a path-list using the platform path delimiter (`;` on Windows, `:` on macOS/Linux). `cwd` and `add_dir` must resolve inside one of these roots.

The installer refuses home directories, filesystem roots, broad user parent directories such as `C:\Users`, `/Users`, and `/home`, and sensitive config/secret directories as workspace roots. If `--root` is omitted, it uses the current working directory only after applying the same validation.

Check or remove the bridge:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --status
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --uninstall
```

If Node is unavailable on Windows, remove the bridge with:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\claude-code-collab\scripts\remove-bridge.ps1"
```

Use `--uninstall` or `remove-bridge.ps1` if Codex fails to start after bridge registration. Then restart Codex. The installer creates a timestamped `config.toml.backup...` before every config change.

## Quick Checks

Check Claude Code:

```powershell
claude --version
```

Check the actual model with a small call:

```powershell
claude -p "Reply exactly OK." --output-format json --permission-mode plan --no-session-persistence
```

Read `modelUsage` in the JSON output.

## Common Problems

### Tool unavailable in Codex

Restart Codex after adding or editing `[mcp_servers.claude_code_bridge]`.

If the bridge process is running but the MCP tools are not exposed in the current Codex session, use Claude Code CLI fallback when available:

```powershell
where claude
claude -p "Reply exactly OK." --output-format json --permission-mode plan --no-session-persistence
```

Report fallback honestly as CLI fallback, not MCP.

### Codex fails to start after registration

Remove only the Claude bridge and restart Codex:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --uninstall
```

If `node` is not available:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\claude-code-collab\scripts\remove-bridge.ps1"
```

If that command cannot run, restore the newest `~\.codex\config.toml.backup...` from before the install, or manually delete `[mcp_servers.claude_code_bridge]` and `[mcp_servers.claude_code_bridge.env]` from `~\.codex\config.toml`.

### `claude` is not found

For CLI fallback, install Claude Code and ensure `claude` works in a terminal.

For MCP bridge, add the real executable to PATH or set `CLAUDE_CODE_PATH` to the Claude executable before starting Codex. On Windows, use `claude.exe`, not `claude.cmd`.

### API or billing error

Confirm the user's `.claude/settings.json` provider URL/key, account balance, and supported Claude model names. Do not print secrets.

### Dashboard platform split looks wrong

Some gateways classify usage by route or key rather than the actual model family. Confirm actual model usage from Claude Code's JSON `modelUsage` field or provider usage logs.

### Claude edits files

Inspect diffs before trusting the edits:

```powershell
git diff --stat
git diff
```

Run focused validation where practical.

## Safety Defaults

- Prompts are sent to Claude Code through stdin rather than process argv.
- Normal calls use `--no-session-persistence`.
- `continue_session` is opt-in.
- `continue_session` may reuse earlier Claude-side context. Use it only when the user explicitly wants continuity for the same task.
- The bridge does not expose `bypassPermissions`, `dontAsk`, or arbitrary extra CLI args.
- Generic `ask_claude_code` cannot request `acceptEdits`; edit mode is reserved for `edit_with_claude_code`.
- Paths are canonicalized with real paths before being passed to Claude Code and must be inside explicitly configured allowed workspace roots.

## Publishing Notes

Publish only the skill folder. Do not include local `.claude/settings.json`, `config.toml`, logs, databases, generated backups, API keys, or provider tokens.
