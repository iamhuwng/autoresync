# Kahoot Project Cleanup Script
# Run this script to analyze and clean up the project

param(
    [switch]$Analyze,
    [switch]$Clean,
    [switch]$Deep,
    [switch]$Backup
)

$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectPath

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Kahoot Project Cleanup Utility" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Function to get folder size in MB
function Get-FolderSizeMB {
    param([string]$Path)
    if (Test-Path $Path) {
        $size = (Get-ChildItem -Path $Path -Recurse -File -ErrorAction SilentlyContinue | 
                 Measure-Object -Property Length -Sum).Sum / 1MB
        return [math]::Round($size, 2)
    }
    return 0
}

# ANALYZE MODE
if ($Analyze -or (-not $Clean -and -not $Deep)) {
    Write-Host "📊 Analyzing project size..." -ForegroundColor Yellow
    Write-Host ""
    
    # Overall project size
    $totalSize = Get-FolderSizeMB -Path "."
    Write-Host "Total Project Size: $totalSize MB" -ForegroundColor Cyan
    Write-Host ""
    
    # Folder breakdown
    Write-Host "📁 Folder Size Breakdown:" -ForegroundColor Yellow
    Write-Host ""
    
    Get-ChildItem -Directory | ForEach-Object {
        $size = Get-FolderSizeMB -Path $_.FullName
        $percentage = if ($totalSize -gt 0) { [math]::Round(($size / $totalSize) * 100, 1) } else { 0 }
        
        $color = "White"
        if ($size -gt 100) { $color = "Red" }
        elseif ($size -gt 50) { $color = "Yellow" }
        elseif ($size -gt 10) { $color = "Cyan" }
        
        Write-Host ("  {0,-30} {1,10} MB  ({2,5}%)" -f $_.Name, $size, $percentage) -ForegroundColor $color
    } | Sort-Object 'Size (MB)' -Descending
    
    Write-Host ""
    Write-Host "🔍 Cleanup Opportunities:" -ForegroundColor Yellow
    Write-Host ""
    
    # Check specific folders
    $distSize = Get-FolderSizeMB -Path ".\dist"
    $nodeModulesSize = Get-FolderSizeMB -Path ".\node_modules"
    $coverageSize = Get-FolderSizeMB -Path ".\coverage"
    $playwrightSize = Get-FolderSizeMB -Path ".\playwright-report"
    $testResultsSize = Get-FolderSizeMB -Path ".\test-results"
    
    if ($distSize -gt 0) {
        Write-Host "  ✓ dist/ (build artifacts): $distSize MB - Can be deleted" -ForegroundColor Green
    }
    
    if ($coverageSize -gt 0) {
        Write-Host "  ✓ coverage/ (test coverage): $coverageSize MB - Can be deleted" -ForegroundColor Green
    }
    
    if ($playwrightSize -gt 0) {
        Write-Host "  ✓ playwright-report/: $playwrightSize MB - Can be deleted" -ForegroundColor Green
    }
    
    if ($testResultsSize -gt 0) {
        Write-Host "  ✓ test-results/: $testResultsSize MB - Can be deleted" -ForegroundColor Green
    }
    
    if ($nodeModulesSize -gt 0) {
        Write-Host "  ⚠ node_modules/: $nodeModulesSize MB - Can reinstall with npm install" -ForegroundColor Yellow
    }
    
    $potentialSavings = $distSize + $coverageSize + $playwrightSize + $testResultsSize
    
    Write-Host ""
    Write-Host "💾 Potential Savings: $potentialSavings MB (Quick Clean)" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "Commands:" -ForegroundColor Yellow
    Write-Host "  .\cleanup.ps1 -Clean       # Quick clean (safe)" -ForegroundColor White
    Write-Host "  .\cleanup.ps1 -Deep        # Deep clean (removes node_modules)" -ForegroundColor White
    Write-Host "  .\cleanup.ps1 -Backup      # Create backup first" -ForegroundColor White
    Write-Host ""
}

# BACKUP MODE
if ($Backup) {
    Write-Host "💾 Creating backup..." -ForegroundColor Yellow
    
    $date = Get-Date -Format "yyyy-MM-dd-HHmmss"
    $backupPath = Join-Path (Split-Path -Parent $projectPath) "kahoot-backup-$date"
    
    Write-Host "  Backing up to: $backupPath" -ForegroundColor Cyan
    
    # Copy excluding large folders
    robocopy $projectPath $backupPath /E /XD node_modules dist coverage playwright-report test-results .git /NFL /NDL /NJH /NJS
    
    Write-Host "✓ Backup completed!" -ForegroundColor Green
    Write-Host ""
}

