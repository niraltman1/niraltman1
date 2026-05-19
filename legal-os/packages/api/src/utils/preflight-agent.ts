import { basename } from 'node:path';
import type { ClientRepository, CaseRepository, ContactsRepository } from '@legal-os/database';
import { discoverFields } from './field-discovery.js';

const OLLAMA_BASE  = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';

// ── Deterministic court-caption pre-parser ────────────────────────────────────
// Runs BEFORE any AI call. Israeli legal documents open with:
//   "[Plaintiff/Applicant] נ' [Defendant/Respondent]"
//   "[Party A] נגד [Party B]"
// The separator can be: נ׳ נ' נ" נ. נ` — before regex we normalise to a single form.

const CAPTION_RE = /^([^\n]{2,80}?)\s+(?:נ[׳'״"'`.—]|נגד)\s+([^\n]{2,80})/mu;

// Strips Unicode BiDi control characters that pdftotext embeds in RTL text.
// U+200E LRM, U+200F RLM, U+202A–U+202E (LRE/RLE/PDF/LRO/RLO),
// U+2066–U+2069 (LRI/RLI/FSI/PDI), U+061C ALM
const BIDI_RE = /[‎‏‪-‮⁦-⁩؜]/g;

// Strip court-code suffixes that contaminate the defendant capture.
// Greedy — removes everything from the first court-code/case-number onwards.
// Covers: " תאמ (חי') 4942/08", " עא (חי') 170", " מי (נצ", " - נדון"
const SUFFIX_NOISE_RE =
  /\s+(?:תאמ|תאק|תפ|עא|מי|רת|עפ|ת"פ|ת\.פ\.|מ"ח)[\s\S]*|[-–]\s*(?:נדון|עציר|מ\.ק\.)[\s\S]*/u;
const TRAILING_PARENS_RE = /\s*\([^)]{1,20}\)\s*$/u; // "(עציר)", "(חי')" etc.

interface CourtCaption {
  plaintiff: string;   // left of נ׳ — usually the filing party
  defendant: string;   // right of נ׳
}

function stripName(s: string): string {
  return s
    .replace(BIDI_RE, '')          // remove BiDi controls
    .replace(SUFFIX_NOISE_RE, '')  // drop trailing case/court codes
    .replace(TRAILING_PARENS_RE, '') // drop trailing parentheticals
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,:;]+$/, '');
}

function parseCourtCaption(ocrText: string): CourtCaption | null {
  const m = CAPTION_RE.exec(ocrText.slice(0, 500));
  if (!m) return null;

  const plaintiff = stripName(m[1]!);
  const defendant = stripName(m[2]!);

  if (plaintiff.length < 2 || defendant.length < 2) return null;
  return { plaintiff, defendant };
}

function detectIdType(name: string): 'personal' | 'company' {
  return /בע["״"'`]*מ|חב[׳']|חברת|עיריית|עירית|מועצה|מדינת|פרקליטות|שירותי|רשות|ממשלת|בנק|ביטוח/iu
    .test(name) ? 'company' : 'personal';
}

// ── Sub-Agent A: Multi-Party Contact & Identity Extractor ────────────────────
// Focuses on enriching parties already identified by the caption parser,
// or discovering parties when no caption exists.

interface CourtParty {
  name:           string;
  idNumber:       string | null;
  idType:         'personal' | 'company' | 'passport' | 'other' | null;
  phone:          string | null;
  email:          string | null;
  litigationRole: string;   // תובע | נתבע | מאשימה | נאשם | מבקש | משיב | other
}

interface MultiPartyExtraction {
  parties:    CourtParty[];
  confidence: number;
}

const AGENT_A_SYSTEM = `אתה מנתח מסמכים משפטיים ישראליים לחילוץ זהות צדדים למשפט.

## כלל ראשי: כותרת כתב בית דין
מסמכים משפטיים ישראליים פותחים לרוב בכותרת:
  [תובע/מאשימה/מבקש] נ' [נתבע/נאשם/משיב]

חלץ את שני הצדדים בנפרד — גם אם אחד מהם הוא חברה (בע"מ, חב', עיריה, רשות).

## פורמט נדרש — JSON בלבד, ללא markdown
{
  "parties": [
    {
      "name":           "<שם מלא של הצד>",
      "idNumber":       "<ת.ז. 9 ספרות / ח.פ. | null>",
      "idType":         "<personal | company | passport | other | null>",
      "phone":          "<מספר טלפון | null>",
      "email":          "<כתובת דואל | null>",
      "litigationRole": "<תובע | נתבע | מאשימה | נאשם | מבקש | משיב | other>"
    }
  ],
  "confidence": <0.0-1.0>
}

## כללים קריטיים
- חלץ תמיד שני צדדים אם קיים פורמט "X נ' Y" או "X נגד Y"
- הצד הראשון (שמאל לפני נ') הוא לרוב התובע / מאשימה / מבקש
- הצד השני (ימין אחרי נ') הוא לרוב הנתבע / נאשם / משיב
- idType company: כאשר השם כולל בע"מ, חב', עיריה, מועצה, רשות, מדינה
- אל תמציא — אם שדה לא מופיע מפורשות, החזר null
- אל תכלול שמות של שופטים או עורכי דין ברשימת הצדדים`;

async function runSubAgentA(
  ocrText:         string,
  filename:        string,
  captionHint:     CourtCaption | null,
): Promise<MultiPartyExtraction | null> {
  const excerpt = ocrText.slice(0, 2000)
    .replace(/%%BEGIN_OCR_TEXT%%/g, '[BEGIN_STRIPPED]')
    .replace(/%%END_OCR_TEXT%%/g,   '[END_STRIPPED]');

  // When caption is already known, guide the model with it to improve accuracy
  const captionLine = captionHint
    ? `\nכותרת שזוהתה: "${captionHint.plaintiff} נ' ${captionHint.defendant}"\n`
    : '';

  try {
    const body = JSON.stringify({
      model:   OLLAMA_MODEL,
      system:  AGENT_A_SYSTEM,
      prompt:  `קובץ: ${filename}${captionLine}\n%%BEGIN_OCR_TEXT%%\n${excerpt}\n%%END_OCR_TEXT%%`,
      stream:  false,
      options: { temperature: 0.05, num_predict: 500 },
    });

    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;

    const data    = await res.json() as { response?: string };
    const raw     = (data.response ?? '').trim();
    const jsonStr = raw.startsWith('```')
      ? raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
      : raw;

    const parsed        = JSON.parse(jsonStr) as Partial<MultiPartyExtraction>;
    const VALID_IDTYPES = ['personal', 'company', 'passport', 'other'] as const;
    const parties: CourtParty[] = [];

    for (const p of (Array.isArray(parsed.parties) ? parsed.parties : [])) {
      const name = typeof p.name === 'string' ? stripName(p.name) : '';
      if (name.length < 2) continue;
      parties.push({
        name,
        idNumber:       typeof p.idNumber === 'string' ? (p.idNumber.replace(/\D/g, '') || null) : null,
        idType:         VALID_IDTYPES.includes(p.idType as never) ? (p.idType as CourtParty['idType']) : null,
        phone:          typeof p.phone === 'string' && p.phone.trim() ? p.phone.trim() : null,
        email:          typeof p.email === 'string' && p.email.trim() ? p.email.trim() : null,
        litigationRole: typeof p.litigationRole === 'string' && p.litigationRole ? p.litigationRole : 'other',
      });
    }

    return {
      parties,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.3,
    };
  } catch {
    return null;
  }
}

// ── Sub-Agent B: Document Essence & Sentiment Classifier ─────────────────────

export interface EssenceClassification {
  documentEssence: string;
  urgencyLevel:    'critical' | 'high' | 'medium' | 'low';
  sentiment:       'neutral' | 'threatening' | 'conciliatory' | 'urgent' | 'grievance' | 'formal';
  emotionalLoad:   number;
  confidence:      number;
}

const AGENT_B_SYSTEM = `אתה מנתח מסמכים משפטיים ישראליים לסיווג מהות ורגש.
בדוק את המסמך ודרג את הדחיפות, הסנטימנט הרגשי, ומהות המסמך.
החזר JSON בלבד — ללא הסברים, ללא markdown.

פורמט נדרש (כל השדות חייבים להופיע):
{
  "documentEssence": "<court_ruling|petition|summons|contract|correspondence|invoice|evidence|other>",
  "urgencyLevel":    "<critical|high|medium|low>",
  "sentiment":       "<neutral|threatening|conciliatory|urgent|grievance|formal>",
  "emotionalLoad":   <0.0-1.0>,
  "confidence":      <0.0-1.0>
}

הגדרות דחיפות:
- critical: צו בית משפט, הזמנה לדין, כתב אישום — טעון תגובה מיידית
- high: בקשות, ערעורים, דוחות — טעון טיפול תוך ימים
- medium: חוזים, הסכמים, תיעוד כללי
- low: חשבוניות, מסמכי רקע, ראיות ארכיב`;

async function runSubAgentB(ocrText: string, filename: string): Promise<EssenceClassification | null> {
  const excerpt = ocrText.slice(0, 2000)
    .replace(/%%BEGIN_OCR_TEXT%%/g, '[BEGIN_STRIPPED]')
    .replace(/%%END_OCR_TEXT%%/g,   '[END_STRIPPED]');

  try {
    const body = JSON.stringify({
      model:   OLLAMA_MODEL,
      system:  AGENT_B_SYSTEM,
      prompt:  `קובץ: ${filename}\n\n%%BEGIN_OCR_TEXT%%\n${excerpt}\n%%END_OCR_TEXT%%`,
      stream:  false,
      options: { temperature: 0.1, num_predict: 200 },
    });

    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;

    const data    = await res.json() as { response?: string };
    const raw     = (data.response ?? '').trim();
    const jsonStr = raw.startsWith('```')
      ? raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
      : raw;

    const parsed     = JSON.parse(jsonStr) as Partial<EssenceClassification>;
    const URGENCY    = ['critical', 'high', 'medium', 'low']                                       as const;
    const SENTIMENTS = ['neutral', 'threatening', 'conciliatory', 'urgent', 'grievance', 'formal'] as const;

    return {
      documentEssence: typeof parsed.documentEssence === 'string' && parsed.documentEssence ? parsed.documentEssence : 'other',
      urgencyLevel:    URGENCY.includes(parsed.urgencyLevel    as never) ? (parsed.urgencyLevel    as EssenceClassification['urgencyLevel'])    : 'medium',
      sentiment:       SENTIMENTS.includes(parsed.sentiment    as never) ? (parsed.sentiment        as EssenceClassification['sentiment'])        : 'formal',
      emotionalLoad:   typeof parsed.emotionalLoad === 'number' ? Math.max(0, Math.min(1, parsed.emotionalLoad)) : 0.0,
      confidence:      typeof parsed.confidence    === 'number' ? Math.max(0, Math.min(1, parsed.confidence))    : 0.3,
    };
  } catch {
    return null;
  }
}

// ── Pre-Flight Identity Resolution Loop ──────────────────────────────────────

export interface ResolvedParty {
  name:           string;
  litigationRole: string;           // תובע | נתבע | etc.
  idType:         'personal' | 'company';
  contactId:      number | null;    // id in Contacts table (null if no ContactsRepository)
  isClient:       boolean;          // true = this party is the primary Client record
}

export interface PreflightResult {
  clientId:     number | null;
  clientName:   string | null;
  created:      boolean;            // true = primary client was auto-provisioned
  essence:      EssenceClassification | null;
  parties:      ResolvedParty[];    // all litigation parties found
  captionFound: boolean;            // true = court caption was parsed by regex
}

export async function runPreflightIdentityResolution(
  ocrText:   string,
  filename:  string,
  clients:   ClientRepository,
  _cases:    CaseRepository,
  contacts?: ContactsRepository,
): Promise<PreflightResult> {
  // ── Step 0: Deterministic court-caption parser (fast, no AI) ─────────────
  const caption = parseCourtCaption(ocrText);

  // ── Step 1: Run AI agents concurrently ───────────────────────────────────
  const [aiExtraction, essence] = await Promise.all([
    runSubAgentA(ocrText, filename, caption),
    runSubAgentB(ocrText, filename),
  ]);

  // ── Step 2: Merge deterministic + AI parties ─────────────────────────────
  // Court-caption names take precedence over AI names (regex is more reliable).
  // AI enrichment (idNumber, phone, email) is merged in per-party.

  type RawParty = { name: string; role: string };
  let rawParties: RawParty[];

  if (caption) {
    rawParties = [
      { name: caption.plaintiff, role: 'תובע' },
      { name: caption.defendant, role: 'נתבע' },
    ];
    // Optionally override roles from AI if the AI found them for the same names
    if (aiExtraction?.parties?.length) {
      for (let i = 0; i < Math.min(rawParties.length, aiExtraction.parties.length); i++) {
        const aiRole = aiExtraction.parties[i]?.litigationRole;
        if (aiRole && aiRole !== 'other') rawParties[i]!.role = aiRole;
      }
    }
  } else if (aiExtraction?.parties?.length) {
    rawParties = aiExtraction.parties.map((p) => ({ name: p.name, role: p.litigationRole }));
  } else {
    rawParties = [];
  }

  // ── Step 3: Cross-validate ID with deterministic regex ───────────────────
  const regexFields = discoverFields(ocrText);
  const resolvedId  = regexFields.israeliIds[0]
    ?? aiExtraction?.parties?.find((p) => p.idNumber)?.idNumber
    ?? null;

  // ── Step 4: Resolve or create Client for primary party (index 0) ─────────
  const primaryName = rawParties[0]?.name ?? null;
  const primaryAi   = aiExtraction?.parties?.[0];

  // 4a. Try match by ID
  if (resolvedId) {
    const byId = clients.findByIdNumber(resolvedId);
    if (byId) {
      console.log(`[Preflight:A] Resolved client id=${byId.id} via ID ${resolvedId}`);
      const parties = buildParties(rawParties, byId.id, contacts, aiExtraction);
      return { clientId: byId.id, clientName: byId.nameHe, created: false, essence, parties, captionFound: !!caption };
    }
  }

  // 4b. Try match by name via FTS5 (only when confidence is adequate)
  const aiConfidence = aiExtraction?.confidence ?? 0;
  if (primaryName && primaryName.length >= 2 && (caption || aiConfidence >= 0.5)) {
    const hits = clients.search(primaryName, 3);
    if (hits.length > 0) {
      const match = hits[0]!;
      console.log(`[Preflight:A] Resolved client id=${match.id} via name "${primaryName}"`);
      const parties = buildParties(rawParties, match.id, contacts, aiExtraction);
      return { clientId: match.id, clientName: match.nameHe, created: false, essence, parties, captionFound: !!caption };
    }
  }

  // 4c. Auto-provision primary client
  // Only fall back to filename when no caption AND no AI name was found.
  const nameHe = (primaryName && primaryName.trim().length >= 1)
    ? primaryName.trim()
    : `לקוח לא מזוהה — ${basename(filename).slice(0, 40)}`;

  const newClient = clients.create({
    nameHe,
    ...(resolvedId         ? { idNumber: resolvedId }                                                                                 : {}),
    ...(primaryAi?.idType  ? { idType:   primaryAi.idType as 'personal' | 'company' | 'passport' | 'other' }                         : {}),
    ...(primaryAi?.phone   ? { phone:    primaryAi.phone }                                                                            : {}),
    ...(primaryAi?.email   ? { email:    primaryAi.email }                                                                            : {}),
  });

  console.log(`[Preflight:A] Auto-provisioned client id=${newClient.id} nameHe="${newClient.nameHe}" captionFound=${!!caption}`);
  const parties = buildParties(rawParties, newClient.id, contacts, aiExtraction);
  return { clientId: newClient.id, clientName: newClient.nameHe, created: true, essence, parties, captionFound: !!caption };
}

// ── Helper: create/find Contact records for all parties ──────────────────────

function buildParties(
  rawParties:  Array<{ name: string; role: string }>,
  primaryId:   number,
  contacts:    ContactsRepository | undefined,
  aiExtraction: MultiPartyExtraction | null,
): ResolvedParty[] {
  return rawParties.map((rp, idx) => {
    const isClient = idx === 0;
    const aiParty  = aiExtraction?.parties?.[idx];
    let contactId: number | null = null;

    if (contacts) {
      try {
        // Search existing contacts first to avoid duplicates
        const existing = contacts.search(rp.name, 1);
        if (existing.length > 0) {
          contactId = existing[0]!.id;
        } else {
          const created = contacts.create({
            nameHe:       rp.name,
            role:         mapLitigationRoleToContactRole(rp.role),
            ...(aiParty?.idNumber     ? { idNumber:     aiParty.idNumber }     : {}),
            ...(aiParty?.phone        ? { phone:        aiParty.phone }        : {}),
            ...(aiParty?.email        ? { email:        aiParty.email }        : {}),
            notes:        `תפקיד: ${rp.role}`,
          });
          contactId = created.id;
        }
        console.log(`[Preflight:A] Party "${rp.name}" (${rp.role}) → contact id=${contactId}`);
      } catch (e) {
        console.warn(`[Preflight:A] Failed to create contact for "${rp.name}":`, String(e));
      }
    }

    // Mark primary party as the Client (primary contact override)
    if (isClient) contactId = contactId ?? primaryId;

    return {
      name:           rp.name,
      litigationRole: rp.role,
      idType:         detectIdType(rp.name),
      contactId,
      isClient,
    };
  });
}

function mapLitigationRoleToContactRole(
  role: string,
): 'opposing_counsel' | 'prosecutor' | 'witness' | 'police' | 'court_clerk' | 'expert' | 'family' | 'other' {
  if (role === 'מאשימה' || role === 'תביעה') return 'prosecutor';
  if (role === 'נתבע' || role === 'משיב' || role === 'נאשם') return 'opposing_counsel';
  return 'other';
}
