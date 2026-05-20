# Legal-OS — Design System

> An intelligent, Hebrew-first **Visual Legal Operating System** for Israeli lawyers and legal academics. Legal-OS evolves from a PowerShell file-organizer into a full **Graph RAG knowledge platform** that maps the relationships between laws, statutes, sections, court decisions, cases, judges, lawyers, evidence and academic literature — and reasons across them with explainable AI.

This folder is a complete design system: foundations (color, type, spacing, motion), brand assets, iconography rules, a UI kit, sample slide layouts and a SKILL.md so you can drop it into Claude Code as an Agent Skill.

---

## Index

| Path | What's there |
|---|---|
| `colors_and_type.css` | All tokens — color, type scale, spacing, radii, shadows, semantic roles. Import this first. |
| `assets/` | Logos, brand imagery, generic illustrations. |
| `preview/` | Cards rendered into the Design System tab. |
| `ui_kits/legal-os/` | Pixel-fidelity React/JSX recreation of the core product — graph workspace, side panel, command bar, document explorer. |
| `slides/` | Slide templates that match the brand (title, comparison, big-quote, graph-as-hero, etc.) |
| `SKILL.md` | Agent Skill manifest — usable from Claude Code or this project. |
| `README.md` | You are here. |

---

## Sources used

This design system was synthesised from three inputs the user attached:

1. **Brand logo** (`uploads/5nrG0.jpg` → `assets/logo-legal-os.jpg`) — the knight-chess + circuit-board + scales-of-justice mark on a deep navy field. This drove the entire palette and motif system.
2. **GitHub repo** `niraltman1/Management-of-legal-documents-and-cases-` branch `claude/organize-pc-files-bEQ2d` (subtree `organize-pc-files-bEQ2d/`) — the PowerShell pipeline that catalogs every file on a lawyer's PC, OCRs them, extracts ת.ז. / case numbers, builds a SQLite knowledge base. This drove the **content fundamentals**: Hebrew/English bilingual, legal document vocabulary, naming conventions, court-type abbreviations.
   - Repo URL: <https://github.com/niraltman1/Management-of-legal-documents-and-cases-/tree/claude/organize-pc-files-bEQ2d>
   - The reader is encouraged to explore the repo for deeper context on the underlying data model (Files, FileContent, ParsedIdentifiers, Clients, Cases, Hearings, Tasks, LegalArguments, ActionLog) — every screen in the UI kit maps back to these tables.
3. **Product spec** — a multi-page Hebrew/English spec describing the *Academic Knowledge Graph / Graph RAG* system. This drove the **visual foundations** of the graph workspace: node-type colors, edge-style vocabulary, side-panel anatomy, the 5-step legal reasoning engine, and the dark-mode "Visual Legal OS" aesthetic.

---

## What Legal-OS is

Legal-OS sits at the intersection of three things:

- **A file organizer** — scans a Windows PC, OCRs every PDF/DOCX/scanned image, extracts Israeli legal identifiers (תעודת זהות numbers, court case numbers like `תא-2024-042`, `ת"פ`, `בג"ץ`), and reorganizes the entire filesystem into `Legal\Clients\[name_id]\Cases\[case-number]\{Pleadings, Motions, Evidence, …}`.
- **A knowledge graph** — every extracted entity becomes a node (law, section, decision, case, judge, lawyer, expert, client, document, evidence, task, AI-insight). Every detected relationship becomes a typed, weighted, confidence-scored edge (`cites`, `contradicts`, `supports`, `precedent_of`, `procedural_dependency`, `semantic_similarity`, …).
- **A reasoning engine** — a Graph-RAG-powered AI that does multi-hop traversal, identifies contradictions and missing evidence, surfaces precedents, and explains its conclusions in a 5-step reasoning panel (*Context → Classification → Authorities → Conflict/Risk → Practical Conclusion*).

The product **is not** a document manager. The framing throughout the UI is *"Legal Intelligence,"* *"Knowledge Brain,"* *"Procedural Navigation."*

---

## Audience

