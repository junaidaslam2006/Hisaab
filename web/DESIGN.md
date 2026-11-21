# Hisaab design system — v2 "launch post"

The owner asked for the look and *format* of a modern AI model launch announcement (the Anthropic "Claude Fable 5.1"
post was the named example): calm ivory paper, big serif headlines, a painted full-screen hero, a numbered contents
list with dotted leaders, ink-hairline tables and charts, a sage highlight, pill buttons, footnotes. Every screen of
Hisaab — the public site AND the signed-in app — should read like a well-edited launch post about *this shop's khata*.

We borrow the vibe, never the brand: no Anthropic/Claude names, logos, wordmark shapes or fonts anywhere. Hisaab has
its own wordmark and uses open Google Fonts.

Reference screenshots (read them before designing): the session scratchpad folder `ref/` —
`01-hero-desktop.jpg` (painted sky hero, date eyebrow, staggered serif title, dotted-leader contents),
`02-lead-and-body.jpg` (28px serif lead, serif body, bold run-in labels), `03-h2-and-chart-frame.jpg` (h2, tabs above
a framed chart, legend dots), `04-benchmark-table.jpg` (ink-hairline grid table, highlighted sage column),
`05-quote-card-tabs.jpg` (tab row + sage quote card with labeled cells), `06-wide-figure.jpg` (wide washed figure with
centered caption), `07-get-started-footnotes.jpg`, `08-further-reading.jpg`, `09-dark-footer.jpg`, `10/11-mobile-*.jpg`,
and `20-OLD-hisaab-landing.jpg` (what we are replacing).

## Principles
1. **Editorial calm.** Ivory paper, ink text, lots of air. Serif for headlines, leads and reading text; a clean sans
   for UI (buttons, tables, labels, forms). Hairlines instead of shadows. One accent wash (sage) for "the important one".
2. **Launch-post format.** Pages open with an *eyebrow* (date / context), a big serif *title*, a serif *lead*
   paragraph, then numbered sections. Long pages get a dotted-leader contents list and, on desktop, a left
   section-progress tick rail. Evidence goes in *framed figures* (charts, grid tables, labeled cards) with small
   centered captions. Pages end with "Get started" pills, footnotes, further reading.
3. **Personal, never generic.** In the app every headline and lead is written from the shop's real data
   ("Rs 9,450 is out on udhaar. Gul Khan has owed the longest — 41 days."). No placeholder numbers, no fake
   testimonials, no invented statistics. On the public site, only true product facts (see "Facts we can claim").
4. **One meaning per color.** Rust = owed to the shop (udhaar). Olive = received. Amber = overdue / needs
   attention. Sage = highlight only (never means money). Always pair color with a word or sign.
5. **No "AI" clichés.** No neon, glow, glassmorphism, orbs, sparkles, emoji icons, purple gradients on UI. The only
   atmosphere is the painted hero sky (and the live-call screen), the paper, and the washes.
6. **Shopkeeper-proof.** Works at 360px, 44px touch targets on touch screens, readable in a bright shop, big plain
   numbers, one obvious next action per screen, buttons are verbs.

## Tokens — `web/src/styles/tokens.css` (never hard-code hex in components)
- Paper/surfaces: `--paper` #faf9f5, `--paper-2`, `--surface` (= paper), `--surface-raised` (white: inputs, sheets),
  `--surface-sunk` #f0eee6 (secondary pills, table heads).
- Lines: `--rule` (soft row divider), `--rule-strong` (inputs), `--rule-heavy` (2px section rule), `--frame` (ink
  hairline around figures/tables/cards).
