# Factum-IL Patch Format Specification

Version: 1.0  
Status: Normative  
Date: 2026-06-14

---

## Overview

A `.factumpatch` file is a ZIP archive distributed over HTTPS from the Factum-IL
update server. `PatchManager` extracts and applies it in a 9-step workflow.
`PatchValidator` must validate every field in this specification before any
file is touched.

---

## Archive Layout

```
my-patch-1.2.0.factumpatch   (ZIP archive)
├── manifest.json            ← authoritative descriptor (see §2)
├── manifest.sig             ← Ed25519 signature over SHA-256(manifest.json) (see §5)
├── files/                   ← changed source files, relative paths (see §3)
│   ├── packages/api/src/routes/cases.ts
│   └── apps/dashboard/src/features/...
└── migrations/              ← numbered .sql files (see §4)
    ├── 081.sql
    └── 082.sql
```

### Rules

- All file paths inside `files/` are relative. Absolute paths are rejected.
- `migrations/` contains only `NNN.sql` files where `NNN` is a zero-padded
  three-digit integer. Non-conforming filenames are rejected.
- The archive must not contain symlinks or `../` path components.

---

## §2 — `manifest.json` Schema

```json
{
  "formatVersion": 1,
  "minimumSupportedVersion": "1.0.0",
  "version": "1.2.0",
  "minCompatible": "1.1.0",
  "targetVersion": "1.2.0",
  "releaseDate": "2026-06-14T00:00:00Z",
  "releaseNotes": "תיאור השינויים בעברית",
  "signingKeyId": "factum-prod-2026",
  "requiredMigrations": [77, 78, 79, 80],
  "migrations": [81, 82],
  "sha256map": {
    "packages/api/src/routes/cases.ts": "<hex>",
    "migrations/081.sql": "<hex>",
    "migrations/082.sql": "<hex>"
  }
}
```

### Required Fields

| Field | Type | Description |
|---|---|---|
| `formatVersion` | `integer` | Must be `1`. `PatchValidator` rejects any value it does not recognise. |
| `minimumSupportedVersion` | `semver string` | Minimum installed app version that can apply this patch. |
| `version` | `semver string` | Version this patch upgrades **from**. |
| `minCompatible` | `semver string` | Oldest version still compatible after applying. |
| `targetVersion` | `semver string` | Version **after** applying this patch. |
| `releaseDate` | `ISO8601 string` | UTC release date. |
| `signingKeyId` | `string` | Key ID from `TrustedSigningKeys` registry used to sign this patch. |
| `requiredMigrations` | `number[]` | Migration IDs that must already be applied on the target DB. |
| `migrations` | `number[]` | New migration IDs this patch introduces (monotonically increasing). |
| `sha256map` | `Record<string, string>` | SHA-256 hex digest for every file in `files/` and every file in `migrations/`. |

### `formatVersion` Compatibility Rule

```
REJECT if: manifest.formatVersion > SUPPORTED_FORMAT_VERSION (= 1)
REJECT if: semver(installed_version) < semver(manifest.minimumSupportedVersion)
```

This ensures that a v2 `.factumpatch` is never silently mis-parsed by a v1
`PatchManager`.

---

## §3 — `files/` Directory

- Contains only files that **changed** relative to `manifest.version`.
- File paths are POSIX-style relative paths, no leading slash.
- Every file listed in `sha256map` under a non-`migrations/` key must exist here.
- `PatchValidator` verifies `SHA-256(actual_bytes) === sha256map[path]` for every entry.

---

## §4 — `migrations/` Directory

- Contains `.sql` files named `NNN.sql` where `NNN` is the migration number.
- Migration numbers must be monotonically increasing and contiguous (no gaps within this patch).
- Every migration runs in its own SQLite transaction.
- `PatchManager` applies **static validation** before execution:
  - Syntax validation (parse the SQL; reject non-parseable)
  - Ordering validation (sequence is monotonically increasing)
  - Dependency validation (FK targets already exist in the schema)
- No dry-run execution against the production DB (SQLite `ALTER TABLE` rollbacks
  are not guaranteed reliable; static analysis is the safe approach).

---

## §5 — `manifest.sig` (Ed25519 Signature)

```
Content: base64url(Ed25519.sign(SHA-256(manifest.json), privateKey))
```

`PatchValidator` verifies using the public key identified by `manifest.signingKeyId`:

```typescript
const TrustedSigningKeys: Record<string, string> = {
  'factum-prod-2026': '<base64url-encoded-Ed25519-public-key>',
  // Add new keys here; retired keys remain until all clients update
};
```

**Key rotation procedure:**
1. Generate new `factum-prod-YYYY` key pair.
2. Add the new public key to `TrustedSigningKeys` in a code release.
3. Sign all new patches with the new key ID.
4. After all clients update past the code release, remove the old key entry.

This allows key rotation without breaking existing patches already in the field.

---

## §6 — Compatibility Matrix

Before applying a patch, `PatchValidator` checks:

```
For each migration ID M in manifest.requiredMigrations:
  ASSERT applied_migrations.includes(M)
```

If any required migration is missing, validation fails with error:
`"Required migration {M} is not applied on this installation"`.

This prevents a client at version 1.4.x from applying a 1.6.x patch that
requires migrations 077–080 the client does not yet have.

---

## §7 — Recovery Point Retention Policy

`PatchRollbackManager` retains the **most recent 10 recovery points** OR all
points created within the last **30 days** (whichever is larger). Older points
are pruned immediately after a new recovery point is successfully verified.

---

## §8 — Safe Mode

If rollback itself fails (e.g., recovery point files missing or corrupt),
`PatchManager` writes `systemState: 'SAFE_MODE'` to `UpdateStateStore` and
exits. In SAFE_MODE:

- API starts normally
- Workspace routes return HTTP 503
- `/api/diagnostics/*`, `/api/support/export`, and `/api/updates/*` remain active

This allows remote rescue of a broken installation.

---

## §9 — Validation Summary

`PatchValidator.validate(archivePath)` performs in order:

1. `formatVersion` ≤ `SUPPORTED_FORMAT_VERSION`
2. `minimumSupportedVersion` ≤ installed version
3. `signingKeyId` exists in `TrustedSigningKeys`
4. Ed25519 signature verified
5. `sha256map` keys match archive members
6. Per-file SHA-256 verified
7. Migration filenames conform to `NNN.sql` pattern
8. Migration numbers are monotonically increasing
9. `requiredMigrations` all present in applied migrations
10. No symlinks or path traversal in archive members

Any failure returns `{ valid: false, errors: string[] }` and prevents apply.