- **Primary**: Israeli solo / small-firm lawyers handling civil + criminal cases (the user is also a medical educator who teaches accident-investigation and security-officer courses — hence the Teaching domain in the file system).
- **Secondary**: Legal academics, researchers, expert witnesses, paralegals.
- **Tertiary**: Students of law and forensic medicine in Israel.

Hebrew is the **primary** UI language; English is a peer (not an afterthought). Every screen must be RTL-ready and bilingual.

---

## Content Fundamentals

The voice of Legal-OS is **precise, formal, and bilingual**.

### Tone
- **Authoritative, never breezy.** This is software lawyers stake their professional liability on. Avoid casual phrasing ("oops!", "we got you", "let's go"). Prefer measured, declarative copy: "Conflict detected", "Authority cited", "Procedural step required".
- **Explainable.** Every AI-generated assertion is accompanied by its evidence (a citation, a confidence score, a 5-step reasoning trail). The product never says "the system thinks X" without showing *why*.
- **Quietly confident.** Legal-OS is a co-pilot, not a know-it-all. Phrasings like *"Suggested precedent — review before citing"* are preferred over *"You should cite this case."*

### Casing & punctuation
- **Sentence case** for buttons, menu items, panel titles, table headers. *Not* Title Case. ("Open side panel", not "Open Side Panel".)
- **Hebrew never uses casing** — but in mixed Hebrew/English UI, English fragments still follow sentence case.
- **Use the formal lexicon.** Use ת.ז. (with the periods), בג"ץ (with the gershayim), כתב תביעה, פסק דין — never colloquial shortenings.
- **Numbers**: case numbers always render in monospace (e.g. `תא-2024-042`). Dates always `YYYY-MM-DD`.

### Person / address
- **English UI**: "You" form ("You have 3 deadlines this week"). Never "we" — the product is *theirs*, not the vendor's.
- **Hebrew UI**: **לשון פנייה ישירה** ("יש לך 3 דדליינים השבוע"), gender-neutral where possible. Avoid the corporate plural "אנחנו" — it sounds like a marketing brochure.

### Emoji and exclamation
- **No emoji in the product UI.** Ever. The closest substitute is a colored severity dot or an outlined icon glyph.
- **No exclamation marks** in copy. Confidence is conveyed by the layout, not by punctuation.

### Examples — good copy

| Context | English | Hebrew |
|---|---|---|
| Empty graph state | No nodes in view. Drop a document or run a search to begin. | אין צמתים בתצוגה. גרור מסמך או בצע חיפוש כדי להתחיל. |
| Risk badge | Contradiction with `בג"ץ 6821/93` — review | סתירה עם `בג"ץ 6821/93` — דרושה בדיקה |
| Confidence score | Confidence 0.82 — derived from 4 sources | רמת ביטחון 0.82 — נגזר מ-4 מקורות |
| AI reasoning step | **Step 2 / Legal classification.** This document is a *כתב תביעה* under פקודת הנזיקין. | **שלב 2 / סיווג משפטי.** המסמך הוא *כתב תביעה* על פי פקודת הנזיקין. |
| Action button | Apply approved changes | יישום שינויים מאושרים |

### Examples — to avoid

- ❌ "Hey there! Looks like Legal-OS found some new files 🎉"
- ❌ "Oops, something went wrong"
- ❌ "Smart Legal AI™"
- ❌ "Unleash the power of Graph RAG"

---

## Visual Foundations

### Palette
The system is **dark-first**. A deep, slightly-blue navy (`#0a1124`) is the canvas; everything else builds up from it.

- **Field**: `#050a18` → `#0a1124` → `#111a33` → `#18233f` → `#1f2c4d` (ambient depth).
- **Foreground**: `#f4f7ff` (primary text), `#c9d3eb` (secondary), `#8a99bd` (meta / captions), `#5a6789` (disabled).
- **Brand spine**: electric cyan (`#5eeae8`) is the single bright accent — it represents *intelligence* and *connection*. Use it sparingly: for the active node, primary CTA, focused edge, brand mark.
- **Steel/platinum** (`#cbd5e1`, `#e8edf6`) are reserved for the logo and chess/circuit imagery.
- **Node colors** (17 distinct hues) carry semantic meaning — *never* re-purposed for decoration. See `colors_and_type.css` `--node-*` tokens.

