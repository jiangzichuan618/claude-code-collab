# Claude Code Collaboration Skill for Codex

中文说明在前，English guide follows below.

## 中文说明

### 这个项目是什么

这是一个给 Codex 使用的协作型 skill。它让 Codex 在需要第二意见、代码审查、方案比较或明确授权的代码修改时，可以把任务整理后交给本机的 Claude Code 参与。

它不是 Claude Code 本体，也不包含 API key、账号、余额或网关配置。使用者自己的电脑上必须已经能正常运行 Claude Code。

### 一句话说明

如果你的电脑里 `claude` 命令已经能正常工作，这个 skill 会教 Codex 如何安全地调用 Claude Code，并把 Claude 的意见和 Codex 自己的判断合并起来。

### 现在能做到什么

- 让 Claude Code 做只读第二意见审查。
- 让 Claude Code 挑 Codex 方案里的逻辑问题、风险点和遗漏。
- 对比 Claude 和 Codex 的观点，整理冲突点和最终建议。
- 在用户明确允许时，让 Claude Code 参与代码修改。
- 默认不续用 Claude 旧会话，减少上下文串台。
- 限制 Claude 只能在指定工作区内工作，避免误读敏感目录。

### 现在做不到什么

- 不能自动安装 Claude Code。
- 不能提供作者的 API key、账号、余额或中转站权限。
- 不能保证每个 Codex 会话都会直接显示 MCP bridge 工具。
- 不能绕过 Claude Code 自己的模型、计费、网关或权限限制。

### 两种调用方式

**CLI fallback 是当前最可靠的方式。**  
Codex 可以通过本机 `claude` 命令调用 Claude Code，并明确说明这次是 CLI fallback，而不是 MCP 工具调用。

**MCP bridge 是可选增强。**  
这个仓库包含 MCP bridge 脚本，但在当前 Codex Desktop 里，即使 bridge 能启动并列出工具，某些会话也可能不会把这些自定义工具暴露给模型。所以它应该被当成可选功能，而不是安装后必然生效的能力。

### 给同学试用前先确认

让同学先在终端里测试 Claude Code 是否能正常回答：

```powershell
claude -p "Reply exactly OK." --output-format json --permission-mode plan --no-session-persistence
```

如果这一步失败，先修 Claude Code、API 网关、模型名或余额。skill 本身不能解决 Claude Code 没配置好的问题。

### 安装 skill

把这个仓库文件夹复制到 Codex 的 skills 目录：

```powershell
$dest = "$HOME\.codex\skills\claude-code-collab"
Copy-Item -Recurse . $dest
```

然后重启 Codex。

重启后，可以直接在 Codex 里说：

```text
用 Claude Code 帮我审核一下这个方案
```

或者：

```text
让 Claude Code 作为第二意见，检查这个改法有没有风险
```

如果当前会话没有暴露 MCP bridge 工具，Codex 应该会改走本机 `claude` 命令，并说明它用的是 CLI fallback。

### 可选：注册 MCP bridge

普通试用不一定需要这一步。只有你想尝试让 Codex 会话里出现 `review_with_claude_code`、`compare_with_claude_code`、`edit_with_claude_code` 这些 bridge 工具时，才需要注册 MCP bridge。

先预览配置，不会修改 Codex 配置文件：

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root "C:\path\to\workspace"
```

确认没问题后，再显式写入配置：

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root "C:\path\to\workspace" --apply
```

写入后重启 Codex。

查看或移除 bridge：

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --status
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --uninstall
```

如果 Windows 上没有 `node`，可以用 PowerShell 移除 bridge：

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\claude-code-collab\scripts\remove-bridge.ps1"
```

### 安全设计

- 默认只读审查，不让 Claude 修改文件。
- 只有用户明确说可以修改时，才使用编辑模式。
- 泛用 `ask_claude_code` 不能请求 `acceptEdits`。
- 不暴露 `bypassPermissions`、`dontAsk` 或任意额外 CLI 参数。
- 默认使用非持久 Claude 会话。
- 只允许在配置的 workspace root 里工作。
- 安装器默认 dry-run，只有加 `--apply` 才会写入 Codex 配置。
- 写配置前会做保守安全检查，并创建备份。

### 常见问题

**装了 skill，是不是就一定能用 Claude？**  
不是。使用者自己必须先装好 Claude Code，并且 `claude` 命令能正常调用模型。

**为什么有时候看不到 MCP 工具？**  
这是当前 Codex Desktop 暴露自定义 MCP 工具的限制。看不到时仍然可以走 CLI fallback。

