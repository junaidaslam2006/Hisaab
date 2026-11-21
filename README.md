# Hisaab حساب — the khata that lives in WhatsApp

A multi-shop SaaS for Pakistani shopkeepers. Each shopkeeper scans a QR with their own WhatsApp (like WhatsApp Web).
From then on, every voice note or text they send to **themselves** ("Message yourself" chat) — *"Umar ne 500 ka sauda
liya"*, *"Umar ne 300 wapis diye"* — is understood by Gemini, written into **their own** khata, and answered in the same
chat with an Urdu voice note and the new balance. Their personal dashboard shows who owes what, since when, and who to
chase, with WhatsApp reminders for customers.

## For the evaluation team (AI Innovation Challenge 2026)

**Team:** Hisaab labs · **Reference:** AIC26-6FC46BDA · **Stream:** Economy

**The problem.** Small shops in Pakistan sell on udhaar (credit) and keep it in a paper notebook. Totals go wrong,
payments are forgotten, and typing apps don't fit shopkeepers who are busy or cannot read and write comfortably.

**What Hisaab does.** The shopkeeper sends a WhatsApp voice note to his own chat, for example *"Ahmed ne aaj paanch sau
ka udhaar liya"*. Hisaab understands it with AI, writes it into his khata, updates the balance and replies in Urdu by
voice. No app to install, nothing to type. A web dashboard (Urdu and English) shows who owes what and prepares
payment reminders.

**Where the AI is.** `server/brain.js` and `server/liveparse.js` turn voice notes and texts (Urdu, English, Roman Urdu,
mixed) into ledger operations; `server/live.js` is the live voice call; `server/speech.js` makes the Urdu voice replies;
`eval/` is our test set (398 cases) and the scripts that score it. All arithmetic is done by code in `server/ledger.js`,
never by the model.

### Setup (5 minutes)

Needs **Node.js 22.13 or newer** and **ffmpeg** on PATH (or set `FFMPEG_PATH` / `FFPROBE_PATH` in `.env`).

```bash
npm install
cp .env.example .env        # then put a free Gemini key in GEMINI_API_KEY
npm run build
npm start
```

Open <http://localhost:3000>.

**Login:** there is no username or password. Click **Get started** and link a WhatsApp account by scanning the QR
(WhatsApp → Settings → Linked devices → Link a device), or choose *Link with phone number* and type the 8-character
code shown. The dashboard opens as soon as WhatsApp is linked. To see a full dashboard straight away, use
**Settings → Sample data**.

**Try it:** in WhatsApp, open your own chat ("Message yourself") and send a voice note or text such as
`Umar ne 500 ka sauda liya`, then `Umar ne 300 wapis diye`, then `Umar ka hisaab batao`.

## Run it

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000 → **Get started** → scan the QR with WhatsApp (Settings → Linked devices → Link a device).

`.env` needs one value, a **free** Gemini API key from <https://aistudio.google.com/apikey> (no billing, no credits):

```
GEMINI_API_KEY=your-key-from-aistudio.google.com
```

Optional: `UPLIFT_API_KEY` (Pakistani Urdu voice), `PUBLIC_URL` (see below), `DAILY_MESSAGE_LIMIT` (default 300 per shop
per day), `PORT` (default 3000), `TTS_ORDER` (default `uplift,edge,gemini`), `TRUST_PROXY` (default `loopback`: only a
proxy on this machine — cloudflared, nginx — may set the client IP used for rate limits; set a hop count or subnet if
your proxy runs elsewhere), `VITE_SUPPORT_EMAIL` (the contact address shown on the Privacy and Terms pages — set it,
then run `npm run build` again).

Design: the UI follows a "launch post" editorial system — see `web/DESIGN.md` (rules and tokens) and
`web/COMPONENTS.md` (building blocks for new pages).

Shopkeepers can link by **scanning a QR** (from a computer or second phone) or, on a single phone, by **phone number**:
Hisaab shows an 8-character code they type in WhatsApp → Linked devices → Link a device → *Link with phone number instead*.

## Gemini on the free tier

