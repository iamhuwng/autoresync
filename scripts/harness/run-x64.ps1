<#
.SYNOPSIS
    Bootstrap the repository harness with Windows x64 Node.
.DESCRIPTION
    This file never installs into or links from repository node_modules. The
    versioned Node harness owns immutable dependency caches and per-run mirrors.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Fail([string] $Code, [string] $Message) {
    [Console]::Error.WriteLine("HARNESS_FAILURE $Code")
    [Console]::Error.WriteLine("x64 harness: $Message")
    [Console]::Error.WriteLine("x64 harness: run 'node scripts/harness/run-tool.mjs --contract' and follow remediations.$Code")
    exit 2
}

if ([string]::IsNullOrWhiteSpace($env:CODEX_HARNESS_INVOCATION_B64)) {
    Fail 'DISPATCH_PROTOCOL_MISSING' 'missing dispatcher invocation protocol'
}

$candidatePaths = [System.Collections.Generic.List[string]]::new()
function Add-Candidate([string] $Candidate) {
    if (-not [string]::IsNullOrWhiteSpace($Candidate) -and -not $candidatePaths.Contains($Candidate)) {
        $candidatePaths.Add($Candidate)
    }
}

Add-Candidate $env:CODEX_X64_NODE
Add-Candidate (Join-Path $env:USERPROFILE 'Tools\node-x64\node.exe')
Add-Candidate (Join-Path $env:ProgramFiles 'nodejs\node.exe')
if (-not [string]::IsNullOrWhiteSpace(${env:ProgramFiles(x86)})) {
    Add-Candidate (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')
}
if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    Add-Candidate (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
}
Get-Command node.exe -All -ErrorAction SilentlyContinue | ForEach-Object { Add-Candidate $_.Source }

$nodePath = $null
$discoveries = [System.Collections.Generic.List[string]]::new()
foreach ($candidate in $candidatePaths) {
    $resolved = (Resolve-Path -LiteralPath $candidate -ErrorAction SilentlyContinue).Path
    if (-not $resolved -or -not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        $discoveries.Add("$candidate=missing")
        continue
    }
    $candidateArch = (& $resolved -p "process.arch" 2>$null).Trim()
    if ($LASTEXITCODE -eq 0) {
        $discoveries.Add("$resolved=$candidateArch")
        if ($candidateArch -eq 'x64') {
            $nodePath = $resolved
            break
        }
    } else {
        $discoveries.Add("$resolved=unavailable")
    }
}
if (-not $nodePath) {
    Fail 'X64_NODE_PREREQUISITE_MISSING' "no compatible x64 Node was discovered; checked: $($discoveries -join '; ')"
}
$env:CODEX_X64_NODE = $nodePath
$discovery = [ordered]@{
    selected = $nodePath
    reason = 'first-compatible-x64-runtime'
    candidates = @($discoveries)
    adaptation = 'scoped CODEX_X64_NODE and PATH to harness child'
}
$discoveryJson = $discovery | ConvertTo-Json -Compress
$env:CODEX_HARNESS_X64_DISCOVERY_B64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($discoveryJson))

$runner = Join-Path $PSScriptRoot 'run-isolated.mjs'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    Fail 'HARNESS_CONTRACT_MISMATCH' "versioned runner missing: $runner"
}

& $nodePath $runner
exit $LASTEXITCODE
