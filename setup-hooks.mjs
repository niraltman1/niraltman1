#!/usr/bin/env node
// setup-hooks.mjs
// Run once: node setup-hooks.mjs
// Sets up pre-commit hooks that catch errors before they reach CI.

import { writeFileSync, mkdirSync, chmodSync, existsSync } from 'fs';
import { execSync } from 'child_process';

console.log('Setting up Factum-IL pre-commit hooks...\n');

// ─── 1. Install husky ────────────────────────────────────────────────────────
try {
  execSync('pnpm add -D husky --workspace-root', { stdio: 'inherit' });
  execSync('pnpm husky init', { stdio: 'inherit' });
  console.log('✅ Husky installed\n');
} catch {
  console.log('⚠️  Husky already installed or install failed — continuing\n');
}

// ─── 2. Pre-commit hook ──────────────────────────────────────────────────────
const preCommitHook = `#!/bin/sh
# Factum-IL pre-commit hook
# Runs fast checks before every commit. Slow checks run in CI.

echo "🔍 Factum-IL pre-commit checks..."

# 1. Check for forbidden old name references
FORBIDDEN=$(git diff --cached --name-only -z | xargs -0 grep -l "Legal-OS\\|LegalOS\\|legal-os" 2>/dev/null | grep -v ".git" | grep -v "TASKS.md" | grep -v "CLAUDE.md")
if [ -n "$FORBIDDEN" ]; then
  echo "❌ ERROR: Found old name 'Legal-OS' or 'LegalOS' in staged files:"
  echo "$FORBIDDEN"
  echo "   Replace with 'Factum-IL' before committing."
  exit 1
fi

# 2. TypeScript check (only changed packages)
CHANGED_PACKAGES=$(git diff --cached --name-only | grep "^packages/" | cut -d'/' -f2 | sort -u)
if [ -n "$CHANGED_PACKAGES" ]; then
  echo "📦 Type-checking changed packages: $CHANGED_PACKAGES"
  for pkg in $CHANGED_PACKAGES; do
    if [ -f "packages/$pkg/tsconfig.json" ]; then
      pnpm typecheck --filter "@factum-il/$pkg" || {
        echo "❌ TypeScript errors in packages/$pkg — fix before committing"
        exit 1
      }
    fi
  done
fi

# 3. Check for console.log with sensitive data patterns
SENSITIVE=$(git diff --cached --name-only -z | xargs -0 grep -n "console\\.log.*client\\|console\\.log.*תז\\|console\\.log.*case" 2>/dev/null)
if [ -n "$SENSITIVE" ]; then
  echo "⚠️  WARNING: Possible sensitive data logging detected:"
  echo "$SENSITIVE"
  echo "   Review these logs before committing (attorney-client privilege)."
  # Warning only, not blocking
fi

# 4. Check for 'any' type without justification comment
ANY_TYPES=$(git diff --cached -U0 | grep "^+" | grep ": any" | grep -v "// factum-il: any-ok" | grep -v "^+++" )
if [ -n "$ANY_TYPES" ]; then
  echo "⚠️  WARNING: 'any' type found without justification comment:"
  echo "$ANY_TYPES"
  echo "   Add '// factum-il: any-ok — reason' comment if intentional."
  # Warning only, not blocking
fi

echo "✅ Pre-commit checks passed"
exit 0
`;

mkdirSync('.husky', { recursive: true });
writeFileSync('.husky/pre-commit', preCommitHook);
chmodSync('.husky/pre-commit', '755');
console.log('✅ Pre-commit hook written to .husky/pre-commit\n');

// ─── 3. Commit-msg hook (enforce conventional commits) ───────────────────────
const commitMsgHook = `#!/bin/sh
# Enforce conventional commit format for clean git history
# Valid: feat: ..., fix: ..., chore: ..., docs: ..., refactor: ..., test: ...

COMMIT_MSG=$(cat "$1")
PATTERN="^(feat|fix|chore|docs|refactor|test|style|perf|ci|build|revert)(\\(.+\\))?: .{3,}"

if ! echo "$COMMIT_MSG" | grep -qE "$PATTERN"; then
  echo "❌ Invalid commit message format."
  echo "   Use: type(scope): description"
  echo "   Types: feat, fix, chore, docs, refactor, test, style, perf, ci, build, revert"
  echo "   Example: fix(pipeline): correct typecheck errors in deadline-tracker"
  echo ""
  echo "   Your message: $COMMIT_MSG"
  exit 1
fi
`;

writeFileSync('.husky/commit-msg', commitMsgHook);
chmodSync('.husky/commit-msg', '755');
console.log('✅ Commit-msg hook written to .husky/commit-msg\n');

// ─── 4. Add lint-staged config to package.json ──────────────────────────────
console.log('📝 Add this to your root package.json:\n');
console.log(JSON.stringify({
  "lint-staged": {
    "**/*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "**/*.{json,md}": ["prettier --write"]
  }
}, null, 2));

console.log('\n─────────────────────────────────────');
console.log('✅ Pre-commit hooks installed successfully!');
console.log('');
console.log('Every commit will now automatically:');
console.log('  • Block commits with old "Legal-OS" name references');
console.log('  • Type-check only the packages you changed (fast)');
console.log('  • Warn about potential sensitive data logging');
console.log('  • Warn about unjustified "any" types');
console.log('  • Enforce conventional commit message format');
console.log('─────────────────────────────────────\n');
