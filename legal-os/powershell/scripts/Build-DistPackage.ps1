<#
.SYNOPSIS
  Stages the dist-package/ folder for Inno Setup compilation.
  Run from the repo root: .\powershell\scripts\Build-DistPackage.ps1

.NOTES
  Prerequisites on the build machine:
    - Node.js 20+  (pnpm available)
    - .NET 8 SDK   (dotnet CLI)
    - Inno Setup 6 (ISCC.exe in PATH or C:\Program Files (x86)\Inno Setup 6\)
#>
param(
  [switch]$SkipNodeBuild,
  [switch]$SkipDotNetBuild,
  [switch]$SkipIscc,
  [string]$OllamaSetupUrl = 'https://ollama.com/download/OllamaSetup.exe',
  [string]$WhisperUrl     = 'https://github.com/Const-me/Whisper/releases/latest/download/whisper-fast.exe',
  [string]$FfmpegUrl      = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
)

$Root  = Resolve-Path "$PSScriptRoot\..\.."
$Dist  = Join-Path $Root 'dist-package'

Write-Host "`n=== Legal-OS V13 — Build & Stage ===" -ForegroundColor Cyan
Write-Host "Root : $Root"
Write-Host "Dist : $Dist`n"

# ── 0. Clean dist-package ────────────────────────────────────────────────────
if (Test-Path $Dist) { Remove-Item $Dist -Recurse -Force }
New-Item -ItemType Directory -Force $Dist | Out-Null
foreach ($sub in 'app','wrapper','tools','scripts') {
  New-Item -ItemType Directory -Force (Join-Path $Dist $sub) | Out-Null
}

# ── 1. Node.js build ─────────────────────────────────────────────────────────
if (-not $SkipNodeBuild) {
  Write-Host '[1/5] Building Node.js API + Dashboard...' -ForegroundColor Yellow
  Push-Location $Root
  pnpm install --frozen-lockfile
  pnpm --filter '@legal-os/api' build
  pnpm --filter 'dashboard' build
  Pop-Location
}

# Copy API dist
$ApiSrc = Join-Path $Root 'packages\api\dist'
Copy-Item "$ApiSrc\*"  (Join-Path $Dist 'app\api\dist') -Recurse -Force
Copy-Item (Join-Path $Root 'packages\api\package.json') (Join-Path $Dist 'app\api') -Force

# Copy dashboard dist (served as static by API in production)
$DashSrc = Join-Path $Root 'apps\dashboard\dist'
Copy-Item "$DashSrc\*" (Join-Path $Dist 'app\dashboard\dist') -Recurse -Force

# Copy database package (needed at runtime)
Copy-Item (Join-Path $Root 'packages\database') (Join-Path $Dist 'app\packages\database') -Recurse -Force

# Copy migrations
Copy-Item (Join-Path $Root 'migrations') (Join-Path $Dist 'app\migrations') -Recurse -Force

# node_modules (production only)
Write-Host '  Pruning devDependencies from node_modules...' -ForegroundColor Gray
$NmSrc = Join-Path $Root 'node_modules'
Push-Location $Root
pnpm deploy --filter '@legal-os/api' --prod (Join-Path $Dist 'app\node_modules_deploy')
Pop-Location
# Copy pruned node_modules
if (Test-Path (Join-Path $Dist 'app\node_modules_deploy\node_modules')) {
  Move-Item (Join-Path $Dist 'app\node_modules_deploy\node_modules') (Join-Path $Dist 'app\node_modules')
}
Remove-Item (Join-Path $Dist 'app\node_modules_deploy') -Recurse -Force -ErrorAction SilentlyContinue

# ── 2. C# WPF Wrapper build ──────────────────────────────────────────────────
if (-not $SkipDotNetBuild) {
  Write-Host '[2/5] Building C# WPF Wrapper...' -ForegroundColor Yellow
  $CsprojDir = Join-Path $Root 'LegalOS.Desktop'
  dotnet publish "$CsprojDir\LegalOS.Desktop.csproj" `
    -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=false `
    -o (Join-Path $Dist 'wrapper')
  if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }
}

