# validate.ps1 — 在 DSH 会话的 pwsh 中运行研发模式 bundle 的完整校验。
# 用法：pwsh -NoProfile -ExecutionPolicy Bypass -File <bundle>\scripts\validate.ps1
# 使用 DSH 自带的 Electron 运行时（ELECTRON_RUN_AS_NODE=1）读取 app.asar 中的 js-yaml 与插件 schema。
# Windows 上该运行时是 GUI 子系统程序，必须用重定向输出的方式启动并等待退出码。
$ErrorActionPreference = 'Stop'
$bundleRoot = Split-Path -Parent $PSScriptRoot
$validator = Join-Path $PSScriptRoot 'validate-bundle.mjs'

if (-not $env:DSH_NODE_EXECUTABLE -or -not $env:DSH_INSTALL_DIR) {
  Write-Output '未检测到 DSH_NODE_EXECUTABLE / DSH_INSTALL_DIR（不在 DSH 会话中？），改用 PATH 中的 node 做静态检查。'
  & node $validator
  exit $LASTEXITCODE
}

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$start = [System.Diagnostics.ProcessStartInfo]::new($env:DSH_NODE_EXECUTABLE)
foreach ($item in @($validator, '--dsh-install', $env:DSH_INSTALL_DIR)) { $start.ArgumentList.Add($item) }
$start.Environment['ELECTRON_RUN_AS_NODE'] = '1'
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
