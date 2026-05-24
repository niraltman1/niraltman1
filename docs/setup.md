# Factum IL Setup Guide

## System Requirements

| Requirement | Minimum |
|-------------|---------|
| OS          | Windows 10 (build 19041+) or Windows 11 |
| CPU         | x64 or ARM64 |
| RAM         | 8 GB (16 GB recommended for AI model) |
| Disk        | 10 GB free (model ~4 GB, documents variable) |
| PowerShell  | 5.1 or 7+ |
| Node.js     | 20 LTS or higher |
| Internet    | Required during initial install only |

## Fresh Installation

1. Open **PowerShell as Administrator**
2. Navigate to the `factum-il/apps/installer` directory
3. Run:

```powershell
.\START-HERE.ps1
```

The installer will:
- Verify administrator privileges and Windows version
- Install Tesseract OCR (with Hebrew language data)
- Install Ghostscript
- Install Ollama
- Install Node.js LTS
- Install pnpm
- Pull the `law-il-E2B` AI model
- Initialise the SQLite database with all migrations
- Run smoke tests
- Launch the dashboard at `http://localhost:5173`

## Repair Mode

Run if a component is missing or broken after the initial install:

```powershell
.\START-HERE.ps1 -Mode Repair
```

## Upgrade Mode

Updates all components to their latest supported versions:

```powershell
.\START-HERE.ps1 -Mode Upgrade
```

## Custom Install Path

```powershell
.\START-HERE.ps1 -InstallPath "D:\FactumIL"
```

## Skip AI Model Pull (Air-Gapped)

If the Ollama model is pre-placed in the models directory:

```powershell
.\START-HERE.ps1 -SkipModelPull
```

## Starting the Dashboard Manually

```powershell
cd factum-il/apps/dashboard
pnpm install    # first time only
pnpm dev
```

Open `http://localhost:5173` in a WebView2-compatible browser.

## Directory Layout After Install

```
%LOCALAPPDATA%\FactumIL\
 ├── data\factum-il.db      SQLite database
 ├── logs\                 Application logs (JSONL format)
 ├── manifests\            Manifest snapshots
 ├── storage\              Normalised document storage
 └── temp\                 Temporary processing workspace
```

## Running Tests

**PowerShell (Pester):**
```powershell
Install-Module Pester -Force -SkipPublisherCheck
Invoke-Pester ./tests/powershell/FactumIL.Tests.ps1 -Output Detailed
```

**TypeScript (Vitest):**
```powershell
cd factum-il
pnpm install
pnpm test
```

## Troubleshooting

| Problem | Resolution |
|---------|------------|
| `winget` not found | Install App Installer from Microsoft Store |
| Tesseract Hebrew data missing | Run `.\START-HERE.ps1 -Mode Repair` |
| Ollama model not available | Ensure internet connection; run Repair mode |
| Dashboard port 5173 in use | Close the conflicting process or change port in `vite.config.ts` |
| SQLite `FOREIGN_KEYS` error | Ensure all migrations have been applied |
