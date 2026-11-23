[CmdletBinding()]
param([string]$RestoreFrom)
$ErrorActionPreference='Stop'
$registry = Join-Path $env:USERPROFILE '.local/share/agent-console/runtime.json'
$config = Get-Content -LiteralPath $registry -Raw | ConvertFrom-Json
$release = (Resolve-Path -LiteralPath $config.source_root).Path
$resources = (Resolve-Path -LiteralPath (Join-Path $release 'code-wisp/resources')).Path
$appDir = Join-Path $resources 'app'
$installed = (Resolve-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Programs/AgentWhisker/resources/app')).Path
if ((Get-Content -LiteralPath (Join-Path $installed 'package.json') -Raw | ConvertFrom-Json).name -ne 'agentwhisker') {throw 'Unexpected application'}
$python=$config.python
$priorPath=$env:PYTHONPATH
function Invoke-Pet([string]$action) {
    & $python -B -P -m agent_console.pet_control $action
    if ($LASTEXITCODE -ne 0) { throw "AgentWhisker $action failed" }
}
function Remove-AppLink {
    $item=Get-Item -LiteralPath $appDir
    if ($item.LinkType -ne 'Junction' -or [IO.Path]::GetFullPath([string]$item.Target) -ne $installed) {throw 'Unexpected resource link'}
    [IO.Directory]::Delete($appDir)
}
try {
    $env:PYTHONPATH=Join-Path $release 'src'
    $item=Get-Item -LiteralPath $appDir
    if ($RestoreFrom) {
        $backup=Get-Item -LiteralPath $RestoreFrom
        if ($backup.Parent.FullName -ne $resources -or $backup.Name -notmatch '^app\.before-(?:agentwhisker|pingfolk|pipglance|codewisp)-' -or $backup.LinkType) {throw 'Unexpected backup directory'}
        if ($item.LinkType -ne 'Junction' -or $item.Target -ne $installed) {throw 'Different application is active'}
        Invoke-Pet stop
        Remove-AppLink
        Rename-Item -LiteralPath $backup.FullName -NewName 'app'
        Invoke-Pet start
        return
    }
    if ($item.LinkType -eq 'Junction' -and $item.Target -eq $installed) {Write-Output 'AgentWhisker already connected';return}
    if ($item.LinkType -or $item.Parent.FullName -ne $resources -or
        (Get-Content -LiteralPath (Join-Path $item.FullName 'package.json') -Raw | ConvertFrom-Json).name -ne '@ifbars/agent-pets') {throw 'Unrecognized Console companion'}
    $backupName='app.before-agentwhisker-'+(Get-Date -Format 'yyyyMMdd-HHmmss')
    $backupPath=Join-Path $resources $backupName
    Invoke-Pet stop
    Rename-Item -LiteralPath $appDir -NewName $backupName
    try {
        New-Item -ItemType Junction -Path $appDir -Target $installed | Out-Null
        Invoke-Pet start
    } catch {
        if (Test-Path -LiteralPath $appDir) { Remove-AppLink }
        Rename-Item -LiteralPath $backupPath -NewName 'app'
        Invoke-Pet start
        throw
    }
    Write-Output "Connected. Restore with: & '$PSCommandPath' -RestoreFrom '$backupPath'"
} finally { $env:PYTHONPATH=$priorPath }
