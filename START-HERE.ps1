# START-HERE.ps1 - Factum IL Installer
# Note: This file must be saved in UTF-8 with BOM encoding to support Hebrew characters correctly in PowerShell.

[CmdletBinding(SupportsShouldProcess=$true)]
param()

# --- 1. UAC Elevation ---
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    if ([System.Environment]::OSVersion.Version.Major -ge 6) {
        $arguments = "& '" + (Get-Item -LiteralPath $MyInvocation.MyCommand.Path).FullName + "'"
        Start-Process PowerShell -Verb RunAs -ArgumentList $arguments
        exit
    }
}

Write-Host "Administrator privileges confirmed. Starting Factum IL installation..."

# ─── Process Purge & Port Clearance ──────────────────────────────────────────
Write-Host 'Cleaning up stale processes...'

@('node','FactumIL.Desktop','vite','tsc') | ForEach-Object {
  Stop-Process -Name $_ -Force -ErrorAction SilentlyContinue
}

foreach ($port in @(3001, 5173)) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

$dbDir = Join-Path 'C:\אלטמן משרד עורכי דין - סדר 2026' '_Data'
foreach ($ext in @('-wal', '-shm')) {
  $f = Join-Path $dbDir "factum-il.db$ext"
  if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
}

Write-Host 'Port 3001/5173 cleared.'
# ─────────────────────────────────────────────────────────────────────────────

# --- Helper Function for Idempotent Winget Installation ---
function Install-WingetPackage {
    param (
        [string]$PackageId,
        [string]$PackageName
    )
    Write-Host "Checking for $PackageName ($PackageId)..."
    try {
        $installed = winget list --id $PackageId | Select-String -Pattern $PackageId
        if (-not $installed) {
            Write-Host "Installing $PackageName ($PackageId) via Winget..."
            winget install --id $PackageId --silent --accept-package-agreements --accept-source-agreements
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Failed to install $PackageName ($PackageId). Winget exit code: $LASTEXITCODE"
            }
        } else {
            Write-Host "$PackageName ($PackageId) is already installed."
        }
    }
    catch {
        Write-Warning "Error checking/installing $PackageName ($PackageId): $($_.Exception.Message)"
    }
}

# --- 2. System Dependencies (via Winget) ---
Install-WingetPackage -PackageId "OpenJS.NodeJS.LTS" -PackageName "Node.js LTS"
Install-WingetPackage -PackageId "Git.Git" -PackageName "Git"
Install-WingetPackage -PackageId "UB-Mannheim.Tesseract" -PackageName "Tesseract OCR"
Install-WingetPackage -PackageId "ArtifexSoftware.Ghostscript" -PackageName "Ghostscript"
Install-WingetPackage -PackageId "Ollama.Ollama" -PackageName "Ollama AI Engine"

# --- 3. Environment Refreshes (PATH) ---
Write-Host "Refreshing system PATH..."
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::Machine) + ";" + [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::User)
[System.Environment]::SetEnvironmentVariable("Path", $env:Path, [System.EnvironmentVariableTarget]::Process)

# --- 4. Office Directory Guard ---
# Using a hex-encoded string or base64 could be safer, but UTF-8 with BOM usually works.
# Let's define the path carefully.
$officeDirName = "אלטמן משרד עורכי דין - סדר 2026"
$officeDir = Join-Path -Path "C:\" -ChildPath $officeDirName

Write-Host "Ensuring office directory exists: $officeDir..."
if (-not (Test-Path -LiteralPath $officeDir)) {
    New-Item -ItemType Directory -Path $officeDir -Force | Out-Null
    Write-Host "Created directory: $officeDir"
} else {
    Write-Host "Directory already exists: $officeDir"
}

# --- 5. AI Model Pipeline ---
Write-Host "Configuring Ollama AI models..."

try {
    # Check if ollama is in path
    if (Get-Command ollama -ErrorAction SilentlyContinue) {
        Write-Host "Pulling Ollama model BrainboxAI/law-il-E2B:Q4_K_M (Israeli legal model)..."
        ollama pull BrainboxAI/law-il-E2B:Q4_K_M

        Write-Host "Ollama configuration complete."
    } else {
        Write-Warning "Ollama command not found. Please ensure it's installed and in PATH."
    }
} catch {
    Write-Warning "Error during AI model configuration: $($_.Exception.Message)"
}

# --- 5b. Node.js Major-Version Assertion ---
Write-Host "Verifying Node.js version requirement (>= 20)..."
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = (node --version).TrimStart('v')
    $nodeMajor   = [int]($nodeVersion -split '\.')[0]
    if ($nodeMajor -lt 20) {
        Write-Error "Factum IL requires Node.js >= 20. Detected: v$nodeVersion"
        Write-Host "Download the LTS release from https://nodejs.org and re-run this script."
        exit 1
    }
    Write-Host "Node.js v$nodeVersion — OK"
} else {
    Write-Warning "Node.js not found in PATH. Ensure the Winget installation above completed and re-run this script."
    exit 1
}

# --- 6. Project Build Integration ---
Write-Host "Setting up project dependencies and building..."
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = $scriptDir # Assuming script is at root

if (Test-Path (Join-Path $projectRoot "package.json")) {
    # Check for pnpm, install if missing
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Host "pnpm not found. Installing globally via npm..."
        npm install -g pnpm
    }

    Write-Host "Running pnpm install..."
    pnpm install
    
    Write-Host "Running pnpm build..."
    pnpm build
} else {
    Write-Warning "Project package.json not found in $projectRoot. Skipping build."
}

# --- 7. Desktop Shortcut Generation ---
Write-Host "Generating Desktop Shortcut for Factum IL..."
try {
    $shell = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path ([System.Environment]::GetFolderPath('Desktop')) "Factum IL.lnk"
    $targetPath = Join-Path $projectRoot "apps\FactumIL.Desktop\bin\Release\net8.0-windows\FactumIL.Desktop.exe"

    if (Test-Path $targetPath) {
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $targetPath
        $shortcut.Description = "Factum IL Desktop Application"
        $shortcut.Save()
        Write-Host "Desktop shortcut created at $shortcutPath"
    } else {
        Write-Warning "Compiled executable not found at $targetPath. Cannot create shortcut."
    }
} catch {
    Write-Warning "Failed to create desktop shortcut: $($_.Exception.Message)"
}

# --- 8. Auto-Launch ---
if (Test-Path $targetPath) {
    Write-Host "Launching Factum IL Desktop Application..."
    Start-Process -FilePath $targetPath
}

Write-Host "Factum IL installation and launch complete!"