# CLEAN MODE (Quick)
if ($Clean) {
    Write-Host "🧹 Running quick cleanup..." -ForegroundColor Yellow
    Write-Host ""
    
    $cleaned = 0
    
    # Remove dist
    if (Test-Path ".\dist") {
        $size = Get-FolderSizeMB -Path ".\dist"
        Remove-Item -Path ".\dist" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed dist/ ($size MB)" -ForegroundColor Green
        $cleaned += $size
    }
    
    # Remove coverage
    if (Test-Path ".\coverage") {
        $size = Get-FolderSizeMB -Path ".\coverage"
        Remove-Item -Path ".\coverage" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed coverage/ ($size MB)" -ForegroundColor Green
        $cleaned += $size
    }
    
    # Remove playwright-report
    if (Test-Path ".\playwright-report") {
        $size = Get-FolderSizeMB -Path ".\playwright-report"
        Remove-Item -Path ".\playwright-report" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed playwright-report/ ($size MB)" -ForegroundColor Green
        $cleaned += $size
    }
    
    # Remove test-results
    if (Test-Path ".\test-results") {
        $size = Get-FolderSizeMB -Path ".\test-results"
        Remove-Item -Path ".\test-results" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed test-results/ ($size MB)" -ForegroundColor Green
        $cleaned += $size
    }
    
    # Remove report.json
    if (Test-Path ".\report.json") {
        Remove-Item -Path ".\report.json" -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed report.json" -ForegroundColor Green
    }
    
    # Remove Vite cache
    if (Test-Path ".\node_modules\.vite") {
        $size = Get-FolderSizeMB -Path ".\node_modules\.vite"
        Remove-Item -Path ".\node_modules\.vite" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed .vite cache ($size MB)" -ForegroundColor Green
        $cleaned += $size
    }
    
    Write-Host ""
    Write-Host "✨ Cleaned up $cleaned MB!" -ForegroundColor Green
    Write-Host ""
}

# DEEP CLEAN MODE
if ($Deep) {
    Write-Host "🔥 Running deep cleanup..." -ForegroundColor Yellow
    Write-Host ""
    
    # Run quick clean first
    if (Test-Path ".\dist") {
        Remove-Item -Path ".\dist" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed dist/" -ForegroundColor Green
    }
    
    if (Test-Path ".\coverage") {
        Remove-Item -Path ".\coverage" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed coverage/" -ForegroundColor Green
    }
    
    if (Test-Path ".\playwright-report") {
        Remove-Item -Path ".\playwright-report" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed playwright-report/" -ForegroundColor Green
    }
    
    if (Test-Path ".\test-results") {
        Remove-Item -Path ".\test-results" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed test-results/" -ForegroundColor Green
    }
    
    # Clean npm cache
    Write-Host "  🔄 Cleaning npm cache..." -ForegroundColor Cyan
    npm cache clean --force 2>$null
    Write-Host "  ✓ npm cache cleaned" -ForegroundColor Green
    
    # Remove node_modules
    if (Test-Path ".\node_modules") {
        $size = Get-FolderSizeMB -Path ".\node_modules"
        Write-Host "  🔄 Removing node_modules/ ($size MB)..." -ForegroundColor Cyan
        Remove-Item -Path ".\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed node_modules/" -ForegroundColor Green
    }
    
    # Remove package-lock.json
    if (Test-Path ".\package-lock.json") {
        Remove-Item -Path ".\package-lock.json" -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Removed package-lock.json" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "  🔄 Reinstalling dependencies..." -ForegroundColor Cyan
    npm install
    
    Write-Host ""
    Write-Host "✨ Deep clean completed!" -ForegroundColor Green
    Write-Host ""
}

# Final size report
if ($Clean -or $Deep) {
    Write-Host "📊 Final Size Report:" -ForegroundColor Yellow
    Write-Host ""
    
    Get-ChildItem -Directory | ForEach-Object {
        $size = Get-FolderSizeMB -Path $_.FullName
        if ($size -gt 0) {
            Write-Host ("  {0,-30} {1,10} MB" -f $_.Name, $size) -ForegroundColor Cyan
        }
    }
    
    Write-Host ""
    $finalTotal = Get-FolderSizeMB -Path "."
    Write-Host "Total Project Size: $finalTotal MB" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "Done! ✓" -ForegroundColor Green