- Text: `--ink` #141413, `--ink-2` secondary, `--ink-3` meta (>= 4.5:1), `--ink-4` decorative only.
- Washes: `--sage` (+ `--sage-ink` border), `--heather`, `--sky-wash`, `--sand`, `--oat`.
- Hero looks: `--sky-day`, `--sky-dusk`, `--sky-night`.
- Meaning: `--owed`/`--owed-tint`/`--owed-soft`, `--paid`/`--paid-tint`/`--paid-soft`, `--warn`/`--warn-tint`, `--danger`.
- On sage: `--on-sage-2` (labels, sub-labels, meta), `--on-sage-owed`, `--on-sage-paid`, `--on-sage-warn` — 80% of the
  colour mixed with ink, all >= 5:1 on `--sage` (the plain greys/meaning colours are 3.4–4.4:1 there). Every shared
  sage surface swaps them in for `--ink-2/3`, `--owed`, `--paid`, `--warn`; page sage surfaces add `.on-sage`.
- `--brand*` = ink (primary actions are ink pills); kept for old CSS.
- Shape: `--r-frame` 0 (frames are square), `--r` 8px (inputs), `--r-pill` (all buttons/controls).
- Space `--s1`…`--s10` (4…128). Measures: `--reading` 640px, `--wide` 840px, `--page` 1080px.
- Fonts: `--font-serif` Source Serif 4, `--font-sans` Hanken Grotesk, `--font-mono` JetBrains Mono, `--font-urdu`
  Noto Nastaliq Urdu, `--font-naskh` Noto Naskh Arabic (Pashto islands only: `.ps` / `lang="ps"`).

## Typography roles
| Role | Latin | Urdu (`:lang(ur)` / `.ur`) |
|---|---|---|
| Hero title | serif 400, clamp(44px, 6vw, 72px), lh 1.08, letter-spacing -0.01em; may stagger lines (2nd line indented) | Nastaliq, ~0.8× size, lh 1.7 |
| Page title (app h1) | serif 400, clamp(34px, 4.6vw, 52px), lh 1.1 | Nastaliq ~0.8×, lh 1.8 |
| h2 | serif 400, 32px, lh 1.2 | Nastaliq 26px, lh 1.9 |
| h3 / figure title | serif 500 22px, or sans 600 15–17px inside frames | Nastaliq 20px |
| Lead | serif 400, clamp(21px, 2.4vw, 28px), lh 1.3, `--ink` | Nastaliq 21–24px, lh 2 |
| Reading body | serif 400, 17px, lh 1.55 (prose pages, help, privacy, landing) | Nastaliq 17px, lh 2.1 |
| UI text | sans 400/500 14–16px | Nastaliq 15–16px |
| Label | sans 11–12px, UPPERCASE, letter-spacing 0.08em, `--ink-3` ("YOU SAID", "COMPANY") | Nastaliq 13px, no caps |
| Caption | sans 13px, `--ink-2`, centered under figures, max 680px | Nastaliq 14px |
| Numbers | `.num` = tabular lining figures; money in tables is sans 600; a headline amount is serif display | digits stay Western |
Bold run-in labels inside paragraphs: `<strong>Price.</strong> Free while…` (serif 600).

## Shapes and surfaces
- **Frames are square** with a 1px `--frame` (ink) border: figures, chart boxes, grid tables, quote/labeled cards,
  panels, sheets. Inner dividers use 1px ink inside grids, `--rule` between list rows.
- **Controls are pills**: buttons, nav items, segmented controls, chips, language switch, search field.
  Primary = ink fill + ivory text. Secondary = `--surface-sunk` fill, ink text, no border. Ghost = text + underline
  on hover. Danger = `--owed` text with 1px `--owed` border. Heights: 36 (sm), 40 (md), 48 (lg); 44 minimum on touch.
- Inputs: white (`--surface-raised`), 1px `--rule-strong`, `--r` 8px radius, 44px tall; focus ring 2px `--focus`
  outline with 2px offset. Labels above inputs (sans 14 600).
- No drop shadows except overlays (`--shadow-overlay` on sheets/menus/toasts).
- Links: ink, underline 1px, offset 3px, `--ink-4` underline color → ink on hover.

