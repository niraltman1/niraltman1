# AI_EXECUTION_POLICY.md — Factum-IL Local AI Execution Policy

**Policy version:** 1.0  
**Effective:** 2026-06-18  
**Enforced by:** bootstrap-world.ps1, Test-AIHealth.ps1, installer.iss

---

## Core Mandate

Factum-IL is a **local-first legal platform** handling attorney-client privileged documents.

**NO CLIENT DATA MAY EVER LEAVE THE MACHINE.**

All AI inference — document processing, indexing, embeddings, retrieval, reasoning, summarization, and response generation — must execute locally via Ollama on the end-user's hardware.

---

## Permitted AI Execution Model

### One model. One endpoint. No exceptions.

| Parameter | Value |
|-----------|-------|
| Model | `BrainboxAI/law-il-E2B:Q4_K_M` |
| Endpoint | `http://localhost:11434` (loopback only) |
| Runtime | Ollama (local daemon) |
| Network | Loopback only — no external connections |

### Why this model is non-negotiable

- Trained specifically on Israeli law, court verdicts, and legal Hebrew
- Understands Israeli court structure (שלום, מחוזי, עליון, עבודה, משפחה)
- Knows Israeli procedural rules and deadline logic
- Produces output in correct formal Israeli legal register
- Any other model produces wrong, untested, and potentially harmful legal output
- Attorney-client privilege requires locally-executed, auditable inference

---

## Forbidden Actions

The following are **absolutely forbidden** regardless of circumstances:

| Action | Category |
|--------|----------|
| Sending document content to any external API | Data leak |
| Calling OpenAI, Anthropic, Google, Cohere, Mistral, or any cloud LLM | Forbidden provider |
| Switching to a different local model (gemma2, llama, mistral, phi, etc.) | Forbidden model |
| Using environment variables to redirect inference to external endpoints | Config bypass |
| "Fallback" to cloud when Ollama is unavailable | Silent degradation |
| Automatic provider switching based on hardware tier | Tier-based bypass |
| Logging document content, client names, or case identifiers to any external sink | PII leak |

---

## Required Behavior When Local AI Is Unavailable

When `http://localhost:11434` is unreachable or `BrainboxAI/law-il-E2B:Q4_K_M` fails to respond:

### Allowed responses

1. **Maintenance Mode** — Application enters `MAINTENANCE` state. All AI-dependent features are disabled. User is shown a clear recovery dialog.

2. **Retry Bootstrap** — User may trigger `bootstrap-world.ps1 -Repair` to re-verify and restart the Ollama service.

3. **Repair Workflow** — User may run `Repair-FactumIL.ps1` to reinstall Ollama, re-register the model, and verify health.

### Forbidden responses

1. **Silent skip** — Processing a document as if AI succeeded when it did not.
2. **External inference** — Routing the request to any cloud provider.
3. **Degraded output** — Returning empty or stub AI responses without clear user notification.
4. **Automatic provider switch** — Changing `OLLAMA_MODEL` to a different model.

---

## Enforcement Points

### 1. bootstrap-world.ps1
- Step 7: Verifies Ollama is installed and running
- Step 8: Verifies model `BrainboxAI/law-il-E2B:Q4_K_M` is registered
- Step 9: Executes warmup inference — must succeed before `BOOTSTRAP_DONE.flag` is written
- **No flag = no application launch**

### 2. Test-AIHealth.ps1
- Called by bootstrap-world.ps1 and available for standalone health checks
- Writes `runtime/AI_HEALTH.json` with `ollamaRunning`, `modelPresent`, `inferenceSucceeded`, `latencyMs`
- Desktop application reads this file at every startup

### 3. packages/ai/src/OllamaClient.ts
- Must health-check `http://localhost:11434/api/tags` before every inference call
- Must never fall through to any external endpoint
- Must log `WARN` (not `ERROR`) when Ollama is down and return a structured error
- Must NEVER call any provider other than `http://localhost:11434`

### 4. packages/model-router/src/index.ts
- Model selection must return `BrainboxAI/law-il-E2B:Q4_K_M` unconditionally
- Hardware tier detection is informational only (for performance tuning)
- Hardware tier must never influence which model is selected

### 5. installer.iss [Run]
- bootstrap-world.ps1 is the final [Run] step
- Desktop.exe is NOT launched until bootstrap writes `BOOTSTRAP_DONE.flag`

---

## Audit Log Requirements

Every AI inference call must log (locally only):
- Timestamp
- Model name (must be `BrainboxAI/law-il-E2B:Q4_K_M`)
- Endpoint used (must be `http://localhost:11434`)
- Latency (ms)
- Success/failure status

**Must NOT log:**
- Document content
- Client names or identifiers
- Case numbers or case content
- Any PII

---

## Banned Code Patterns

The following patterns are prohibited in any source file under this repository:

```typescript
// BANNED: external providers
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// BANNED: external endpoints
fetch('https://api.openai.com/...');
fetch('https://api.anthropic.com/...');

// BANNED: model switching
const model = tier === 'low' ? 'gemma2:2b' : 'BrainboxAI/law-il-E2B';

// BANNED: cloud fallback
if (!ollamaAvailable) { return callCloudAPI(prompt); }
```

---

## Code Review Gate

Every PR that touches:
- `packages/ai/`
- `packages/model-router/`
- `packages/pipeline/`
- `apps/installer/`
- `powershell/scripts/`

Must be reviewed for compliance with this policy. Use the keyword search:
```bash
grep -rE "openai|anthropic|gemini|cohere|mistral|llama|gemma|phi[0-9]|cloud.*fallback|fallback.*cloud" \
  packages/ai packages/model-router packages/pipeline
```

Zero matches required before merge.
