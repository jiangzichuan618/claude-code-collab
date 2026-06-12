---
name: claude-code-collab
description: Use when the user explicitly asks Codex to call, consult, switch to, compare with, review using, hand work to, or collaborate with Claude Code from inside Codex; when the user mentions Claude or Claude Code as a second coding agent for analysis, review, debugging, planning, editing, mutual correction, or model switching. Provides a Codex-to-Claude-Code workflow with MCP bridge scripts, safe defaults, context packaging, model selection, edit gating, and result reconciliation.
---

# Claude Code Collaboration

Use Codex as the primary agent and Claude Code as an explicit second agent through MCP tools supplied by this skill.

## Available Tools

Prefer these MCP tools when available:

- `review_with_claude_code`: second opinion, read-only review, plan critique, risk check.
- `compare_with_claude_code`: compare Claude's judgment with Codex's current view or plan.
- `edit_with_claude_code`: allow Claude Code to edit files. Use only when the user explicitly permits edits.
- `ask_claude_code`: custom prompt escape hatch with restricted permission modes.

If the tools are unavailable, read `references/bridge.md` and report the missing bridge instead of pretending Claude was called.

## Default Flow

1. Identify intent:
   - Review/second opinion -> `review_with_claude_code`.
   - Codex-vs-Claude comparison -> `compare_with_claude_code`.
   - Claude should write code -> `edit_with_claude_code`, only after explicit user permission.
   - Custom or unusual request -> `ask_claude_code`.
2. Summarize context before calling Claude:
   - user goal,
   - current workspace/repo,
   - relevant files or snippets,
   - Codex's current plan or uncertainty,
   - constraints and allowed edit mode.
3. Call Claude with `cwd` set to the relevant workspace.
4. Report model/cost/session metadata when the tool returns it.
5. Reconcile results:
   - Claude view,
   - Codex view,
   - conflict points,
   - final recommendation or executed changes.

## Edit Safety

Default to read-only review. Do not let Claude edit files unless the user says it may fix, modify, write, or edit.

After Claude edits files, inspect the diff and run focused validation before treating the result as complete.

`bypassPermissions` is intentionally not exposed by this bridge.

The bridge does not expose `bypassPermissions`, `dontAsk`, or arbitrary extra CLI args. It also sends prompts through stdin and defaults to non-persistent Claude sessions.

Use `continue_session` only when the user explicitly wants Claude Code to continue its own prior context. It may reuse earlier Claude-side task context, so keep it off for unrelated or sensitive tasks.

## Model Selection

Do not guess model names. If the user requests a model, pass the exact `model` value only when they provide it or the gateway's supported name is already known.

If the user asks which model was used, inspect the returned `models:` line from the tool output. If needed, run a tiny JSON probe through Claude Code.

## Result Template

Use this shape after a Claude call:

```text
Claude used: <model line if available>

Claude view:
<summary>

Codex view:
<your judgment>

Conflict points:
<none or list>

Final action:
<what will be done / what was done>
```

For detailed prompt templates and troubleshooting, read:

- `references/templates.md`
- `references/bridge.md`

## Installation For New Machines

This skill includes the MCP bridge at `scripts/server.mjs`. To register it with Codex on a machine where the skill is installed, run:

```powershell
node $HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs --root C:\path\to\workspace
```

Restart Codex after installation or bridge changes.

The installer writes `CLAUDE_CODE_ALLOWED_ROOTS` for the supplied workspace root. Do not use the user home directory, a filesystem root, a broad user parent such as `C:\Users`, `/Users`, or `/home`, or a secrets/config directory as the root. To allow more workspace roots, edit the MCP server env value after installation.