Hisaab is built to run on the free Gemini API tier. Messages are understood through **Gemini Live**, which showed no
daily cap on the free key; the small daily caps of the other models are spent on photos, on every voice note of 30 s
or more (from `LONG_NOTE_SECONDS` the backup starts together with Live), and on the rare message Live cannot answer in
time. Eval numbers: `eval/README.md`, "Free tier".

| Job | Default models, in order | Change with |
|---|---|---|
| Text messages | Live: `gemini-2.5-flash-native-audio-latest` → `gemini-3.8-live` → `gemini-3.1-flash-live-preview` | `LIVE_TEXT_MODELS` (empty = same order as voice notes) |
| Voice notes | Live: `gemini-3.8-live` → `gemini-3.1-flash-live-preview` → `gemini-2.5-flash-native-audio-latest` | `LIVE_PARSE_MODELS` |
| Photos, and the backup when Live is slower than 5 s / 6 s or fails, and from the start for voice notes of 30 s or more | `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3.1-flash-lite-preview` (500 requests a day each on the free tier) | `PARSE_MODELS`, `PARSE_FALLBACK_MODELS`, `PARSE_HEDGE_MS`, `VOICE_HEDGE_MS`, `LONG_NOTE_SECONDS` |
| Live call (Talk to Hisaab) | `gemini-3.1-flash-live-preview`, then `gemini-2.5-flash-native-audio-preview-09-2025`, `-latest`, `-preview-12-2025`, then `LIVE_MODEL` | `LIVE_CALL_MODEL`, `LIVE_FALLBACK_MODELS`, `LIVE_MODEL` |
| Voice replies | Microsoft Edge Urdu voice → Gemini TTS (10 replies a day per model on the free tier) | `TTS_ORDER`, `EDGE_VOICE`, `GEMINI_TTS_MODEL` |

- **Native dialogue as the call's voice:** `LIVE_CALL_MODEL=gemini-2.5-flash-native-audio-preview-09-2025`. Measured
  on 31 Oct: 92.3% right entries against 97.1% for the default, median 2.9 s against 2.2 s to the first word.
  `LIVE_AFFECTIVE=1` turns on affective dialog for native-audio models (v1alpha API); `LIVE_NATIVE_THINKING_BUDGET=<n>|auto`
  sets their thinking.
- **Texts back to 3.8-live first:** `LIVE_TEXT_MODELS=` (empty).
- **Free-tier limits** count per Google Cloud project, not per key, and the daily caps reset at midnight US Pacific:
  12:00 Pakistan time while the US is on daylight time, 13:00 after its clocks go back (1 Nov 2026).
  `LIVE_PARSE_CONCURRENCY` (default 4) caps the Live sessions held for messages, leaving room for one live call.
- Every model change needs a server restart. The system check (Settings) shows which model answered each part.

## Letting early users in

Shopkeepers only need WhatsApp — but login links and the dashboard must be reachable from their phones.

**Quickest (free, from this laptop):** Cloudflare quick tunnel.

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the `https://….trycloudflare.com` address it prints into `.env` as `PUBLIC_URL=...` and restart `npm start`.
The laptop must stay on and online. The address changes each time you restart the tunnel.

**For a real pilot:** run it on a small always-on server (any VPS with Node 22+ and ffmpeg), behind HTTPS, with
`PUBLIC_URL` set to your domain. Keep the `data/` folder on a persistent disk and back it up — it holds every shop's
database (`data/hisaab.db`), WhatsApp sessions (`data/wa/`) and voice notes (`data/media/`). The database backs
itself up (next section); point `BACKUP_DIR` at a disk that is not the server's own.

## Backups, restore and metrics

**Automatic backups.** The server copies the database (`data/hisaab.db`) when it starts and then every 6 hours, with
SQLite's `VACUUM INTO`: a consistent copy, made while the server keeps running. It skips the start-up copy when the
newest one is less than 30 minutes old (it checks every 10 minutes, so a restart or a laptop that slept does not
reset the 6 hours). Each copy must pass SQLite's `quick_check` before it is kept, and is written to a temporary name
first, then renamed.

