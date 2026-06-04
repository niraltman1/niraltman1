# Factum-IL Setup Guide — v1.0.0

## System Requirements

| Requirement | Minimum |
|-------------|---------|
| OS          | Windows 10 (build 19041+) or Windows 11 |
| CPU         | x64 |
| RAM         | 16 GB recommended (8 GB minimum, AI model requires ~4 GB) |
| Disk        | 20 GB free (model ~4 GB, sqlite-vec, documents variable) |
| PowerShell  | 5.1 (BOM-encoded scripts required) |
| Node.js     | 20 LTS or higher |
| Internet    | Required during initial install only |
| WebView2    | Installed automatically by the Inno Setup installer |

---

## Installer Overview (Inno Setup 6 — 12-Step Staging)

The production installer is built with Inno Setup 6 via `publish.ps1`. Installation proceeds through 12 stages:

| Step | Action |
|------|--------|
| 1  | Verify administrator privileges and Windows version |
| 2  | Install WebView2 runtime (if absent) |
| 3  | Install Node.js LTS via winget |
| 4  | Install pnpm |
| 5  | Install Tesseract OCR with Hebrew language data (`heb.traineddata`) |
| 6  | Install Ghostscript |
| 7  | Install Ollama |
| 8  | Pull the Law-IL E2B AI model |
| 9  | Copy `sqlite-vec.dll` to `{app}\tools\` |
| 10 | Initialise the SQLite database (runs all 60 migrations automatically) |
| 11 | Write 8 registry environment variables (see below) |
| 12 | Run smoke tests and launch the dashboard |

### Registry Environment Variables (written by installer)

| Variable | Default value written |
|----------|-----------------------|
| `FACTUM_IL_ROOT` | `{app}` (the install directory) |
| `WHISPER_EXE` | `{app}\tools\whisper-fast.exe` |
| `FFMPEG_EXE` | `{app}\tools\ffmpeg.exe` |
| `OLLAMA_MODEL` | `BrainboxAI/law-il-E2B:Q4_K_M` |
| `AI_TIER` | `local` |
| `SQLITE_VEC_PATH` | `{app}\tools\sqlite-vec.dll` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` |
| `FACTUM_IL_VERSION` | `1.0.0` |

---

## AI Model

The system uses **one model only** — `BrainboxAI/law-il-E2B:Q4_K_M`.

```powershell
# Pull the model (internet required, one-time)
ollama pull hf.co/BrainboxAI/law-il-E2B:Q4_K_M
```

**Never substitute another model.** The installer performs this pull automatically. For air-gapped environments, pre-place the model files before running the installer with `-SkipModelPull`.

---

## sqlite-vec Extension

The installer bundles `sqlite-vec.dll` in `{app}\tools\`. This native SQLite extension enables:
- KNN vector search (`vec_chunks` table, migration 052)
- Hybrid FTS5 + semantic search

The `SQLITE_VEC_PATH` registry variable tells the API server where to load the extension from. If the extension is absent, the server falls back to JavaScript-only search.

---

## All 25 Environment Variables

| Variable | Purpose |
|----------|---------|
| `PORT` | API server port (default 3001) |
| `FACTUM_IL_DB_PATH` | Path to primary SQLite database |
| `FACTUM_IL_ROOT` | Application install root |
| `FACTUM_IL_DATA_PATH` | Path to secondary data DB (`_data.db`) |
| `FACTUM_IL_VERSION` | Current version string (read by update checker) |
| `FACTUM_IL_SAFE_MODE` | Set `1` to disable all 6 background workers |
| `OLLAMA_MODEL` | AI model name (must be `BrainboxAI/law-il-E2B:Q4_K_M`) |
| `OLLAMA_BASE_URL` | Ollama server URL (`http://127.0.0.1:11434`) |
| `WHISPER_EXE` | Absolute path to whisper-fast.exe |
| `FFMPEG_EXE` | Absolute path or PATH name for ffmpeg |
| `WHISPER_MODEL` | Whisper model size: tiny / base / small / medium / large |
| `SQLITE_VEC_PATH` | Absolute path to sqlite-vec.dll |
| `BACKUP_ENCRYPT` | Set `1` to enable AES-256-GCM encrypted backups |
| `BACKUP_ENCRYPT_KEY` | 64-char hex key for backup encryption |
| `AI_TIER` | `local` (only valid value) |
| `RAG_INTERVAL_MS` | RAG worker polling interval (default 60000) |
| `RAG_BATCH_SIZE` | Documents per RAG cycle (default 10) |
| `FACTUM_IL_ADMIN_PASS` | Admin password (set on first run) |
| `NODE_ENV` | `production` or `development` |
| `ACADEMIC_ROOT` | Semicolon-separated paths for Academic Hub bypass |
| `EVIDENCE_AUTO_LOCK` | Set `1` to auto-lock ingested files to Evidence Locker |
| `GMAIL_ENABLED` | Set `1` to enable Gmail Bridge |
| `GMAIL_CLIENT_ID` | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret |
| `GMAIL_REDIRECT_URI` | OAuth redirect URI |

