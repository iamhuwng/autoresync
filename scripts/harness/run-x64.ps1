<#!
.SYNOPSIS
    Run project tooling with an isolated Windows x64 dependency installation.

.DESCRIPTION
    Windows ARM64 hosts can leave ARM64 native optional dependencies in the
    repository node_modules directory. This wrapper keeps one deterministic
    x64 cache per project lockfile hash and never changes repository dependencies.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('playwright', 'vitest', 'vite', 'vite-node', 'wrangler')]
    [string] $Tool,

    [Parameter(Position = 1)]
    [string] $ProjectPath = '.',

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ToolArguments = @(),

    [switch] $NoInstall
)

$ErrorActionPreference = 'Stop'

if (-not [string]::IsNullOrWhiteSpace($env:CODEX_HARNESS_ARGUMENTS_B64)) {
    try {
        $argumentJson = [System.Text.Encoding]::UTF8.GetString(
            [Convert]::FromBase64String($env:CODEX_HARNESS_ARGUMENTS_B64)
        )
        $decodedArguments = ConvertFrom-Json -InputObject $argumentJson
        $ToolArguments = @()
        foreach ($argument in $decodedArguments) {
            $ToolArguments += [string] $argument
        }
    } catch {
        throw "x64 harness: invalid dispatcher arguments: $($_.Exception.Message)"
    }
}

function Fail([string] $Message) {
    throw "x64 harness: $Message"
}

function RequireNativeFile([string] $Path, [string] $Purpose) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Fail "$Purpose missing from x64 dependency cache: $Path. Remove only this cache entry and rerun bootstrap."
    }
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $repoRoot $ProjectPath)).Path
$repoUri = [Uri]($repoRoot.TrimEnd('\') + '\')
$projectUri = [Uri]($projectRoot.TrimEnd('\') + '\')
$relativeProjectPath = [Uri]::UnescapeDataString($repoUri.MakeRelativeUri($projectUri).ToString()).Replace('/', '\').TrimEnd('\')
if ([string]::IsNullOrWhiteSpace($relativeProjectPath)) {
    $relativeProjectPath = '.'
}
$packageJsonPath = Join-Path $projectRoot 'package.json'
$lockfilePath = Join-Path $projectRoot 'package-lock.json'

if ($relativeProjectPath -eq '..' -or $relativeProjectPath.StartsWith("..$([System.IO.Path]::DirectorySeparatorChar)")) {
    Fail "project must stay inside repository: $projectRoot"
}
if (-not (Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
    Fail "missing package.json in $projectRoot"
}
if (-not (Test-Path -LiteralPath $lockfilePath -PathType Leaf)) {
    Fail "missing package-lock.json in $projectRoot"
}

$configuredNode = $env:CODEX_X64_NODE
if ([string]::IsNullOrWhiteSpace($configuredNode)) {
    $configuredNode = Join-Path $env:USERPROFILE 'Tools\node-x64\node.exe'
}
$nodePath = (Resolve-Path -LiteralPath $configuredNode -ErrorAction SilentlyContinue).Path
if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    Fail "x64 Node not found. Install x64 Node or set CODEX_X64_NODE. Expected: $configuredNode"
}

$nodeArch = (& $nodePath -p "process.arch").Trim()
if ($nodeArch -ne 'x64') {
    Fail "configured Node reports process.arch=$nodeArch, expected x64: $nodePath"
}
$nodeVersion = (& $nodePath -p "process.version").Trim()
$nodeDirectory = Split-Path -Parent $nodePath
$env:Path = "$nodeDirectory;$env:Path"

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    Fail "npm.cmd not found after placing x64 Node first in PATH"
}
$npmPath = $npmCommand.Source

$lockHash = (Get-FileHash -LiteralPath $lockfilePath -Algorithm SHA256).Hash.ToLowerInvariant()
$cacheBase = if ([string]::IsNullOrWhiteSpace($env:CODEX_HARNESS_ROOT)) {
    Join-Path $env:LOCALAPPDATA 'codex-harness'
} else {
    $env:CODEX_HARNESS_ROOT
}
$cacheRoot = Join-Path (Join-Path $cacheBase 'win32-x64-v2') $lockHash
$markerPath = Join-Path $cacheRoot '.codex-x64-install.json'

$mutexName = "Local\CodexX64DependencyInstall_$lockHash"
$mutex = [System.Threading.Mutex]::new($false, $mutexName)
$mutexTaken = $false
try {
    $mutexTaken = $mutex.WaitOne([TimeSpan]::FromMinutes(30))
    if (-not $mutexTaken) {
        Fail "timed out waiting for dependency cache install lock: $mutexName"
    }

    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        if ($NoInstall) {
            Fail "cache missing for lockfile $lockHash and -NoInstall was supplied: $cacheRoot"
        }

        New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
        Copy-Item -LiteralPath $packageJsonPath -Destination (Join-Path $cacheRoot 'package.json') -Force
        Copy-Item -LiteralPath $lockfilePath -Destination (Join-Path $cacheRoot 'package-lock.json') -Force

        Push-Location $cacheRoot
        try {
            & $npmPath ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) {
                Fail "npm ci failed with exit code $LASTEXITCODE; cache: $cacheRoot"
            }
        } finally {
            Pop-Location
        }

        $marker = [ordered]@{
            architecture = 'x64'
            nodePath = $nodePath
            nodeVersion = $nodeVersion
            lockfile = $lockfilePath
            lockfileSha256 = $lockHash
            createdUtc = [DateTime]::UtcNow.ToString('o')
        }
        $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8
    }
} finally {
    if ($mutexTaken) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}

$entryPath = switch ($Tool) {
    'playwright' { Join-Path $cacheRoot 'node_modules\@playwright\test\cli.js' }
    'vitest' { Join-Path $cacheRoot 'node_modules\vitest\vitest.mjs' }
    'vite' { Join-Path $cacheRoot 'node_modules\vite\bin\vite.js' }
    'vite-node' { Join-Path $cacheRoot 'node_modules\vite-node\vite-node.mjs' }
    'wrangler' { Join-Path $cacheRoot 'node_modules\wrangler\bin\wrangler.js' }
}
if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) {
    Fail "$Tool entrypoint missing from isolated cache: $entryPath"
}

$esbuildPackage = Join-Path $cacheRoot 'node_modules\esbuild\package.json'
if (Test-Path -LiteralPath $esbuildPackage -PathType Leaf) {
    RequireNativeFile (Join-Path $cacheRoot 'node_modules\@esbuild\win32-x64\esbuild.exe') 'esbuild x64 binary'
}
$rolldownPackage = Join-Path $cacheRoot 'node_modules\rolldown\package.json'
if (Test-Path -LiteralPath $rolldownPackage -PathType Leaf) {
    $rolldownBinary = Get-ChildItem -LiteralPath (Join-Path $cacheRoot 'node_modules\@rolldown\binding-win32-x64-msvc') -Filter '*.node' -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $rolldownBinary) {
        Fail "Rolldown x64 native binding missing from dependency cache: $cacheRoot"
    }
}
$workerdPackage = Join-Path $cacheRoot 'node_modules\workerd\package.json'
if (Test-Path -LiteralPath $workerdPackage -PathType Leaf) {
    RequireNativeFile (Join-Path $cacheRoot 'node_modules\@cloudflare\workerd-windows-64\bin\workerd.exe') 'workerd x64 binary'
}

