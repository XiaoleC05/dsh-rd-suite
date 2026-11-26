# node.ps1 — 用 DSH 自带的 Node 运行时执行本仓库中的 .mjs 脚本，不依赖 PATH 中的 node。
# 用法：pwsh -NoProfile -ExecutionPolicy Bypass -File <模式仓库>\scripts\node.ps1 scripts/rd-kpi.mjs --days 7
# 工作目录固定为模式仓库根目录：脚本路径与 --out、--json 等相对路径都相对它。
# 不在 DSH 会话中（没有 DSH_NODE_EXECUTABLE）时，退回 PATH 中的 node。
$ErrorActionPreference = 'Stop'
$bundleRoot = Split-Path -Parent $PSScriptRoot
if ($args.Count -lt 1) { Write-Output '用法：node.ps1 <脚本路径> [参数...]'; exit 2 }
$scriptArg = [string]$args[0]
$rest = @($args | Select-Object -Skip 1)
$scriptPath = if ([System.IO.Path]::IsPathRooted($scriptArg)) { $scriptArg } else { Join-Path $bundleRoot $scriptArg }

$useElectron = $false
if ($env:DSH_NODE_EXECUTABLE) {
  $exe = $env:DSH_NODE_EXECUTABLE
  $useElectron = $true
} else {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { Write-Output '找不到可用的 Node：当前不在 DSH 会话中，PATH 中也没有 node。'; exit 3 }
  $exe = $cmd.Source
}

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$start = [System.Diagnostics.ProcessStartInfo]::new($exe)
$start.ArgumentList.Add($scriptPath)
foreach ($item in $rest) { $start.ArgumentList.Add([string]$item) }
if ($useElectron) { $start.Environment['ELECTRON_RUN_AS_NODE'] = '1' }
$start.WorkingDirectory = $bundleRoot
$start.UseShellExecute = $false
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$start.StandardErrorEncoding = [System.Text.Encoding]::UTF8
$process = [System.Diagnostics.Process]::Start($start)
$stderrTask = $process.StandardError.ReadToEndAsync()
$stdout = $process.StandardOutput.ReadToEnd()
$process.WaitForExit()
[Console]::Out.Write($stdout)
[Console]::Error.Write($stderrTask.Result)
exit $process.ExitCode