## Layout
- **Public pages**: ivory header 64px (wordmark, nav pills, EN/اردو pill switch, Log in, ink "Connect WhatsApp"
  pill). Landing = launch post. Privacy/Terms = article. Dark footer (`--ink` background, ivory text, hairline rows).
- **Auth pages** (connect, login, welcome): minimal ivory header; one centered column (max 560px) opening with
  eyebrow ("Step 1 of 2"), serif title, serif lead, then framed panels.
- **App**: desktop ≥ 960px uses a top header (wordmark + shop name, centered nav pills Today · Customers · Messages ·
  Settings · Help, WhatsApp status pill, language pill, account menu). Under 960px: compact top bar + bottom tab bar
  (ivory, 1px ink top rule, active item ink with a 2px ink bar). Page content max `--page`, padding 48/32 desktop,
  24/16 mobile. Every app page starts with `PageHeader` (eyebrow, title, lead, actions).
- Use logical CSS properties everywhere (`margin-inline-start`, `padding-inline`, `inset-inline-start`,
  `text-align: start`); Urdu is RTL. Mirror directional icons (`.flip-rtl`).

## Shared building blocks (implemented in `components.css` + `components/editorial.jsx` + `components/ui.jsx`)
Existing (keep their APIs): `Button` (variant primary | secondary | ghost | danger; size sm | md | lg; icon; iconEnd;
loading; block; to; href), `IconButton`, `Icon`, `Money` (tone auto | owed | paid | neutral; size sm | lg | xl | display),
`Badge` (tone owed | paid | warn | neutral; dot), `Avatar`, `Field`, `.input` `.select` `.textarea`, `Segmented`,
`Sheet`, `ConfirmSheet`, `useToast()`, `VoiceNote`, `EmptyState`, `Spinner`, `Skeleton`, `LoadError`, `Logo`,
`EntrySheet`, `ReminderSheet`, `LangSwitch`, `MicRecorder`, `LiveCall`, `.panel` (+ `.panel-head/.panel-body/.panel-foot`
— now a square ink frame), `.ledger-table` (= grid table), `.row-list`/`.row-link` (mobile rows), `.banner`.

`PageHeader({ eyebrow, title, lead, subtitle /* alias of lead */, actions, toc })`.

New editorial primitives (`components/editorial.jsx`):
- `Toc({ items: [{ label, href?, onClick?, meta? }], variant: 'article' | 'hero' | 'index' })` — "[1] ……… Label"
  dotted-leader contents list (hero variant: ivory text on the sky, labels at the end like the reference; index
  variant: the same shape in ink on the paper, for Help / Privacy / Terms; article variant: label start, leader,
  meta end). Urdu: 16px for every variant, meta 15px.
- `Tabs({ tabs: [{ value, label, count? }], value, onChange, label })` — text tabs above a frame: selected = ink,
  others `--ink-3`; keyboard arrows; `role="tablist"`.
- `Frame({ title, meta, legend: [{ label, tone }], children, foot, className })` — square ink frame with header row
  (title sans 600 at start, meta `--ink-2` at end, legend dots under it).
- `Figure({ wash: 'none' | 'sage' | 'heather' | 'sky' | 'sand', wide, caption, children })` — wide figure, optional
  wash background, centered caption below.
- `LabeledCells({ cells: [{ label, value }], tone })` — grid of labeled cells separated by ink hairlines
  (the "COMPANY | AUTHOR" footer of the reference quote card).
- `QuoteCard({ label, children, cells, tone: 'sage' | 'plain' | 'warn' })` — card with small label, serif quote text,
  optional `LabeledCells` footer; sage fill + ink border by default.
- `Footnotes({ items })`, `FurtherReading({ items: [{ text, link: { label, href | to } }] })`.
- `SectionRail({ sections: [{ id, label }] })` — fixed tick rail at the inline-start edge on wide screens
  (≥ 1200px), current section's tick longer/ink; hidden on small screens.