[Console]::Error.WriteLine("x64 harness: $Tool, Node $nodeVersion, cache $cacheRoot")
$workspaceRoot = Join-Path $cacheRoot 'workspace'
$executionRepositoryRoot = Join-Path $workspaceRoot 'repository'
$executionProjectRoot = if ($relativeProjectPath -eq '.') {
    $executionRepositoryRoot
} else {
    Join-Path $executionRepositoryRoot $relativeProjectPath
}
New-Item -ItemType Directory -Path $workspaceRoot -Force | Out-Null

$excludedDirectories = @(
    (Join-Path $repoRoot '.git'),
    (Join-Path $repoRoot 'node_modules')
)
if ($projectRoot -ne $repoRoot) {
    $excludedDirectories += Join-Path $projectRoot 'node_modules'
}
$robocopyArgs = @($repoRoot, $executionRepositoryRoot, '/MIR', '/XJ', '/R:2', '/W:1', '/XD') + $excludedDirectories
& robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -gt 7) {
    Fail "source mirror failed with robocopy exit code $LASTEXITCODE"
}

$executionNodeModules = Join-Path $workspaceRoot 'node_modules'
if (-not (Test-Path -LiteralPath $executionNodeModules)) {
    New-Item -ItemType Junction -Path $executionNodeModules -Target (Join-Path $cacheRoot 'node_modules') | Out-Null
} else {
    $nodeModulesItem = Get-Item -LiteralPath $executionNodeModules
    if ($nodeModulesItem.LinkType -ne 'Junction') {
        Fail "isolated workspace node_modules path is not a junction: $executionNodeModules"
    }
}

Push-Location $executionProjectRoot
try {
    & $nodePath $entryPath @ToolArguments
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
