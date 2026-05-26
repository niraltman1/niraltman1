#!/usr/bin/env tsx
/**
 * scripts/scaffold-portable.ts
 * Creates dist/factum-il-portable/ directory structure for portable runtime bundle.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT     = new URL('..', import.meta.url).pathname;
const DIST_DIR = join(ROOT, 'dist', 'factum-il-portable');

const DIRS = [
  'runtime',
  'database',
  'models',
  'logs',
  'uploads',
  'temp',
  'config',
  'scripts',
];

for (const d of DIRS) {
  mkdirSync(join(DIST_DIR, d), { recursive: true });
}

// VERSION
writeFileSync(join(DIST_DIR, 'VERSION'), 'v1.0.0\n', 'utf-8');

// .env.example
writeFileSync(
  join(DIST_DIR, 'config', '.env.example'),
  [
    '# Factum-IL portable runtime environment variables',
    '# Copy this file to .env and fill in your values',
    '',
    '# Server port (default: 3001)',
    'PORT=3001',
    '',
    '# Ollama server URL (default: http://localhost:11434)',
    'OLLAMA_BASE_URL=http://localhost:11434',
    '',
    '# Ollama model — DO NOT CHANGE (Israeli law-specific model)',
    'OLLAMA_MODEL=BrainboxAI/law-il-E2B:Q4_K_M',
    '',
    '# Database path (default: ./database/factum-il.db)',
    'FACTUM_IL_DB_PATH=./database/factum-il.db',
    '',
    '# Data directory for logs, uploads, temp',
    'FACTUM_IL_DATA_PATH=.',
    '',
    '# Node environment',
    'NODE_ENV=production',
    '',
    '# Session TTL in hours (default: 8)',
    'SESSION_TTL_HOURS=8',
    '',
    '# Whisper executable path (optional, for audio transcription)',
    '# WHISPER_EXE=C:\\tools\\whisper-fast.exe',
    '',
    '# FFmpeg executable path (optional, for audio processing)',
    '# FFMPEG_EXE=C:\\tools\\ffmpeg.exe',
    '',
    '# Backup encryption key (optional)',
    '# BACKUP_ENCRYPT_KEY=your-secret-key',
  ].join('\n'),
  'utf-8',
);

// start.sh (Linux/macOS)
writeFileSync(
  join(DIST_DIR, 'start.sh'),
  [
    '#!/usr/bin/env bash',
    'set -e',
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    '',
    '# Load .env if it exists',
    'if [ -f "$SCRIPT_DIR/config/.env" ]; then',
    '  export $(grep -v "^#" "$SCRIPT_DIR/config/.env" | xargs)',
    'fi',
    '',
    '# Create required directories',
    'mkdir -p "$SCRIPT_DIR/database" "$SCRIPT_DIR/logs" "$SCRIPT_DIR/uploads" "$SCRIPT_DIR/temp"',
    '',
    '# Run healthcheck',
    'if [ -f "$SCRIPT_DIR/scripts/healthcheck.js" ]; then',
    '  node "$SCRIPT_DIR/scripts/healthcheck.js" || true',
    'fi',
    '',
    '# Start API server',
    'FACTUM_IL_DATA_PATH="$SCRIPT_DIR" \\',
    '  FACTUM_IL_DB_PATH="$SCRIPT_DIR/database/factum-il.db" \\',
    '  FACTUM_IL_ROOT="$SCRIPT_DIR" \\',
    '  node "$SCRIPT_DIR/runtime/start.js"',
  ].join('\n'),
  'utf-8',
);

// start.bat (Windows)
writeFileSync(
  join(DIST_DIR, 'start.bat'),
  [
    '@echo off',
    'setlocal',
    '',
    'set SCRIPT_DIR=%~dp0',
    '',
    'rem Load .env if it exists',
    'if exist "%SCRIPT_DIR%config\\.env" (',
    '  for /f "usebackq tokens=1,* delims==" %%a in ("%SCRIPT_DIR%config\\.env") do (',
    '    if not "%%a"=="" if not "%%a:~0,1%"=="#" set "%%a=%%b"',
    '  )',
    ')',
    '',
    'rem Create required directories',
    'if not exist "%SCRIPT_DIR%database" mkdir "%SCRIPT_DIR%database"',
    'if not exist "%SCRIPT_DIR%logs"     mkdir "%SCRIPT_DIR%logs"',
    'if not exist "%SCRIPT_DIR%uploads"  mkdir "%SCRIPT_DIR%uploads"',
    'if not exist "%SCRIPT_DIR%temp"     mkdir "%SCRIPT_DIR%temp"',
    '',
    'rem Start API server',
    'set FACTUM_IL_DATA_PATH=%SCRIPT_DIR%',
    'set FACTUM_IL_DB_PATH=%SCRIPT_DIR%database\\factum-il.db',
    'set FACTUM_IL_ROOT=%SCRIPT_DIR%',
    '',
    'node "%SCRIPT_DIR%runtime\\start.js"',
    'endlocal',
  ].join('\r\n'),
  'utf-8',
);

// README.md (Hebrew-first)
writeFileSync(
  join(DIST_DIR, 'README.md'),
  [
    '# Factum-IL — מדריך הפעלה מהיר',
    '',
    '## הפעלה ראשונה',
    '',
    '### Windows',
    '```',
    'start.bat',
    '```',
    '',
    '### Linux / macOS',
    '```bash',
    'chmod +x start.sh',
    './start.sh',
    '```',
    '',
    '## דרישות מקדימות',
    '',
    '- Node.js 20 ומעלה',
    '- Ollama עם מודל `BrainboxAI/law-il-E2B:Q4_K_M`',
    '',
    '## הגדרות',
    '',
    'העתק `config/.env.example` ל-`config/.env` ושנה לפי הצורך.',
    '',
    '## תמיכה',
    '',
    'לתמיכה פנה ל-altman.adv@gmail.com',
  ].join('\n'),
  'utf-8',
);

console.log(`✅ Portable runtime scaffold created at dist/factum-il-portable/`);
console.log(`   Directories: ${DIRS.join(', ')}`);
console.log(`   Files: VERSION, config/.env.example, start.sh, start.bat, README.md`);
