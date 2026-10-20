param(
  [switch]$Run,
  [switch]$Stop,
  [string]$NodePath = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$taskName = 'LuyenTap-firebase-checkpoint'
$logDir = Join-Path $repoRoot 'work\local-stack-detached'
$logPath = Join-Path $logDir 'checkpoint.log'
$errPath = Join-Path $logDir 'checkpoint.err.log'

function Assert-TaskOwner($Task) {
  if (!$Task) { return }
  $actions = @($Task.Actions)
  if ($actions.Count -ne 1 -or $actions[0].WorkingDirectory -ne $repoRoot -or
      !$actions[0].Arguments.Contains('-File "' + $PSCommandPath + '" -Run ')) {
    throw "Scheduled task $taskName belongs to another checkout. Explicitly transfer ownership before registering or stopping it."
  }
}

if ($Stop) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Assert-TaskOwner $task
  if ($task -and $task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $taskName
    Write-Output "Stopped scheduled task $taskName."
  } else {
    Write-Output "Scheduled task $taskName is not running."
  }
  exit 0
}

if ($Run) {
  if (!(Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    throw "Node executable is unavailable: $NodePath"
  }
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $child = Start-Process -FilePath $NodePath -ArgumentList @('"' + (Join-Path $repoRoot 'scripts\local-firebase.mjs') + '"', 'watch') `
    -WorkingDirectory $repoRoot -WindowStyle Hidden -Wait -PassThru `
    -RedirectStandardOutput "$logPath.$stamp" -RedirectStandardError "$errPath.$stamp"
  exit $child.ExitCode
}

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Assert-TaskOwner $existingTask
if ($existingTask -and $existingTask.State -eq 'Running') {
  Write-Output "Scheduled task $taskName is already running."
  exit 0
}

$nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
$nodePath = $nodeCommand.Source
if (!(Test-Path -LiteralPath $nodePath -PathType Leaf)) {
  throw "Node executable is unavailable: $nodePath"
}

$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Run -NodePath `"$nodePath`""
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -Argument $arguments -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -Hidden

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal `
  -Settings $settings -Description 'Keeps the local Firebase emulator snapshot checkpoint running.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Windows Task Scheduler started $taskName."
Write-Output "Logs: $logPath"