A light mode is **not** authored — it's a derivative if ever needed. Legal-OS runs almost entirely in dark mode because lawyers work long hours and the graph workspace needs OLED contrast.

### Typography
- **Display / serif** — Cormorant Garamond, weight 400–500. Used for *"Legal"* in the wordmark, hero headlines, big quotes, slide titles. Italic for case names (`Brown v. Board of Education`).
- **Body sans / English** — Inter, weight 400–600.
- **Hebrew** — Heebo, weight 300–700. Tightly metrics-matched to Inter so mixed-script lines align cleanly.
- **Monospace** — JetBrains Mono. Used everywhere a *legal identifier* appears: case numbers, ת.ז., section numbers, file hashes, filenames.

Type rules:
- Set headings with negative letter-spacing (-0.01em to -0.025em).
- Body line-height is generous (1.6) because of mixed Hebrew/English.
- Hebrew runs **RTL**, English runs **LTR**, and a bilingual line uses `unicode-bidi: plaintext` so each script handles itself.
- **`text-wrap: pretty`** on paragraphs and headings.

> **Substitution flag** — The mark in the logo uses an elegant transitional serif that's clearly **not** an off-the-shelf face — possibly custom-drawn. Cormorant Garamond is the closest free match (slim contrast, slightly elongated S/L). If you have the brand's licensed family, replace the `@import` in `colors_and_type.css` and update `--font-display`.

### Backgrounds
The default background is **flat dark navy**, *not* a gradient. But three optional treatments are sanctioned:
1. **Circuit-trace overlay** — extracted from the logo, a sparse glowing trace pattern that runs at ~6% opacity behind the graph canvas. Used on title slides and the empty-state hero.
2. **Radial cyan glow** — a single, very soft cyan radial at the focal point of the page. Used on title screens only. Never multiple, never colorful.
3. **Knight watermark** — the chess-knight silhouette at ~4% opacity, used as a tasteful brand watermark on memo/export PDFs.

No bluish-purple gradients. No noise textures. No hand-drawn illustrations.

### Cards and panels
- **Border-radius**: 10–14px for cards, 6px for chips, 4px for tags, full-pill for status badges.
- **Border**: every card has a `1px` hairline at `rgba(255,255,255,0.06)`. The border is *more important than the shadow* — it's what gives the system its precise, schematic feel.
- **Shadow**: ambient `0 10px 32px rgba(0,0,0,0.55)` for raised panels. The shadow is for elevation, *not* for glow. Glow is reserved for cyan signal.
- **Glassmorphism**: `backdrop-filter: blur(20px) saturate(140%)` + `rgba(17,26,51,0.55)`. Used ONLY for floating panels over the graph canvas (the side panel, the command palette). Not on dashboard cards.

### Edges and links (graph)
- Direct, strong relationships → **thick** stroke (2.5px).
- Secondary / weak → **thin** (1px).
- AI-inferred → **dashed**.
- High-confidence → **glow** (cyan/risk drop-shadow).
- Animated edges only when a reasoning trace is actively running — never as ambient decoration.

