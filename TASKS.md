# TASKS.md — Factum-IL Session Tracker

> Claude Code: Read this FIRST at the start of every session. Update this LAST at the end of every session.

---

## 🔴 IN PROGRESS (pick up here)

### Fix typecheck errors in packages/pipeline
**Status:** Mid-task — session hit token limit  
**Last action:** Fixed 3 errors in `packages/ai` and `packages/api/src/utils/deadline-tracker-scheduler.ts`. Pre-existing typecheck errors in `packages/pipeline` were exposed and need fixing.  
**Next step:** Run `pnpm typecheck --filter @factum-il/pipeline` and fix all errors found.  
**Branch:** (check current branch before starting)

---

## ✅ COMPLETED (this migration cycle)

- [x] Rebranded all references from Legal-OS → Factum-IL across monorepo
- [x] Fixed `validator.ts:120` — added non-null assertion to `dateMatch[1]`
- [x] Fixed `packages/ai/package.json` — added `@factum-il/database` as workspace dependency
- [x] Fixed `packages/api/src/utils/deadline-tracker-scheduler.ts` lines 29 and 56 — removed invalid generic type args from `prepare()`
- [x] Fixed `DatabaseConnection.transaction()` call on line 88 — removed erroneous `()` on void return
- [x] Updated lockfile after package.json changes

---

## 📋 TODO (not started yet)

### High priority — before beta
- [ ] Fix all remaining `packages/pipeline` typecheck errors
- [ ] Confirm full CI passes green (build + typecheck + lint all packages)
- [ ] Test Ollama graceful fallback — kill Ollama, run pipeline, confirm no crash
- [ ] Test Hebrew RTL rendering in WebView2 on Windows
- [ ] Verify WebView2 installer prompt appears when WebView2 not found
- [ ] End-to-end test: scan → OCR → parse → report → workspace

### Medium priority
- [ ] Add pre-commit hooks (see `.husky/` setup)
- [ ] Add structured CI error output (JSON format for Claude Code)
- [ ] Beta tester onboarding guide (Hebrew)
- [ ] Review all console.log statements — remove any that log document content or client data

### Low priority
- [ ] Archive / freeze the PowerShell legacy repo with a clear README notice
- [ ] Add CHANGELOG.md

---

## 📝 Session Log

| Date | What happened |
|------|--------------|
| Last session | Factum-IL rebrand migration, fixed type errors in ai/api packages, hit session limit mid-pipeline typecheck |

---

## ⚡ Quick Commands

```bash
# Run typechecks for all packages
pnpm typecheck

# Run typecheck for one package only
pnpm typecheck --filter @factum-il/pipeline

# Build everything
pnpm build

# Run CI checks locally
pnpm ci

# Check Ollama is running
curl http://localhost:11434/api/tags
```
