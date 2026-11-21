# Hisaab components — cheat sheet for page authors

Design intent lives in `DESIGN.md`; tokens in `src/styles/tokens.css`. This file is the **how**: every class and
component the foundation ships, with props and a short example. If you need something that is not here, build it in
your page's CSS under your page root class, from tokens, and report it.

```
src/styles/base.css        element defaults, type roles, .prose / .article grid, Urdu mode, utilities
src/styles/components.css  every shared component class (buttons … editorial primitives … charts)
src/styles/layout.css      app / public / auth shells, .container, .nav-pill
src/components/ui.jsx      Button IconButton Money Badge Avatar Spinner Skeleton PageHeader EmptyState Segmented Field Logo LoadError
src/components/editorial.jsx  Toc Tabs TabPanel Legend Frame Figure LabeledCells QuoteCard Footnotes FootnoteRef FurtherReading SectionRail Rule
src/components/Sheet.jsx   Sheet (default), ConfirmSheet, useModal
src/components/Toast.jsx   ToastProvider, useToast
src/components/Icon.jsx    Icon (default), DIRECTIONAL_ICONS
src/lib/lists.jsx          useListWords listName personListName listParam listHref pickerLists isSupplier ListChip SampleBadge (+ lists.css)
src/lib/useHashScroll.js   useHashScroll
VoiceNote.jsx EntrySheet.jsx ReminderSheet.jsx LangSwitch.jsx MicRecorder.jsx LiveCall.jsx PaintedSky.jsx (if present)
```

```jsx
import { Button, Money, PageHeader } from '../components/ui.jsx'
import { Frame, Tabs, Toc, QuoteCard, LabeledCells, Footnotes, SectionRail } from '../components/editorial.jsx'
```

---

## 1. Ground rules

- **Breakpoints:** `360` smallest phone (no horizontal scroll) · `720` phone → tablet (`max-width: 719px`) ·
  `960` app desktop header vs. phone tab bar (`max-width: 959px`) · `1200` section rail appears (`min-width: 1200px`).
  Touch sizing uses `@media (pointer: coarse)` — shared controls already grow to 44px there.
- **Scope page CSS** under your page root class (`.home-page …`). Never restyle a shared class globally.
- **Tokens only** (`var(--ink)`, `var(--s5)` …). No hex. Logical properties only (`margin-inline-start`,
  `padding-inline`, `inset-inline-end`, `text-align: start | end`, `border-block-start`).
- **Fonts by role, not by name:** use `var(--f-head)` (serif / Nastaliq) and `var(--f-ui)` (sans / Nastaliq). They
  switch automatically in Urdu. Use `var(--font-sans)` / `var(--font-serif)` only for digits/Latin that must stay Latin.
- **Numbers:** add `.num` to any element showing figures (tabular, and stays Latin in Urdu). Money → `<Money>`.
- **Strings:** every visible string comes from your page's `{ en, ur }` table via `useStrings`. Shared words
  (Cancel, Save, Loading…, nav labels, Footnotes…) are in `COMMON` — `const C = useCommon()`.
- **Color = meaning:** rust `--owed` (udhaar), olive `--paid` (received), amber `--warn` (overdue), sage = highlight
  only. Always pair color with a word or sign. Money the shop **owes a supplier** is the payable slate blue
  `--lst-payable`: `<Money tone="payable">` + the words "you owe" (see DESIGN.md → Lists and suppliers, and §8a).
- **Server errors with extra fields** (`retryAfter`, `list`, `people`): `api()` keeps only `status` and `code`. When a
  page needs the extra fields, read the JSON body itself (Settings.jsx has a small `request()` helper that does).
- **Motion:** 160–240 ms with `var(--ease)`; the global reduced-motion reset already neutralises animations.

## 2. Urdu (RTL) — how to mark text