### Motion
- All easing is `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo). The product never bounces.
- Hover transitions: 160ms. Modal/panel transitions: 240ms. Page-level: 400ms.
- **Fades and slight upward translations** (4–8px) are the default entrance. No scale-in.
- The graph canvas uses physics (force-directed layout) but with high damping — nodes settle in ~600ms after a layout change.

### Hover / press states
- **Hover**: surface lightens by one level (`--bg-surface` → `--bg-surface-2`) AND a cyan hairline `rgba(94,234,232,0.4)` appears on the border. Cursor changes to indicate interactivity.
- **Press / active**: surface darkens to `--bg-surface-3` and scales to `0.98`. Borders intensify to `rgba(94,234,232,0.6)`.
- **Focused** (keyboard): 2px cyan outline at 2px offset, always — accessibility floor.

### Layout rules
- **Persistent left rail** (72px collapsed, 240px expanded) — workspace switcher.
- **Top bar** (56px) — global search + command palette trigger.
- **Right side panel** (420px) — node inspector / reasoning panel. Floats over canvas with glass.
- **Bottom dock** — timeline strip when in Timeline Mode.
- Grid is **8px base** (with 4px half-steps allowed inside cards).
- Max content width is **1440px** for non-graph views; the graph canvas itself is full-bleed.

### Transparency, blur, density
- **Blur** is used only for the side panel and command palette over the graph. *Never* on dashboards.
- **Density is HIGH.** Lawyers want to see a lot at once. Tables are 36–40px row height (not 56). Side panels show 6+ sections at a time. The product does not feel "spacious"; it feels *consequential*.

### Iconography vibe
- All icons are **stroke**, never filled.
- 1.5px stroke weight, 24×24 viewBox, rounded line caps.
- Cyan only when active/selected — otherwise inherit `currentColor` against `--fg-2`.

---

## Iconography

Legal-OS does **not** ship a custom icon set. We use **Lucide** (<https://lucide.dev/>) via CDN because its stroke style (1.5px, rounded caps, geometric) exactly matches the schematic feel of the brand.

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

> **Substitution flag** — The original repo is a PowerShell project with no UI icons of its own. Lucide is our chosen substitute. If you later commission a custom set, replace `<i data-lucide="…">` calls and update this section.

### Conventions
- **24×24** for nav and toolbar icons; **16×16** for inline icons; **20×20** for buttons.
- Stroke `currentColor`. Never apply `fill` to lucide icons.
- For *legal entities* in the graph, we draw small custom glyphs (gavel for judge, scales for court decision, scroll for statute, person for client) — see `assets/icons/`. These are also stroke-only, 1.5px, in the same visual family as Lucide.
- **Logo / brand mark**: `assets/logo-legal-os.jpg` is the master. For dark backgrounds use it as-is; we do not currently have a horizontal lockup or a knockout version (flagged for the user).

### What's never used
- **Emoji**, anywhere. Severity is conveyed by a 6px colored dot (`--ok`, `--warn`, `--risk`, `--info`).
- **Unicode dingbats** as icons (e.g. `✓ × ★`). The check / close glyphs come from Lucide.
- **Filled or duotone icons** — they clash with the stroke aesthetic.
- **Flag-of-Israel imagery, gavel-on-American-flag, or any other clip-art**. The brand is intelligent and precise, not patriotic clip-art.

### Custom legal glyphs (in `assets/icons/`)
- `scales.svg` — Court / decision
- `gavel.svg` — Judge / order
- `scroll.svg` — Statute / regulation
- `briefcase.svg` — Lawyer
- `book.svg` — Academic article / journal
- `shield.svg` — Evidence
- `knight.svg` — Mini brand mark (chess-knight silhouette)

---

## Asset list

- `assets/logo-legal-os.jpg` — primary mark, the knight + circuit + scales image (1168×784, dark navy).
- `assets/icons/*.svg` — legal entity glyphs (see above).
- `assets/circuit-trace.svg` — repeatable circuit-board overlay pattern, 6% opacity behind hero sections.

---

## UI kit

See `ui_kits/legal-os/`:

- `index.html` — interactive click-through prototype of the main workspace.
- `GraphCanvas.jsx` — the central force-directed graph.
- `SidePanel.jsx` — the node inspector + 5-step reasoning engine.
- `LeftRail.jsx`, `TopBar.jsx`, `CommandBar.jsx`.
- `Dashboard.jsx` — client/case/task overview screen.
- `TimelineDock.jsx` — procedural timeline strip.
- `README.md` — kit-level docs and assembly notes.

Slide templates live in `slides/`.

---

## Open caveats / next steps

- The brand's licensed display typeface is unknown — substituted Cormorant Garamond. **Please confirm or supply.**
- No horizontal / knockout / monochrome logo variant exists — flagged. Once supplied, drop them in `assets/`.
- The user's underlying repo is PowerShell — no production UI exists yet. The UI kit is therefore a **design proposal** consistent with the spec, not a pixel-recreation of an existing app. If Figma files appear later, re-derive the kit from them.
- Hebrew RTL support is implemented at the CSS level (`[lang="he"]`) but each component's `flex-direction` should be re-verified once real Hebrew copy is in.
