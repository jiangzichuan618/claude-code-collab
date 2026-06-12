# Claude Collaboration Templates

Use these templates when a task needs more control than the semantic MCP tools already provide.

## Read-Only Second Opinion

```text
You are Claude Code acting as an independent second-opinion reviewer for Codex.
Mode: review only. Do not edit files.

Task:
<task>

Workspace:
<absolute cwd>

Codex context summary:
<goal, constraints, relevant facts>

Relevant files:
<paths or snippets>

Return:
1. Findings
2. Risks or missing assumptions
3. Disagreements with Codex, if any
4. Concrete next steps
```

Use with `permission_mode: "plan"`.

## Context Summary Before Claude

Before calling Claude, Codex should compress the conversation into this structure:

```text
User goal:
<one sentence>

Current state:
<what has been configured, changed, or observed>

Relevant evidence:
<files, outputs, screenshots, logs, test results>

Codex uncertainty:
<what Codex wants Claude to challenge or verify>

Allowed actions:
<review only / edits allowed / tests allowed>
```

This prevents Claude from receiving a vague prompt like "analyze this" with no context.

## Edits Allowed

```text
You are Claude Code acting as a coding agent coordinated by Codex.
Mode: edits allowed. Make the smallest correct change.

Task:
<task>

Workspace:
<absolute cwd>

Codex context summary:
<context>

Relevant files:
<paths>

After editing, return:
1. Files changed
2. What changed
3. Validation performed
4. Remaining risks
```

Use with `permission_mode: "acceptEdits"` only after explicit user permission.

## Codex-Claude Comparison

```text
You are Claude Code reviewing Codex's reasoning. Be direct and evidence-focused.
Mode: review only. Do not edit files.

Task:
<task>

Codex view:
<summary>

Codex plan:
<plan>

Relevant evidence:
<files, logs, tests, docs>

Return:
1. Where Claude agrees
2. Where Claude disagrees
3. Conflict resolution recommendation
4. Final action checklist
```

## Final Response Shape

After calling Claude, Codex should not merely paste Claude's output. Use:

```text
Claude used: <models line>

Claude view:
<short summary>

Codex view:
<Codex's independent judgment>

Conflict points:
<differences and how they were resolved>

Final action:
<what happens next or what changed>
```