- `Rule({ heavy })`.
- Grid table: `<table className="grid-table">` — 1px ink outer + cell borders, header row sans 14 600, row label
  bold with `.sub` sub-label in `--ink-3`, cells sans 14; add `.hl` to the cells of the highlighted column (sage fill;
  its text switches to the `--on-sage-*` colours). Under 720px `.stack-sm` renders stacked cards, caption full width
  below them.
- `PaintedSky({ look: 'day' | 'dusk' | 'night', animate = true, className })` — `components/PaintedSky.jsx`: a canvas
  that fills its positioned parent with a soft painted sky (layered cloud masses, grain, crescent moon at night,
  stars at night, warm haze at dusk), slow drift; static frame under `prefers-reduced-motion`; CSS fallback color.
  Used by the landing hero and the live-call screen.

## Charts
Framed (`Frame`) with tabs above when there are several views. Header: title at start, what-it-measures at end,
legend with round markers. Series: dots (r 5, 1px darker stroke) joined by 1.5px lines; given/udhaar uses
`--owed-soft` fill + `--owed` stroke, collected uses `--paid-soft` fill + `--paid` stroke. Gridlines 1px `--rule`;
axis labels sans 11 `--ink-3`; value labels small above points where room allows. Always include an sr-only table,
wrapped in `<div className="sr-only">` (see COMPONENTS.md → Charts).

## Motion
Quiet: 160–240ms fades/slides with `--ease`. Hero sky drifts slowly. Respect `prefers-reduced-motion` everywhere.

## Language
- Every visible string comes from a strings table with `en` and `ur` keys (`useStrings`). Urdu copy in proper Urdu
  script. Familiar terms stay: udhaar, baqaya, khata. Digits stay Western (Rs 1,850).
- Urdu text always uses Nastaliq (never the Latin serif); give it extra line-height.
- Urdu strings never wrap words in curly quotes (Nastaliq draws “ ” mirrored): isolate a Latin word with LRI…PDI
  (`\u2066…\u2069`), a name of unknown script with FSI…PDI (`\u2068…\u2069`), or drop the quotes.
- Latin islands in the Urdu UI (`.num`, `.latin`, `dir="ltr"`, inputs, `code`, `.mono`) keep their letter-spacing;
  everything else in Urdu is reset to 0.
- Pashto text gets Naskh (`.ps`), the usual Pashto style, with line-height 1.8.

## Facts we can claim on the public site (all true today)
- Works with the shopkeeper's own WhatsApp, linked like WhatsApp Web (QR scan or phone-number pairing code). Only the
  "Message yourself" chat is read. (Footnote: this uses WhatsApp's linked-devices feature, not Meta's business API.)
- Understands voice notes and texts in Urdu, Pashto, Punjabi, Hindko and English — and Urdu and English mixed in one
  sentence ("Umar ne 500 rupees ka saman liya on credit aur Ahmed paid 300 back" = two entries); spoken amounts like
  "dhai sau" (250), "dedh hazaar" (1,500), "5k" (5,000), Pashto "pinza sawa" (500).