- **Where:** `data/backups/`, or the folder in `BACKUP_DIR` in `.env`, for example a USB drive or a folder that
  OneDrive or Google Drive syncs, so one copy lives off the laptop: `BACKUP_DIR=D:/OneDrive/HisaabBackups` (forward
  slashes, no quotes). Hisaab never creates `BACKUP_DIR`: if the drive is unplugged or the path is wrong, the backup
  fails and the system check says so. Inside it, each data folder gets its own subfolder, `hisaab-` plus 8 characters
  made from the data folder's path (for example `HisaabBackups/hisaab-3f9a01c2/`). So a restored copy or a
  test server that loads the same `.env` never mixes with, ages or deletes the real server's backups. `backup-now`
  and the system check print the full folder. Restart the server after changing `.env`.
- **A cloud folder needs `BACKUP_KEY`.** Each backup holds every shop's khata: names, phone numbers, amounts,
  transcripts and payment details. Without `BACKUP_KEY` it sits unencrypted with OneDrive or Google Drive. So set
  `BACKUP_KEY` whenever `BACKUP_DIR` is a synced folder.
- **Kept:** the newest 8 (two days at 6 hours), plus the newest one of each day for the last 14 days, in Pakistan
  time: about 20 files at most. Older ones are deleted. Only files named like `hisaab-2026-11-01_07-40-12.db` (or
  `.db.enc`) are ever deleted. Each file is about the size of the database. Old files are deleted only when a new
  backup is made, so this holds while the server runs.
- **A deleted account stays in the backups** made before it was deleted, until they are deleted: up to 14 days.
  Settings → Delete account does not touch the backups.
- **Encryption:** set `BACKUP_KEY` to 32 random bytes, as 64 hex characters (or base64). One way to make one:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Backups are then AES-256-GCM files
  ending in `.db.enc`. It is optional for `data/backups/` and a USB drive, and needed for a cloud folder (above). Keep
  the key somewhere other than the laptop, such as a password manager: without it a `.db.enc` file cannot be
  restored. The key is never logged.
- **Not in a backup:** `data/wa/` (the WhatsApp logins: after a restore each shop links again by QR) and
  `data/media/` (the audio of voice notes and the photos; the entries, transcripts and replies are in the database).
- **Check it:** Settings → System check, in a browser on the server's own computer (`http://localhost:3000`). The
  Database row ends with the last backup's time, size, how many are kept and where. When the last backup is older
  than 7 hours, or failed, it says so plainly (the row stays OK, because the khata itself works). Every other shop,
  and any browser that comes through the network or a tunnel, sees only "Backups OK" or "Backups are late" with the
  time: no folder, size, count or commands.
- **Measured on 31 Oct**, on a test database of 50 shops, 15,000 customers, 150,000 entries and 150,000 messages
  (103.7 MB): one backup took 2.1–3.3 s (2.7–3.3 s encrypted; 2.8–4.1 s in a server that was starting up) and was
  100.7 MB. Restoring it took 7–8 s. The backup runs in a worker thread, so the server kept answering: its slowest
  answer during a backup was 17 ms (4 ms without one), apart from the first request after a start, which took
  140–190 ms with or without a backup. The same `VACUUM INTO` on the server's own thread would have stopped it for
  1.5–2.2 s.

**One backup now**, for example the night before a demo. Safe while the server runs; it uses the same
`HISAAB_DATA_DIR`, `BACKUP_DIR` and `BACKUP_KEY`:

```bash
node scripts/backup-now.mjs
```

**Restore** into a new, empty folder (it refuses a folder with anything in it, so nothing is overwritten). It decrypts
with `BACKUP_KEY` when the file is `.db.enc`, runs `PRAGMA integrity_check`, writes `hisaab.db`, and prints the rows
per table, the newest entry and the exact command to start a server on it. That command blanks `BACKUP_DIR`, so
the restored copy keeps its own backups in its own data folder:

```bash
node scripts/restore.mjs data/backups/hisaab-2026-11-01_07-40-12.db C:/hisaab-restored
```

A wrong key, a damaged file or a file that is not a Hisaab database stops the restore with a plain message, and
nothing is left behind.

**Metrics** for a traction slide. Read-only (it opens the database with `readOnly: true`), so it is safe while the
server runs:

```bash
node scripts/metrics.mjs --exclude 03001234567          # your own demo shop's WhatsApp number
node scripts/metrics.mjs --since 2026-11-01 --json      # from 1 Nov, 00:00 Pakistan time; as JSON
```

- It always leaves out sample data (people with `customers.sample = 1`, their entries, and entries with source
  `sample`) and the shops given in `--exclude` or `METRICS_EXCLUDE` (comma-separated numbers). It prints what it left
  out (a phone number shows only its first and last 4 digits).
- It reports, stamped with the run time in Pakistan time: shops, shops linked to WhatsApp, shops with a real entry, in
  the last 24 hours and 7 days, and on 2 or more days; entries by how they came in (`entries.source`:
  `whatsapp_voice` and `web_voice` = voice notes, `whatsapp_text` and `web_text` = texts, `whatsapp_photo` and
  `web_photo` = photos, `call` = the live call, `web` = the dashboard form); the share from voice notes; rupees of
  udhaar recorded and repaid (and supplier amounts apart); customers who owe now; Gemini's understanding time
  (`messages.ms`, median and 90th percentile); voided entries as a share of entries (an accuracy proxy); and messages
  that ended in an error, by code.
- `messages.ms` is the time from the start of understanding to Gemini's answer. The full time to the WhatsApp reply
  is not stored, so the script does not claim it.
- `--data <dir>` reads another data folder (default: `HISAAB_DATA_DIR`, else `data/`).

## Before real customers' data goes in

- **What the free tier means for real data.** Google's terms for its unpaid services (<https://ai.google.dev/gemini-api/terms>)
  say Google uses what is sent to improve its products, human reviewers may read it, and developers should not send
  sensitive, confidential or personal information. Real shops send real customer names and amounts. The Privacy page
  (`/privacy`, section 3) tells every shop this in English and Urdu, and asks them to say only what the khata needs.
  For reference: on Google's paid tier its terms say prompts are not used to improve its products and are logged
  only for a limited time to detect abuse; on the paid tier a message costs about Rs 0.6–2.8 (from measured token
  counts). Hisaab runs on the free tier, and the demo and sample data need nothing else.
- **Fill in the contact line** on `/privacy` and `/terms` (search for "add your support email").
- **WhatsApp linking is unofficial** (WhatsApp Web protocol via Baileys). Hisaab only replies inside each owner's own
  self chat and never messages customers, which keeps risk low — but say so to pilot users. The production path is the
  official WhatsApp Cloud API.

## How it is built

| Part | Where |
|---|---|
| Server, routes, WebSockets | `server/index.js` |
| One WhatsApp connection per shop, QR linking, self-chat only | `server/whatsapp/manager.js` |
| Message pipeline (per-shop ordering, daily limit, voice reply) | `server/pipeline.js` |
| Gemini: voice/text → ledger operations (JSON schema) | `server/brain.js` |
| Ledger: balances, matching names, merge, export (all maths in code) | `server/ledger.js` |
| WhatsApp reply text + reminder messages | `server/replies.js` |
| Voice replies (Uplift → Edge → Gemini TTS, Ogg/Opus) | `server/speech.js` |
| Passwordless auth (QR, WhatsApp code, one-time link) | `server/auth.js` |
| SQLite schema (built-in `node:sqlite`) | `server/db.js` |
| Backups (VACUUM INTO, retention, optional AES-256-GCM) | `server/backup.js`, `scripts/backup-now.mjs`, `scripts/restore.mjs` |
| Read-only traction numbers | `scripts/metrics.mjs` |
| Live voice call (Gemini Live, tool calls into the ledger) | `server/live.js` |
| Web app (React + Vite), design system | `web/` — see `web/DESIGN.md`, `web/API.md` |

### What a shopkeeper can say (WhatsApp, to themselves)
`Umar ne 500 ka sauda liya` · `Umar ne 300 wapis diye` · `Umar ka hisaab batao` · `Kis kis ka udhaar 1000 se zyada hai?`
· `Umar ka number 0300 1234567` · `Umar ko reminder bhejo` · `undo` · `help` · `dashboard` (login link).
Urdu, English and Urdu-English mixes work (Pashto and Punjabi are in beta); spoken amounts like *dhai sau* (250) are
understood.
