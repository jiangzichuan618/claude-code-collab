param(
  [string]$ConfigPath
)

if (-not $ConfigPath) {
  $codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
  $ConfigPath = Join-Path $codexHome "config.toml"
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  Write-Error "Codex config not found: $ConfigPath"
  exit 1
}

$backup = "$ConfigPath.backup.$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item -LiteralPath $ConfigPath -Destination $backup -Force

$text = Get-Content -LiteralPath $ConfigPath -Raw
$text = [regex]::Replace($text, '(?ms)^\s*\[mcp_servers\.claude_code_bridge\]\s*\r?\n.*?(?=^\s*\[|\z)', '')
$text = [regex]::Replace($text, '(?ms)^\s*\[mcp_servers\.claude_code_bridge\.env\]\s*\r?\n.*?(?=^\s*\[|\z)', '')
$text = [regex]::Replace($text, "(\r?\n){3,}", "`r`n`r`n").TrimEnd() + "`r`n"

[System.IO.File]::WriteAllText($ConfigPath, $text, [System.Text.UTF8Encoding]::new($false))

Write-Host "Removed claude_code_bridge from $ConfigPath"
Write-Host "Backup: $backup"
Write-Host "Restart Codex to apply the change."