---

## Database: Two-File Architecture

| File | Purpose |
|------|---------|
| `factum-il.db` | Primary database — all entity tables, FTS5 indexes, queue, audit |
| `_data.db` | Chunks and embeddings — attached as `data_store` schema |

**60 migrations** (001–060) run automatically on first server start. Each runs exactly once, tracked in `_migrations` (SHA-256 checksum per migration). Migrations are forward-only — never edited after commit.

---

## Repair Mode

```powershell
.\START-HERE.ps1 -Mode Repair
```

Use if a component is missing or broken after the initial install. Repair mode re-runs only failed steps.

## Upgrade Mode

```powershell
.\START-HERE.ps1 -Mode Upgrade
```

Updates all components to their latest supported versions.

## Custom Install Path

```powershell
.\START-HERE.ps1 -InstallPath "D:\FactumIL"
```

## Skip AI Model Pull (Air-Gapped)

```powershell
.\START-HERE.ps1 -SkipModelPull
```

---

## First-Run Checklist

After the installer completes, verify these items before going live:

- [ ] Ollama is running: open `http://127.0.0.1:11434/api/tags` — should return model list
- [ ] `BrainboxAI/law-il-E2B:Q4_K_M` appears in the model list
- [ ] Dashboard loads at `http://localhost:5173` with Hebrew RTL layout
- [ ] `SQLITE_VEC_PATH` registry value points to an existing `sqlite-vec.dll`
- [ ] All 60 migrations show as applied in `/api/admin/repair/manifest`
- [ ] Run `POST /api/admin/repair/integrity` — response should be `{ ok: true }`
- [ ] Set admin password via `FACTUM_IL_ADMIN_PASS` env var or `/api/auth/change-password`
- [ ] If using Gmail Bridge: set `GMAIL_ENABLED=1` and configure OAuth credentials

---

## Starting the Dashboard Manually

```powershell
cd factum-il\apps\dashboard
pnpm install    # first time only
pnpm dev
```

Open `http://localhost:5173` in Edge or any WebView2-compatible browser.

---

## Directory Layout After Install

```
{app}\                            Install root (FACTUM_IL_ROOT)
 ├── tools\
 │    ├── sqlite-vec.dll          Vector search extension
 │    ├── whisper-fast.exe        Hebrew speech-to-text
 │    └── ffmpeg.exe              Audio conversion
 ├── _data\
 │    ├── factum-il.db            Primary SQLite database
 │    └── _data.db                Chunks and embeddings database
 ├── logs\                        Application logs (JSONL, PII-sanitised)
 ├── backups\                     AES-256-GCM encrypted hourly backups
 ├── manifests\                   Manifest snapshots
 ├── storage\                     Normalised document storage
 └── temp\                        Temporary processing workspace
```

---

## Runtime Dependencies

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20 LTS | API server + dashboard build |
| pnpm | 9.x | Package manager |
| Ollama | latest | Local AI inference |
| Tesseract OCR | 5.x | Image → searchable text |
| Ghostscript | 10+ | PDF rasterisation |
| ffmpeg | 6.x | Audio format conversion |
| whisper-fast.exe | any | Hebrew speech-to-text |
| sqlite-vec.dll | bundled | KNN vector search extension |

---

## Running Tests

**TypeScript (Vitest):**
```powershell
cd factum-il
pnpm install
pnpm test
```

**PowerShell (Pester):**
```powershell
Install-Module Pester -Force -SkipPublisherCheck
Invoke-Pester ./tests/powershell/FactumIL.Tests.ps1 -Output Detailed
```

---

## Troubleshooting

| Problem | Resolution |
|---------|------------|
| `winget` not found | Install App Installer from Microsoft Store |
| Tesseract Hebrew data missing | Run `.\START-HERE.ps1 -Mode Repair` |
| Ollama model not available | Ensure internet; run Repair mode |
| Dashboard port 5173 in use | Close conflicting process or change port in `vite.config.ts` |
| SQLite `FOREIGN_KEYS` error | Ensure all 60 migrations have been applied |
| `sqlite-vec.dll` not found | Check `SQLITE_VEC_PATH` registry value; reinstall if absent |
| WebView2 not found | Installer links to Microsoft WebView2 installer |
| Hebrew text garbled in logs | Ensure UTF-8 encoding everywhere; never use Windows-1255 |
| Ollama health check fails | Verify `http://127.0.0.1:11434/api/tags` returns 200 |
| Worker not starting | Check `FACTUM_IL_SAFE_MODE` — set to `0` to re-enable workers |