- Replies on WhatsApp with a short text card and a spoken Urdu voice note with the new balance.
- Several entries in one message (3+ come back as a numbered list with each new balance and one total); "undo" and
  corrections ("nahi, 450 the"); balance questions ("Umar ka hisaab"); who-owes lists ("1000 se zyada kis ka baqaya
  hai"); today's summary; full khata.
- **Lists**: up to 20 separate lists per shop (mohalla, factory workers, teachers, relatives…), made by voice
  ("Factory workers ki list banao") or in Settings; a new person can go straight into a list; dues, totals, the khata
  and reminders can be asked for one list ("Mohalla list mein kis kis ka udhaar hai", "Teachers ko reminder bhej do").
  Everyone not in a list is in General.
- **Suppliers**: the shop's own debts — stock taken on credit ("Rehman Traders se 15000 ka stock aaya udhaar pe"),
  payments to suppliers, "how much do I owe". Kept in a suppliers list, never added to udhaar totals, follow-ups or
  reminders.
- Photo of a handwritten khata page → entries.
- Customer reminders: Hisaab prepares a polite WhatsApp message with the balance; the shopkeeper sends it.
- Live "talk to Hisaab" call from the dashboard.
- Dashboard: who owes what, since when; follow-ups (unpaid 7+ days); running balance per customer; lists; every message
  with its original voice note and what Hisaab wrote; CSV export; delete account any time. Settings has a one-tap
  system check (AI, voice, WhatsApp, database) and removable, clearly-marked sample data.
- No passwords: log in with a 6-digit code sent to your own WhatsApp, or a one-time link.
- Free during the pilot, up to 300 messages a day per shop.
- Timings (medians, October 2026 tests on the pilot server, synthetic test voices): a typed message is understood in
  about 2 s, a voice note in about 3½ s; the reply with its voice note arrives about 10 s after sending (15 notes,
  7–18 s). Always say "depends on the network".
- Voice notes and texts are understood by **Google Gemini Live**, with Google's standard Gemini models as the automatic
  backup when Live is busy (and alongside Live for voice notes of 30 s or more). Made in Peshawar by TensorMind.
- Hisaab runs on Google's **free** Gemini API tier (no paid key, no credits). Say so wherever the AI is described in
  detail, together with what it means: Google's free-tier terms let Google use what is sent to improve its products,
  human reviewers may read it, and the free tier has per-minute and daily limits shared by all shops (Privacy §3,
  Terms "Early access"). Never promise speed or availability beyond the measured medians.
- Every example phrase shown in Help / on the landing page / in Welcome must be one the understanding eval
  (`eval/cases.json`) or a direct `brain.understand()` run has shown working. Never quote accuracy percentages on the
  public site (the eval is synthetic); they belong in the pitch deck with that caveat.
Never invent customers, testimonials, user counts, accuracy percentages or partner logos.

## Lists and suppliers — words and colour
- en "list" / ur "لسٹ" (plural "لسٹیں") — the word shopkeepers and Hisaab's own voice replies use (not "فہرست";
  فہرست stays only for "Contents" and generic ordered lists such as the follow-up list).
  General = en "General", ur "عام کھاتہ". Kinds: "Customers" / "گاہک", "Suppliers" / "سپلائرز".
- A supplier's balance is what the **shop owes**: write "you owe Rs X" / "آپ نے X دینے ہیں", show it in the payable
  slate blue `--lst-payable` (`<Money tone="payable">`, `.lst-payable`; defined in `web/src/lib/lists.css`) on every
  screen, never rust or olive, and never add it to udhaar totals on any screen. A purchase on a supplier khata is
  payable too; a payment the shop made to a supplier is ink (`tone="neutral"`) — it is neither udhaar nor money in.
- Today's udhaar figures leave suppliers out, so Today adds one line for supplier khatas with entries today
  ("Supplier khata today: … Kept apart from udhaar") instead of claiming nothing was written.
- Sample data is always labelled "Sample" / "نمونہ" and removable from Settings → Sample data in one tap.

## Foundation notes (implemented)
- The how-to for every class and component is `web/COMPONENTS.md` (props, JSX examples, page skeletons).
- Two table styles: `.grid-table` = full ink grid for short evidential tables (add `.stack-sm` for cards under
  720px); `.ledger-table` = open ledger for long lists inside a panel/flush Frame (ink header rule, soft row rules).
- Extra exports beyond the list above: `TabPanel`, `Legend`, `FootnoteRef` (editorial.jsx), `useModal` (Sheet.jsx),
  Button `variant="inverse"` (ivory pill on the sky/dark), Logo `compact | inverse | size="lg"`.
- Urdu overrides in CSS use `:where(html[lang='ur']) .selector { … }` so they keep the selector's own specificity.
- Public section anchors the header links to: `#how-it-works`, `#languages`, `#dashboard`, `#pricing`; footer Help
  (signed out) → `#faq`.
