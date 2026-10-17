param(
  [Parameter(Mandatory = $true)][ValidateSet('database', 'firestore')][string]$Name,
  [Parameter(Mandatory = $true)][string]$Jar,
  [Parameter(Mandatory = $true)][int]$Port,
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$Rules,
  [string]$ImportMetadata = '',
  [switch]$Run
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$taskName = "LuyenTap-firebase-$Name"
if (!$Run) {
  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existingTask.State -eq 'Running') { return }
  $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Run -Name $Name -Jar `"$Jar`" -Port $Port -ProjectId `"$ProjectId`" -Rules `"$Rules`""
  if ($ImportMetadata) { $arguments += " -ImportMetadata `"$ImportMetadata`"" }
  $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $repoRoot
  $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Output "Windows Task Scheduler started $taskName independently of Codex."
  return
}

$drive = $Jar.Substring(0, 1).ToLowerInvariant()
$wslJar = "/mnt/$drive/" + $Jar.Substring(3).Replace('\', '/')
$wslRules = "/mnt/$($Rules.Substring(0, 1).ToLowerInvariant())/" + $Rules.Substring(3).Replace('\', '/')
# IPv6-mapped Java sockets make WSL expose only Windows IPv6, delaying Worker localhost connections.
$command = "exec java -Djava.net.preferIPv4Stack=true -jar `"$wslJar`" --host `"127.0.0.1`" --port $Port"

if ($Name -eq 'firestore') {
  $command += " --project_id `"$ProjectId`" --rules `"$wslRules`""
  if ($ImportMetadata) {
    $wslImport = "/mnt/$($ImportMetadata.Substring(0, 1).ToLowerInvariant())/" + $ImportMetadata.Substring(3).Replace('\', '/')
    $command += " --seed_from_export `"$wslImport`""
  }
}

$logDir = Join-Path $repoRoot 'work\local-stack-detached'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$emulatorProcess = Start-Process -WindowStyle Hidden -FilePath wsl.exe -ArgumentList "bash -lc '$command'" `
  -RedirectStandardOutput (Join-Path $logDir "firebase-$Name.log") `
  -RedirectStandardError (Join-Path $logDir "firebase-$Name.err.log") -Wait -PassThru
exit $emulatorProcess.ExitCode
