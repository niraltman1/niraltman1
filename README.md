# Factum IL

Local-first legal operating system for Israeli boutique law firms.  
Built on a TypeScript/React monorepo, SQLite, and a portable Node.js runtime — no cloud dependency at runtime.

## Quick Start

```bash
pnpm install
pnpm dev          # API + dashboard in watch mode
```

## Build & Package

```powershell
# Windows — produces dist-package\FactumIL_V13_Installer.exe
.\Build-FactumIL.ps1
```

Prerequisites: Node.js 22, pnpm 9, .NET 8 SDK, Inno Setup 6.

## Project Structure

```
apps/
  dashboard/          React 19 + Vite + Tailwind (RTL Hebrew UI)
  desktop/            C# WPF shell hosting the dashboard via WebView2
  installer/          START-HERE.ps1 bootstrap
packages/
  api/                Express API (30+ routes)
  database/           better-sqlite3, 39 SQL migrations
  shared/             Types and utilities shared across packages
  ai/                 Ollama integration (law-il-E2B model)
  citation-engine/    Israeli legal citation parser
  pipeline/           Media pipeline (Whisper transcription, evidence lock)
migrations/           SQL migration files 001–039
powershell/           Registry, config, and automation helpers
assets/               Icons and branding
installer.iss         Inno Setup 6 production installer script
Build-FactumIL.ps1   Master build script
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

## Status

![CI](https://github.com/niraltman1/Factum-IL/actions/workflows/ci.yml/badge.svg)
