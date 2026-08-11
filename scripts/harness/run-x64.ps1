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

$configuredNode = $env:CODEX_X64_NODE
if ([string]::IsNullOrWhiteSpace($configuredNode)) {
    $configuredNode = Join-Path $env:USERPROFILE 'Tools\node-x64\node.exe'
}
$nodePath = (Resolve-Path -LiteralPath $configuredNode -ErrorAction SilentlyContinue).Path
if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    Fail 'X64_NODE_PREREQUISITE_MISSING' "x64 Node not found; set CODEX_X64_NODE or install it at $configuredNode"
}

$nodeArch = (& $nodePath -p "process.arch" 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeArch -ne 'x64') {
    Fail 'X64_NODE_ARCH_MISMATCH' "configured Node reports process.arch=$nodeArch, expected x64: $nodePath"
}

$runner = Join-Path $PSScriptRoot 'run-isolated.mjs'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    Fail 'HARNESS_CONTRACT_MISMATCH' "versioned runner missing: $runner"
}

& $nodePath $runner
exit $LASTEXITCODE
