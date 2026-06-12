# Codex to Claude Code Bridge Reference

This skill is publishable as a folder. It does not bundle Claude Code, API keys, or provider credentials. Users must install and configure Claude Code separately.

## Included Files

```text
claude-code-collab/
  SKILL.md
  agents/openai.yaml
  references/
  scripts/
    server.mjs
    install-bridge.mjs
```

`server.mjs` exposes these MCP tools:

- `ask_claude_code`
- `review_with_claude_code`
- `edit_with_claude_code`
- `compare_with_claude_code`

## User Prerequisites

- Codex with MCP support.
- Claude Code CLI installed. On Windows, the bridge requires a real `claude.exe`; do not point `CLAUDE_CODE_PATH` at a `.cmd` or `.bat` wrapper.
- Claude Code configured with either official auth or API gateway environment variables in the user's own `.claude/settings.json`.

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

## Register The Bridge

After installing the skill under the user's Codex skills directory, run:

```powershell
node $HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs --root C:\path\to\workspace
```

On macOS/Linux:

```bash
node "$HOME/.codex/skills/claude-code-collab/scripts/install-bridge.mjs" --root /path/to/workspace
```

The installer updates `~/.codex/config.toml`, creates a timestamped backup, and registers:

```toml
[mcp_servers.claude_code_bridge]
command = "<node executable>"
args = ["<skill-root>/scripts/server.mjs"]
startup_timeout_sec = 120

[mcp_servers.claude_code_bridge.env]
CLAUDE_CODE_ALLOWED_ROOTS = "<workspace root>"
```

Restart Codex after running the installer.

`CLAUDE_CODE_ALLOWED_ROOTS` is required. It is a path-list using the platform path delimiter (`;` on Windows, `:` on macOS/Linux). `cwd` and `add_dir` must resolve inside one of these roots.

The installer refuses home directories, filesystem roots, broad user parent directories such as `C:\Users`, `/Users`, and `/home`, and sensitive config/secret directories as workspace roots. If `--root` is omitted, it uses the current working directory only after applying the same validation.

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

### `claude` is not found

Install Claude Code, add the real executable to PATH, or set `CLAUDE_CODE_PATH` to the Claude executable before starting Codex. On Windows, use `claude.exe`, not `claude.cmd`.

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
- Paths are canonicalized with real paths before being passed to Claude Code and must be inside explicitly configured allowed workspace roots.

## Publishing Notes

Publish only the skill folder. Do not include local `.claude/settings.json`, `config.toml`, logs, databases, generated backups, API keys, or provider tokens.