| You have | Do |
|---|---|
| Whole UI in Urdu | nothing: `html[lang=ur]` flips direction and switches `--f-head`/`--f-ui` to Nastaliq |
| An Urdu island inside English (a customer's Urdu name, a transcript) | `<span className="ur">{c.nameUrdu}</span>` (or `lang="ur"`) |
| A Latin island inside Urdu (Roman-Urdu message, phone number) | `className="latin"` (or `lang="en"`); phone numbers also `dir="ltr"` on an inline span |
| Pashto text (ځ ۍ ې ښ ږ ټ ډ ړ ګ ڼ) — a Pashto transcript or name | `<span className="ps" lang="ps">…</span>`: Naskh (`--font-naskh`, Noto Naskh Arabic), line-height 1.8, RTL + isolated. `lang="ps"` alone switches the font only |
| Digits | `.num`; money via `<Money>` (already LTR-isolated) |
| A code / anything in `var(--font-mono)` (pairing code, login code) | add `.mono` (or use `<code>`/`<kbd>`) so the Urdu UI keeps its Latin letter-spacing and mono font |
| A Latin word or a name inside an Urdu **string** | no curly quotes (Nastaliq draws “ ” mirrored). Known-Latin word: `\u2066Word\u2069` (LRI…PDI). A name that may be Latin or Urdu: `\u2068${name}\u2069` (FSI…PDI) |
| A directional icon (arrows, chevrons) | `<Icon name="arrow-right" className="flip-rtl" />` — `Button`/`IconButton` do it for you |

Urdu needs room: Nastaliq lines are tall. Shared classes already set Urdu sizes/line-heights. When **your** page CSS
sets a font-size or line-height on text that can be Urdu, add an override with the zero-specificity prefix so it ties
with your own selector and wins by order:

```css
.home-hero-note { font: 400 15px/1.5 var(--f-ui); }
:where(html[lang='ur']) .home-hero-note { font-size: 16px; line-height: 2; }
```

Never `letter-spacing` or `text-transform` Urdu (base.css zeroes letter-spacing in Urdu for you). Latin islands are
exempt from that reset and keep their own spacing: `.num`, `.latin` / `[lang=en]`, `[dir=ltr]`, `input`, `textarea`,
`code` / `kbd` / `samp`, `.mono` (and their descendants) — no `!important` overrides needed for a 6-digit code.

## 3. Type roles (classes in base.css)

| Class / element | Role |
|---|---|
| `h1`, `.page-title` | page title — serif 400, clamp(34–52px), lh 1.1 |
| `.hero-title` | painted-sky hero title — serif clamp(44–72px). Stagger: `<h1 className="hero-title"><span>Your khata,</span><span>on WhatsApp</span></h1>` (2nd line indents) |
| `h2`, `.h2` | section heading — serif 32px (28 on phones) |
| `h3`, `.h3` | sub-heading — serif 500 22px |
| `h4`, `.h4` | sans 600 16px |
| `.lead` | serif lead paragraph clamp(21–28px) |
| `.prose` | reading column: serif 17/1.55, max `--reading` (640). Paragraph rhythm, h2/h3 spacing, lists, `<strong>` run-ins |
| `.body-serif` | one serif reading paragraph outside `.prose` |
| `.eyebrow` | sans 14 500 `--ink-2` — date / context above a title |
| `.label` | sans 11px UPPERCASE tracked `--ink-3` ("YOU SAID") — Urdu: 13px, no caps |
| `.caption` | sans 13 `--ink-2`, centred, max 680 — under figures |
| `.meta` | sans 13 `--ink-3` — timestamps, counts |
| `.num` | tabular lining figures |
| `.muted` `.ink-2` `.owed` `.paid` `.warn` `.on-dark` | colour utilities |
| `.on-sage` | put on **your own** sage-filled surface: re-points `--ink-2/3`, `--owed`, `--paid`, `--warn` at darker `--on-sage-*` tokens so labels, `.sub`, `.meta` and `<Money>` stay ≥ 4.5:1 (shared sage surfaces already do this) |
| `.mono` | Latin code in `var(--font-mono)` (keeps letter-spacing in the Urdu UI) |
| `.ps` | Pashto island in Naskh (see §2) |
| `.sr-only` `.flip-rtl` `.hide-sm` (≤ 520px) `.skip-link` | helpers (`.sr-only` is safe on a `<table>` too; wrapping it in a `<div className="sr-only">` is preferred) |

Bold run-in label inside prose: `<p><strong>Price.</strong> Free during the pilot…</p>`.

## 4. Page skeletons

### App page (inside AppLayout — `.app-main` already gives max `--page` 1080 and 48/32 · 24/16 padding)

```jsx
export default function Customers() {
  const S = useStrings(STRINGS)
  return (
    <div className="cust-page">
      <PageHeader
        eyebrow={me.shopName}
        title={S.title}
        lead={S.lead(total, oldest)}            // written from real data: "Rs 9,450 is out on udhaar…"
        actions={<Button variant="primary" icon="plus" onClick={add}>{S.add}</Button>}
        toc={[{ label: S.owing, href: '#owing', meta: <Money value={due} /> }, { label: S.settled, href: '#settled' }]}
      />

      <section className="section" id="owing" aria-labelledby="owing-h">
        <div className="section-head">
          <h2 id="owing-h">{S.owingTitle}</h2>
          <Link className="link-arrow" to="/app/activity">{S.allMessages} <Icon name="arrow-right" className="flip-rtl" /></Link>
        </div>
        <p className="section-lead">{S.owingLead}</p>
        <Frame title={S.tableTitle} meta={S.tableMeta} flush>
          <table className="ledger-table">…</table>
        </Frame>
      </section>

      <section className="section" id="settled">…</section>
      <SectionRail sections={[{ id: 'owing', label: S.owingTitle }, { id: 'settled', label: S.settledTitle }]} />
    </div>
  )
}
```

- `.page-header` = 64px bottom margin; `.section` = 64px top margin (48 on phones); the first section after the
  header has none. `.section-head` = h2 at start + optional link/meta at end. `.section-lead` = serif 17 paragraph.
- The disconnected-WhatsApp banner is drawn by the layout above your page; don't add another.
- Mobile: the bottom tab bar is fixed; `.app-main` bottom padding already clears it. Toasts sit above it.

### Public article page (Landing / Privacy / Terms — PublicLayout's main is full-bleed; you set widths)

```jsx
<article className="article prose">        {/* reading column centred; children default to 640px */}
  <p className="eyebrow">October 2026</p>
  <h1>Privacy</h1>
  <p className="lead">…</p>
  <Toc items={[{ label: 'What we read', href: '#read' }, …]} />
  <h2 id="read">What we read</h2>
  <p>…</p>
  <Figure wide wash="sage" caption="…">…</Figure>     {/* .wide → up to --wide 840 */}
  <div className="full">…edge to edge…</div>          {/* .full → full bleed */}
  <Footnotes items={[…]} />
</article>
```

`.article` is a grid with named lines `full | wide | reading`; it brings its own side gutter (`--gutter`: 32px,
16px on phones). `.article.flush` removes the gutter (use inside an already-padded container). Without `.article`,
use `.container` (max `--page` + gutters) and `.measure` (max 640) / `.measure-wide` (max 840) + `.center`.

Section anchors used by the public header: **`#how-it-works`, `#languages`, `#dashboard`, `#pricing`** (and the
footer's Help → `#faq` for signed-out visitors). `[id]` elements get `scroll-margin-top` for the sticky header.

Painted hero: put it as the first child of your page (directly under the 64px header), full-bleed, e.g.
`<header className="landing-hero on-dark"><PaintedSky look="day" /> … <h1 className="hero-title">…</h1><Toc variant="hero" items={…} /></header>`.
`.on-dark` turns focus rings ivory. Buttons on the sky: `variant="inverse"` (ivory pill) or `primary`.

### Auth page (Connect / Login / Welcome — AuthLayout gives one centred column, max 560px)

```jsx
<div className="login-page">
  <p className="eyebrow">{S.step(1, 2)}</p>
  <h1>{S.title}</h1>
  <p className="lead">{S.lead}</p>
  <div className="panel">…</div>
</div>
```

## 5. ui.jsx

### Button
`variant`: `primary` (ink pill) · `secondary` (sunk pill, default) · `ghost` (text, underline on hover) · `danger`
(rust outline; add `className="solid"` for rust fill) · `inverse` (ivory pill for the sky / dark).
`size`: `sm` 36 · `md` 40 (default) · `lg` 48 (all ≥ 44 on touch). `icon`, `iconEnd` (directional icons mirror
automatically), `loading`, `disabled`, `block`, `to` (router Link), `href` (plain `<a>`; pass `target`/`rel`).
```jsx
<Button variant="primary" size="lg" icon="whatsapp" to="/connect">{S.connect}</Button>
<Button variant="ghost" iconEnd="arrow-right" to="/app/customers">{S.all}</Button>
<Button variant="danger" className="solid" loading={busy} onClick={del}>{C.delete}</Button>
```
Get-started row (end of a page): `<h3>{S.getStarted}</h3><div className="cluster">…two pills…</div>`.

### IconButton
`icon`, `label` (required → aria-label + title), `bordered`, `sunk` (sunk fill), `size="sm"` (32px). Round, 40px
(44 on touch). `<IconButton icon="more" label={S.more} onClick={…} />`

### Money
`value` (rupees), `tone`: `auto` (rust if > 0, olive if 0, ink if advance) · `owed` · `paid` · `neutral` ·
`payable` (what the shop owes a supplier — its colour comes from `lib/lists.css`, so import `lib/lists.jsx` or
`lib/lists.css` in a page that uses it);
`size`: `sm` · (default 16) · `lg` 22 · `xl` 32 · `display` (serif headline number, clamp 44–64);
`sign`: `credit` (+) | `payment` (−). Always sans/serif Latin, LTR-isolated.
```jsx
<Money value={o.totals.due} tone="owed" size="display" />  <span className="meta">{S.outOnUdhaar}</span>
```

### Badge
`tone`: `owed` · `paid` · `warn` · `sage` · `ink` (alias `brand`) · default neutral; `dot`; `className`
(`outline` for a hairline pill). `<Badge tone="warn" dot>{S.days(41)}</Badge>`

### Avatar
`name`, `size`: `sm` 32 · default 40 · `lg` 56. Oat circle, serif initials. Decorative (aria-hidden).

### PageHeader
`eyebrow`, `title`, `lead` (alias `subtitle`), `actions` (node — pills row under the lead), `toc` (array → article
`Toc`, or any node), `className`, `titleId` (id on the h1).

### EmptyState
`icon`, `title`, `children` (serif paragraph), `action` (node). Hairline icon circle + serif title.

### Segmented
`options: [{ value, label }]`, `value`, `onChange`, `label` (aria), `block` (full width, equal parts), `className`.
Pill track; pressed option = raised pill with ink hairline. Scrolls inside itself if too wide.

### Field + inputs
`<Field label hint error htmlFor>{input}</Field>`; inputs: `.input` (`.lg` 52px, `.pill`), `.select`, `.textarea`,
`.input-group` + `.prefix`, `.checkbox`, pill search:
```jsx
<label className="search-field"><Icon name="search" /><input className="input" placeholder={S.search} aria-label={S.search} /></label>
```

### Logo
Wordmark "Hisaab | حساب" (UI language leads). `to` (default `/`), `compact` (lead word only), `inverse` (ivory),
`size="lg"`, `className`.

### Spinner / Skeleton / LoadError
`<Spinner size="lg" />` (role=status). `<Skeleton width="60%" height={20} />`. `<LoadError onRetry={reload} />`.

## 6. editorial.jsx

### Toc — dotted-leader contents
`items: [{ label, href? | to? | onClick?, meta? }]`, `variant`:
- `article` (default) — `[1] Label ······ meta`, leader only when `meta` is given; max `--reading`.
- `hero` — `[1] ·········· Label`, **ivory** for the painted sky, labels end-aligned, max 340px, no meta.
- `index` — the same `[1] ·········· Label` shape in **ink on the paper**, max 420px, no meta. Use it for the
  contents of Help, Privacy, Terms (instead of restyling `hero` in page CSS).

Also `label` (aria; default "Contents"), `title` (small label above), `start` (first number). Sizes: 15px article /
14px hero + index; in Urdu every variant is 16px (meta 15px) — no page override needed.
```jsx
<Toc variant="hero" items={[{ label: S.intro, href: '#intro' }, { label: S.how, href: '#how-it-works' }]} />
<Toc variant="index" label={S.contents} items={sections.map((s, i) => ({ label: s.h, href: `#legal-s${i + 1}` }))} />
<Toc items={people.map(p => ({ label: p.name, to: `/app/customers/${p.id}`, meta: <Money value={p.balance} tone="owed" /> }))} />
```

### Tabs (+ TabPanel)
`tabs: [{ value, label, count? }]`, `value`, `onChange`, `label` (aria, required), `id`, `controls`, `className`.
Text tabs; selected = ink with a 2px ink bar. ←/→ (mirrored in RTL), Home/End. Wrap tabs + frame in `.tabs-block`.
```jsx
<div className="tabs-block">
  <Tabs id="flow" controls="flow-panel" label={S.views} value={view} onChange={setView}
        tabs={[{ value: 'given', label: S.given }, { value: 'collected', label: S.collected, count: 12 }]} />
  <TabPanel tabsId="flow" value={view}>
    <Frame title={S.chartTitle} meta={S.last14} legend={[{ label: S.given, tone: 'owed' }, { label: S.collected, tone: 'paid' }]}>
      <svg className="chart" …/>
    </Frame>
  </TabPanel>
</div>
```

### Frame
`title`, `titleAs` (default `h3`), `meta` (end of the header row), `legend: [{ label, tone }]`, `children`, `foot`,
`flush` (no body padding + ink rule under the header — use for tables and row lists), `tone="sage"`, `as`, `id`.

### Legend
`items: [{ label, tone }]`, tones `owed` `paid` `warn` `sage` `ink` `sky` (default neutral). Round 10px markers with
a darker stroke — same marks as the charts.

### Figure
`wash`: `none` · `sage` · `heather` · `sky` · `sand` (padded wash behind the content), `wide` (up to 840, centred),
`caption` (centred `.caption` below), `id`, `className`.

### LabeledCells
`cells: [{ label, value }]`, `tone`: `plain` · `sage` · `sunk`, `framed` (default true), `min` (narrowest cell before
wrapping, default 160). Ink hairlines between cells survive wrapping. Renders a `<dl>`. On `sage` (and inside a sage
`QuoteCard`) labels and `<Money>` use the darker `--on-sage-*` colours automatically.
```jsx
<LabeledCells tone="plain" cells={[{ label: S.youSaid, value: '“Umar ne 500 ka sauda liya”' }, { label: S.written, value: <Money value={500} tone="owed" sign="credit" /> }]} />
```

### QuoteCard
`label` (small caps), `children` (serif quote text), `cells` (LabeledCells footer), `tone`: `sage` (default) ·
`plain` · `warn`. Use for "what you said / what Hisaab wrote", reminder previews, real voice-note transcripts.
**Never** for invented testimonials.

### Footnotes / FootnoteRef / FurtherReading
```jsx
<p>…about two seconds<FootnoteRef n={1} />.</p>
<Footnotes items={[{ lead: 'Speed.', text: 'Measured on our pilot server, October 2026; depends on the network.' }]} />
<FurtherReading items={[{ text: S.privacyText, link: { label: S.read, to: '/privacy' } }]} />
```
Both draw the 2px `--rule-heavy` rule above (`rule={false}` to drop it) and an `h2` title (defaults from COMMON).
Footnote ids are `fn-1…` (or `fn-<id>` when an item has `id`).

### SectionRail
`sections: [{ id, label }]`, `label` (aria). Fixed ticks at the inline-start edge, ≥ 1200px only; the current
section's tick is longer and ink. Render it once per page, after the sections exist (it re-checks for late ones).

### Rule
`<Rule />` soft 1px · `<Rule heavy />` 2px · `<Rule ink />` 1px ink.

## 7. CSS-only building blocks

### .panel — square ink frame
```jsx
<div className="panel">
  <div className="panel-head"><h2>{S.title}</h2><Button size="sm" variant="ghost">…</Button></div>
  <div className="panel-body">…</div>          {/* or a .row-list / .ledger-table directly */}
  <div className="panel-foot">…</div>
</div>
```
Headings inside `.panel-head` are sans 600 15px. `.panel.sage` = highlighted panel.

### Tables — choose one
- `.grid-table`: full ink-hairline grid (the benchmark table). Short evidential tables (≤ ~12 rows).
- `.ledger-table`: open ledger for long lists inside a `.panel`/`Frame flush` — ink rule under the header, soft
  `--rule` between rows, first/last cells aligned to the panel padding.

Both support: `<th scope="row">` row labels with `<span className="sub">` sub-label, `.hl` on every cell of the
highlighted column (sage — its labels, `.sub` and `<Money>` darken automatically to stay ≥ 4.5:1), `.end` (or
`td.num`) for numeric/end-aligned cells, `tr.clickable`, `tr.is-void`, `<caption>` (rendered as a centred caption
below; with `.stack-sm` it stays full width under the cards on phones).

```jsx
<div className="grid-table-wrap">
  <table className="grid-table stack-sm">
    <caption>{S.caption}</caption>
    <thead><tr><th scope="col">{S.customer}</th><th scope="col" className="hl end">{S.owes}</th><th scope="col" className="end">{S.since}</th></tr></thead>
    <tbody>
      {rows.map(c => (
        <tr key={c.id}>
          <th scope="row">{c.name}<span className="sub">{c.phoneLocal}</span></th>
          <td className="hl end" data-label={S.owes}><Money value={c.balance} tone="owed" /></td>
          <td className="end num" data-label={S.since}>{dayCount(c.unpaidDays, lang)}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```
`.stack-sm` turns each row into a framed card under 720px (row header = card title, each `td` shows its
`data-label`). Without it, wrap in `.grid-table-wrap` for an inner horizontal scroll — never let the page scroll.
Keep the sr-only data tables that back your charts.

### .row-list / .row-link — mobile rows
```jsx
<ul className="row-list">
  <li><Link className="row-link" to={…}>
    <Avatar name={c.name} />
    <span className="row-main"><span className="row-title">{c.name}</span><span className="row-meta">{S.since(d)}</span></span>
    <span className="row-end"><Money value={c.balance} tone="auto" /></span>
  </Link></li>
</ul>
```
`.row-link` works on `<a>`, `<Link>` and `<button>`; 64px tall, `--rule` dividers.

### Others
- `.banner` + tone `warn` · `info` · `danger` · `ok` · `sage`: framed notice. `<div className="banner warn" role="alert"><Icon name="alert" /><span className="banner-text">…</span><Button size="sm">…</Button></div>`
- `.empty` (EmptyState), `.skeleton`, `.spinner(.lg)`.
- `.status-pill` + `ok|wait|bad` with `<span className="status-dot" />` + word.
- `.nav-pill` (+ `.active` / `aria-current="page"` = ink).
- `.cluster` (wrapping row, gap 8) · `.stack` (column, gap 16) · `.stack-lg` (gap 32) · `.link-arrow` (text link + icon).
- `.kv`: `<dl className="kv"><dt>{S.phone}</dt><dd className="num">…</dd>…</dl>` — key/value rows with soft rules.
- `.wa-text` for WhatsApp-formatted bot replies (`whatsappHtml()` from lib/format).
- `.lang-switch` (LangSwitch), `.voice` / `.voice.reply` (VoiceNote), `.toast`, `.sheet*`, `.entry-*`, `.reminder-*`.

### Charts (inline SVG in a Frame)
```jsx
<svg className="chart" viewBox="0 0 640 240" role="img" aria-labelledby="flow-title">
  <g className="grid">{ticks.map(y => <line key={y} x1="40" x2="630" y1={y} y2={y} />)}</g>
  <path className="line owed" d={given} />
  {pts.map(p => <circle key={p.day} className="marker owed" cx={p.x} cy={p.y} r="5" />)}
  <text className="value" x={…} y={…}>Rs 1,200</text>
  <text x="40" y="236">12 Oct</text>
</svg>
<div className="sr-only">
  <table>
    <caption>{S.chartTitle}</caption>
    <thead><tr><th scope="col">{S.day}</th><th scope="col">{S.given}</th><th scope="col">{S.collected}</th></tr></thead>
    <tbody>{days.map(d => <tr key={d.day}><th scope="row">{d.label}</th><td>{money(d.given)}</td><td>{money(d.collected)}</td></tr>)}</tbody>
  </table>
</div>
```
Wrap the hidden table in a `div.sr-only` (a table box grows to fit its cells and ignores the 1px clip, which used to
widen the page on phones; `table.sr-only` is now patched in base.css, but the wrapper is the robust form).
Classes: `.grid` (soft gridlines), `.axis`, `text` (11px `--ink-3`), `text.value`, `.line` + `.owed|.paid`,
`.marker|.bar` + `.owed|.paid|.sage` (soft fill + darker 1px stroke). Legend via `Frame legend`.

## 8. Sheets, toasts, voice

```jsx
<Sheet open={open} onClose={close} title={S.title} description={S.desc} wide footer={<>
  <Button variant="ghost" onClick={close}>{C.cancel}</Button>
  <Button variant="primary" onClick={save}>{C.save}</Button></>}>…fields…</Sheet>

<ConfirmSheet open onClose onConfirm title description confirmLabel danger busy />

const toast = useToast(); toast.success(S.saved); toast.error(S.failed); toast.show(text)

<VoiceNote src={m.audioUrl} seconds={m.seconds} />          // the shopkeeper's note (sunk pill)
<VoiceNote src={m.replyAudioUrl} seconds={m.replySeconds} reply />   // Hisaab's reply (sage pill)
```
Sheets are square ink frames on desktop and bottom sheets (top hairline) under 720px. On desktop the frame is
anchored near the top (`clamp(24px, 10vh, 120px)`) and grows downward, scrolling inside itself past the viewport,
so its buttons don't move when the content changes height; the entrance animation plays once per open. Put
`data-autofocus` on the field that should get focus; if your content swaps out the focused control, move focus to
the next field yourself (EntrySheet does). `useModal(ref, open, onClose, { pickInitial })` gives any custom dialog
the same focus trap / Escape / scroll lock; give that dialog node `tabIndex={-1}` (Sheet and the public menu drawer
do) so a click on its static text keeps focus inside it.

`<EntrySheet open onClose customer? kind="credit|payment" onSaved />` and
`<ReminderSheet open onClose customer onChanged />` are ready-made; don't rebuild them.

## 8a. Lists, suppliers, sample data (`src/lib/lists.jsx`, `lib/lists.css`)

General is not a list row: it is everyone with `listId: null` (en "General", ur "عام کھاتہ"). A suppliers list holds
people the shop owes (balance > 0 = "you owe them").
- `const W = useListWords()` — shared words: `general`, `supplier(s)`, `customer`, `sample`, `youOwe`, `paidAhead`.
- `listName(list, lang, W)` (List or `null`/`{ name: null }` = General) · `personListName(customer, lang, W)`.
- `listHref(id)` → `/app/customers?list=<id|general>` (opens that list's tab) · `listParam(id)` · `pickerLists(lists)`
  (customers lists first, then suppliers lists — the order of every picker) · `isSupplier(person)`.
- `<ListChip person lang W />` — the person's list as a hairline pill; suppliers lists in the payable colour; renders
  nothing for General.
- `<SampleBadge W />` — sand "Sample" / "نمونہ" pill on demo data added from Settings.
- Classes: `.money.payable` / `.lst-payable` (payable text colour), `.lst-word` ("you owe" under an amount),
  `.lst-chip`, `.lst-sample`, `.lst-remind*` (remind-a-whole-list sheet rows).
```jsx
<Money value={s.balance} tone="payable" /> <span className="lst-word">{W.youOwe}</span>
<Link to={listHref(list.id)}>{listName(list, lang, W)}</Link> {list.sample && <SampleBadge W={W} />}
```

**Links to a section on another page** (`/app/settings#set-sample`): AppLayout scrolls to the top on every route
change, so the target page calls `useHashScroll()` (lib/useHashScroll.js) once at its top. It lands on the hash
after the shell's scroll, re-aims while data above the target loads, and stops when the person scrolls. Settings and
Help call it; add it to any page you link into with a hash. (Activity's `#msg-<id>` has its own handling.)

## 9. Shells (for reference — you don't render these)

- **AppLayout** (`/app/*`): sticky 64px header — compact wordmark · rule · shop name | centred nav pills (Today,
  Customers, Messages, Settings, Help; active = ink) | WhatsApp status pill (word hidden < 1200) · EN/اردو · account
  menu. Under 960: 56px bar (wordmark, shop, status dot, language) + fixed bottom tab bar. The shop name ellipsizes
  inside its own slot (`dir="auto"`, so a Latin name in the Urdu UI keeps its beginning); the tools never shrink.
  Main: max 1080 content. Provides `useMe()` and realtime.
- **PublicLayout** (`/`, `/privacy`, `/terms`): 64px ivory header (wordmark · section pills · EN/اردو · Log in ·
  Connect WhatsApp / Open my khata); under 900 a menu button opens a full-screen drawer. Main is full-bleed. Dark footer.
- **AuthLayout** (`/connect`, `/login`, `/welcome`): wordmark + language pill, one 560px column, Privacy · Terms footer.

## 10. Migration notes (old → new)

- `PageHeader subtitle` still works (= `lead`), but write a real serif lead from data.
- The sidebar, `.topbar`, `.shell`, `.public-nav`, `.public-footer`, `.auth-top`, `.logo-mark` are gone.
- `.panel`, `.banner`, sheets and tables are square now; buttons, badges, segmented, toasts are pills.
- `.ledger-table` headers are no longer uppercase-grey; they're sans 600 13px ink over an ink rule.
- `h1/h2/h3` are serif by default. Inside panels/frames use the shared head classes (they switch to sans 600).