# ── 3. Download tools ────────────────────────────────────────────────────────
Write-Host '[3/5] Downloading tools...' -ForegroundColor Yellow
$ToolsDir = Join-Path $Dist 'tools'

function Download-IfMissing([string]$Url, [string]$Dest, [string]$Label) {
  if (Test-Path $Dest) { Write-Host "  $Label already present — skipped." -ForegroundColor Gray; return }
  Write-Host "  Downloading $Label..." -ForegroundColor Gray
  Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
}

Download-IfMissing $WhisperUrl     (Join-Path $ToolsDir 'whisper-fast.exe') 'whisper-fast.exe'
Download-IfMissing $OllamaSetupUrl (Join-Path $ToolsDir 'OllamaSetup.exe') 'OllamaSetup.exe'

# FFmpeg: download zip, extract ffmpeg.exe
$FfmpegZip = Join-Path $ToolsDir 'ffmpeg.zip'
$FfmpegExe = Join-Path $ToolsDir 'ffmpeg.exe'
if (-not (Test-Path $FfmpegExe)) {
  Download-IfMissing $FfmpegUrl $FfmpegZip 'ffmpeg.zip'
  $FfmpegExpand = Join-Path $ToolsDir 'ffmpeg_extracted'
  Expand-Archive $FfmpegZip $FfmpegExpand -Force
  $FfmpegBin = Get-ChildItem $FfmpegExpand -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
  if ($FfmpegBin) { Copy-Item $FfmpegBin.FullName $FfmpegExe -Force }
  Remove-Item $FfmpegExpand -Recurse -Force
  Remove-Item $FfmpegZip -Force
}

# .NET 8 silent install helper script (used by Inno Setup [Run] section)
$DotNetScript = Join-Path $Dist 'scripts\Install-DotNet8.ps1'
@'
$url = 'https://dotnet.microsoft.com/download/dotnet/thank-you/runtime-desktop-8.0.0-windows-x64-installer'
$tmp = "$env:TEMP\dotnet8-desktop.exe"
Invoke-WebRequest $url -OutFile $tmp -UseBasicParsing
Start-Process $tmp -ArgumentList '/install /quiet /norestart' -Wait
Remove-Item $tmp -Force
'@ | Set-Content $DotNetScript

# ── 4. Copy PowerShell scripts ───────────────────────────────────────────────
Write-Host '[4/5] Copying PowerShell scripts...' -ForegroundColor Yellow
$ScriptsSrc = Join-Path $Root 'powershell\scripts'
Copy-Item "$ScriptsSrc\*" (Join-Path $Dist 'scripts') -Recurse -Force
Copy-Item (Join-Path $Root 'apps\installer\START-HERE.ps1') (Join-Path $Dist 'scripts') -Force
Copy-Item (Join-Path $Root 'Modelfile')       (Join-Path $Dist 'scripts') -Force
Copy-Item (Join-Path $Root 'Modelfile.gemma2') (Join-Path $Dist 'scripts') -Force

# ── 5. Compile with Inno Setup ───────────────────────────────────────────────
if (-not $SkipIscc) {
  Write-Host '[5/5] Compiling Inno Setup installer...' -ForegroundColor Yellow
  $IsccPaths = @(
    'ISCC.exe',
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe'
  )
  $Iscc = $IsccPaths | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue } | Select-Object -First 1
  if (-not $Iscc) { throw 'ISCC.exe not found. Install Inno Setup 6 from https://jrsoftware.org/isdl.php' }

  Push-Location $Root
  & $Iscc 'installer.iss'
  if ($LASTEXITCODE -ne 0) { throw 'ISCC failed' }
  Pop-Location

  $Exe = Join-Path $Dist 'LegalOS_V13_Installer.exe'
  $Size = [math]::Round((Get-Item $Exe).Length / 1MB, 1)
  Write-Host "`n✅ LegalOS_V13_Installer.exe — ${Size} MB" -ForegroundColor Green
} else {
  Write-Host '[5/5] Skipped ISCC (run manually: ISCC.exe installer.iss)' -ForegroundColor Gray
}

Write-Host "`n=== Staging complete ===" -ForegroundColor Cyan
Write-Host "dist-package layout:"
Get-ChildItem $Dist | ForEach-Object { Write-Host "  $($_.Name)" }