**同学安装后 Codex 出问题怎么办？**  
先移除 bridge 注册，再重启 Codex。skill 文件本身一般不会影响沙盒，容易出问题的是写入 `~/.codex/config.toml` 的 MCP 配置。

**这个 skill 最适合怎么用？**  
把 Claude Code 当成第二审稿人或第二程序员，而不是让它完全接管 Codex。最佳流程是：Codex 总结上下文，Claude 挑刺，Codex 再做最终判断和执行。

---

## English Guide

### What This Project Is

This is a collaboration skill for Codex. It helps Codex consult local Claude Code when you want a second opinion, code review, plan comparison, or user-approved code edits.

It is not Claude Code itself. It does not include API keys, accounts, balance, billing access, or gateway configuration. Each user must have Claude Code working on their own machine.

### Short Version

If the local `claude` command already works, this skill teaches Codex how to call Claude Code safely and then reconcile Claude's feedback with Codex's own judgment.

### What It Can Do

- Ask Claude Code for read-only second-opinion reviews.
- Ask Claude Code to challenge Codex's plan, assumptions, and risk points.
- Compare Claude's view with Codex's view and summarize conflicts.
- Let Claude Code edit files only after explicit user permission.
- Use non-persistent Claude sessions by default.
- Restrict Claude Code work to configured workspace roots.

### What It Cannot Do

- It cannot install Claude Code automatically.
- It cannot provide the author's API key, account, balance, or gateway access.
- It cannot guarantee that every Codex session will expose MCP bridge tools.
- It cannot bypass Claude Code model, billing, gateway, or permission limits.

### Two Ways To Call Claude Code

**CLI fallback is the reliable baseline.**
Codex can call Claude Code through the local `claude` command and clearly report that it used CLI fallback rather than MCP.

**MCP bridge is an optional enhancement.**
This repo includes an MCP bridge, but Codex Desktop may not expose custom MCP tools to the model in every session, even when the bridge process starts and lists tools correctly. Treat MCP as optional, not guaranteed.

### Check Before Sharing With A Classmate

Ask them to run this in a terminal first:

```powershell
claude -p "Reply exactly OK." --output-format json --permission-mode plan --no-session-persistence
```

If this fails, fix Claude Code, the API gateway, model name, or billing before installing the skill. The skill cannot create Claude access by itself.

### Install The Skill

Copy this repository folder into the Codex skills directory:

```powershell
$dest = "$HOME\.codex\skills\claude-code-collab"
Copy-Item -Recurse . $dest
```

Restart Codex.

Then you can ask Codex things like:

```text
Use Claude Code to review this plan.
```

or:

```text
Ask Claude Code for a second opinion on this change.
```

If MCP bridge tools are not exposed in the current session, Codex should use the local `claude` command and label it as CLI fallback.

### Optional: Register The MCP Bridge

Most users do not need this for a first trial. Register the MCP bridge only if you want to try exposing tools such as `review_with_claude_code`, `compare_with_claude_code`, and `edit_with_claude_code` inside Codex.

Preview the config first. This does not modify the Codex config file:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root "C:\path\to\workspace"
```

If the preview looks correct, explicitly apply it:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --root "C:\path\to\workspace" --apply
```

Restart Codex after applying.

Check or remove the bridge:

```powershell
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --status
node "$HOME\.codex\skills\claude-code-collab\scripts\install-bridge.mjs" --uninstall
```

If Node is not available on Windows, remove the bridge with PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\.codex\skills\claude-code-collab\scripts\remove-bridge.ps1"
```

### Safety Defaults

- Read-only review is the default.
- Claude Code edits files only after explicit user permission.
- Generic `ask_claude_code` cannot request `acceptEdits`.
- `bypassPermissions`, `dontAsk`, and arbitrary extra CLI args are not exposed.
- Claude sessions are non-persistent by default.
- Claude work is restricted to configured workspace roots.
- The installer is dry-run by default; it writes Codex config only with `--apply`.
- The installer performs conservative config checks and creates backups before writing.

### FAQ

**Does installing this skill automatically enable Claude?**
No. Each user must install and configure Claude Code first, and the local `claude` command must be able to call a model.

**Why do I sometimes not see MCP tools?**
This is a current limitation of custom MCP tool exposure in Codex Desktop. When this happens, CLI fallback can still be used.

**What if Codex has startup or sandbox problems after bridge registration?**
Remove the bridge registration and restart Codex. The skill files usually do not affect sandbox setup; problems are more likely caused by the MCP section written to `~/.codex/config.toml`.

**What is the best way to use this skill?**
Use Claude Code as a second reviewer or second coding agent, not as an uncontrolled replacement for Codex. The best workflow is: Codex summarizes context, Claude challenges it, then Codex reconciles and executes.

## License

MIT
