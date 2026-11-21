# Hisaab understanding eval

Measures how well `server/brain.js` (generateContent) and `server/liveparse.js` (Gemini Live) turn a shopkeeper's
message into ledger operations, the way shopkeepers really talk: Urdu, English and Urdu+English in one sentence.

## Files
| File | What it is |
|---|---|
| `cases.json` | 281 text cases + 117 audio cases, two rosters (`shop`: 21 people in General, 4 customer lists and a suppliers list; `new_shop`: empty) |
| `trades.json` | trade phrases (see "Trades" below): 60 text + 30 voice cases, `cat` = the trade, `forms` = what each phrase tests; rosters `shop` and `wholesaler` (shops as customers, 3 suppliers). Run with `--cases eval/trades.json` |
| `run.mjs` | Runs a set of cases through one path and scores them (optionally several times each, `--repeat`); writes a JSON report |
| `score.mjs` | Exact-op scoring, false writes, must-not rules (customer resolution mirrors `ledger.matchCustomer`) |
| `audio.mjs` | Synthesises the audio cases with Edge neural voices into WhatsApp-like Ogg/Opus voice notes (cached) |
| `overload-test.mjs` | Injects 503s, hangs, per-minute 429s (Google's real text) / per-day 429s, auth errors, Live quota closes, partial Live answers, caller aborts and a failure after the ledger write into the real `understand()` and pipeline (no network); free tier: every generateContent model capped, Live quota rotation, the Live session bound when nothing answers, Live slots, the native-audio profile and its malformed tool calls; the live call's model chain and its system-check probe (server/live.js) |

## Categories
`urdu_script`, `roman_urdu`, `english`, `code_mixed`, `numbers` (5k, 1.5k, 2 lakh, fifteen hundred, dhai sau, dedh hazaar,
sawa / paune / saadhe, "2 hazaar 500", "ek hazaar paanch sau"…), `multi_entry` (2–6 people, credits and payments mixed,
bare "Umar 500, Ahmed 300…" lists), `long_note` (audio only: 43 s / 14 entries and 63 s / 20 entries in one voice
note), `questions`, `undo_correct`, `reminders`, `set_phone`, `lists` (create_list, move_to_list, moving someone back
to General, lists_summary, a new person into a list, scoped dues/total/reminder), `suppliers` (purchase,
supplier_payment, what the shop owes), `pashto`, `punjabi`, `hindko`, `chitchat_unclear` (promises like "kal paise de
dega" must write nothing), `noisy` (fillers and self-corrections), `honorifics` (bhai / sahab / baji / aliases, and
Umair ≠ Umar).

Audio voices: `ur-PK-AsadNeural` / `ur-PK-UzmaNeural` (Urdu and code-mixed: Urdu script with English words left in
Latin), `en-IN-PrabhatNeural` / `en-IN-NeerjaNeural` (English and Roman-Urdu-heavy lines), `ps-AF-GulNawazNeural` /
`ps-AF-LatifaNeural` (Pashto). `noisy` audio is mixed with pink noise. Synthetic voices are cleaner than a real shop,
so audio numbers are an upper bound for clean speech, not a promise for a noisy bazaar.

## Scoring
A case passes only when the predicted operations equal the expected ones exactly (order-free): type, the person
(the id, or for a new person a name the ledger would not merge into someone else), amount, full settlement,
threshold, phone, list name / kind where relevant, and no extra operation. A greeting next to real work is ignored.
`chitchat_unclear` cases pass only if nothing but chitchat / unclear / help comes back. A **false write** is a
predicted write (credit, payment, purchase, supplier_payment, undo, correct, set_phone, create_list, move_to_list)
that matches no expected operation.

**There is no true held-out set.** 20% of the cases (chosen by a hash of the case id, `heldout` in the JSON reports)
form a *dev-adjacent* split, and its scores do not measure generalisation: some of its sentences are quoted in the
prompt ("show my lists"; "Teachers list mein naya khata Sir Adeel ka…" ≈ li12), its misses in the first runs were
answered with prompt rules (e.g. "zar rupay alone = 1000" after a_ps02), and 39 of its 60 cases have a dev case with
identical expected operations (a_ps02 is the same sentence as text ps02). Do not quote it as "held-out accuracy".
Since 31 Oct `run.mjs` prints only its counts, not which of its cases failed. A real held-out set needs material from
outside this team: the founder's and shopkeepers' own voice notes and phrases written by someone who has not seen the
prompt, split by sentence (not by id).

Models are not deterministic, so `--repeat n` runs every case n times and also reports, per category, how many cases
passed **every** run (a case that passes 2 of 3 times is flaky, not fine).

## Running
```sh
# keep the eval away from the real data/ folder; reports and the audio cache go to scratch folders
set HISAAB_DATA_DIR=<scratch>/data-eval
set HISAAB_EVAL_OUT=<scratch>/eval-results
set HISAAB_EVAL_AUDIO=<scratch>/eval-audio

node eval/run.mjs --set text  --path generate --models gemini-3.5-flash-lite
node eval/run.mjs --set audio --path live     --models gemini-3.8-live,gemini-3.1-flash-live-preview --concurrency 2
node eval/run.mjs --set all   --path prod     --concurrency 2     # the production understand() with hedging
node eval/run.mjs --set audio --path prod     --cat pashto --repeat 3   # how many cases pass every time
node eval/overload-test.mjs
```
Options: `--split dev|heldout`, `--cat a,b`, `--ids a,b`, `--limit n`, `--repeat n`, `--rpm n` (per-model pacing, default 12/min),
`--concurrency n` (default 4; keep ≤ 4 against Google), `--opt key=value` (e.g. `--opt thinking=minimal`),
`--brain <file>` (score another brain module, e.g. a copy of the old prompt), `--cases <file>` (another case file in the
same format, default `eval/cases.json`), `--no-generate` (prod path: every generateContent call fails at once without a
request, as when every generateContent model is at its daily cap, so answers come from the Live lane and no daily-capped
request is spent), `--max-live n` (never open more than n Live sessions; cases not started are reported as `eval_budget`).
The report's `usage` field counts the Live sessions the run opened. A case may have `alt`: other operation lists that leave
the ledger in the same state (it passes if `expect` or any `alt` matches). Latency (`ms`) is one call to the model or to
`understand()`, without the `--rpm` pacing wait (until 31 Oct evening the prod path also counted that wait when `--rpm`
was set; by default the prod path has no pacing).
Every result is appended to `<label>-<time>.partial.jsonl` as it lands, so a run stopped by a quota still has numbers.

## Free-tier quotas (measured 31 Oct 2026 on the project's key)
- `gemini-3.5-flash-lite`: 15 requests / minute and **500 / day**; `gemini-flash-lite-latest` shares the same bucket.
  `gemini-3.1-flash-lite` and `gemini-3.1-flash-lite-preview`: also 500 / day each. All four were used up by testing on 31 Oct.
- `gemini-3.8-flash`, `3.7-flash`, `3.6-flash`, `3.5-flash`, `gemini-flash-latest`, `gemini-3-flash-preview`: **20 requests / day**
  each — useless as a backup on the free tier (exhausted within minutes).
- `gemini-2.5-flash`, `gemini-2.5-flash-lite`: 404 "no longer available to new users".
- Gemini Live: no daily cap seen in ~1,000 sessions, but a per-minute limit — sessions close with
  "1011 You exceeded your current quota" in short bursts at ~25 sessions/minute (all agents together).
- The daily caps reset at midnight Pacific: **12:00 PKT on Sun 1 Nov 2026**, and **13:00 PKT from Mon 2 Nov** (US
  daylight saving ends on 1 Nov). Testing on the morning of the pitch (Mon 2 Nov, before 13:00 PKT) spends the same
  day's quota as a pitch held before 13:00.
`brain.js` remembers a model that hit a cap (per-day: re-checked after 15 min; per-minute: Google's "retry in Ns";
Live quota close: 30 s) and goes straight to the next model or lane. A per-minute 429 is always a wait-and-retry, even
though Google's text says "please check your plan and billing details" (before 31 Oct that word made it look like a
bad key: photos then failed at once as `ai_config`). When every model of a lane is cooling down, the next lane is asked
at once instead of after the hedge delay.

## Free tier (31 Oct 2026, evening)
Hisaab runs on a **free** Gemini API key; nothing in understanding needs a paid key. What "free" costs, measured on the
project's key: per-model daily caps on generateContent (see above), a per-minute limit on new Live sessions, no
measured limit on Live sessions open at once up to 5 (below), and Google may use free-tier prompts and answers to
improve its products.

**Design:** voice notes and texts go to **Gemini Live** first (no daily cap seen), and the small generateContent caps
are only spent on photos, on the rare slow Live answer (the hedge) and when Live fails.

### Gemini 2.5 Flash Native Audio ("native dialogue") as the parser
On 31 Oct morning it scored 0/15 (empty operations, 1011 closes, ~50 s per note). Probe (`na-probe`, one Live session
per experiment, every server message logged; 26 sessions for this table, 8 more for the malformed calls below):

| Experiment (gemini-2.5-flash-native-audio-latest unless noted) | Result |
|---|---|
| liveparse.js as it was: tool declared with `parametersJsonSchema` — voice note a_cm01 on `-latest`, `-preview-12-2025`, `-preview-09-2025`; text cm01 | **all 4 closed `1011 Internal error occurred`** 2–8 s in, right after the model's thought "now creating the operation" (it had the right answer: credit, Umar, 500) |
| the same with a flatter schema (no null unions, only `type` required), with operations as one JSON string, with thinking off, with a short prompt | all 4 closed 1011 — the schema *form*, not its shape, size, thinking or prompt |
| `parametersJsonSchema` on API v1alpha | no crash, but the schema is ignored: `operations` came back as JSON strings with an `operation` key instead of `type`, so `clean()` kept nothing — the "transcript but empty operations" of the morning run |
| **tool declared with `parameters` (OpenAPI `Type` schema, `nullable`)** | **tool called correctly on all 3 models**, text and voice (a_cm01, a_us01, a_me01 with 3 entries): 15 of 15 probe sessions with a normal turn, 0 crashes |
| thinking off (`thinkingBudget: 0`) vs default | text 1.6 s vs 4.0 s to the tool call; voice note 6.2–7.4 s vs 7.8–8.0 s |
| audio streamed in real time instead of one burst / automatic VAD instead of activityStart/End | 12.3 s (needed the nudge) / 7.7 s — the burst with manual activity markers stays fastest |
| text via `sendRealtimeInput({text})` with manual VAD | no answer in 45 s (no turn is ever opened) — keep `sendClientContent` |
| `responseModalities: [TEXT]` | refused: `1007 ... response modalities (TEXT) is not supported` (the model speaks after the tool call; harmless) |

**Cause:** the native-audio models crash (v1beta) or ignore the tool (v1alpha) when its schema is given as
`parametersJsonSchema`. **Fix** (`server/liveparse.js` `liveProfile()`): models matching `/native-audio/` get the same
schema converted to OpenAPI `parameters` and `thinkingBudget: 0`; every other Live model is unchanged.

**Second failure, found in the first sample run:** with the fix, 2/20 texts on `-latest` and 7/50 cases on
`-preview-12-2025` still came back "empty". The logged arguments were not empty but malformed: keys wrapped in quote
characters (`{"\"type\"": "dues_list"}`, `"operations\""`) or each operation sent as a JSON string. `clean()`
(`server/brain.js`) now strips such quotes from keys and parses operations sent as JSON strings (a no-op for
well-formed output); a native-audio call with neither operations nor a transcript counts as a failed attempt (retried
in a new session or answered by generateContent) instead of a "samajh nahi aaya" reply. Handing the call back in the
same session ("operations was empty, call again") was tried and dropped: one session closed 1011 right after it, the
other repeated the same malformed keys.

**Sample** (`--path live`, one model each, `--rpm 6 --concurrency 2`): 30 voice notes (urdu_script 5, code_mixed 7,
multi_entry 5, english 4, numbers 4, roman_urdu 2, chitchat_unclear 3) + 20 texts (urdu_script 3, code_mixed 4,
multi_entry 3, english 3, numbers 3, roman_urdu 2, chitchat_unclear 2), picked by a hash of the id. 3.8-live and
3.1-flash-live were **not re-run**: their rows are the same case ids taken from the morning reports (voice notes on
3.8-live from the v1 run with the earlier prompt; 3.1-flash-live has no text run of its own, only the 10 of these 20
texts it answered in the "Final" production run). "Over hedge" = answers slower than `VOICE_HEDGE_MS` (6 s) /
`PARSE_HEDGE_MS` (5 s), i.e. a generateContent request the hedge would spend if that model led the lane.

| Live model (profile) | Voice notes | Texts | All | False writes | Voice p50 / p95 | Text p50 / p95 | Failed attempts | Over hedge (voice / text) |
|---|---|---|---|---|---|---|---|---|
| gemini-3.8-live (morning reports) | 28/30 | 20/20 | **48/50 (96%)** | 1 | 3.7 / 5.9 s | 2.9 / 4.3 s | 0 | 1/30 / 0/20 |
| gemini-3.1-flash-live-preview (morning reports) | 29/30 | 10/10 (prod run) | 39/40 | 0 | 3.7 / 5.6 s | 1.8 / 2.7 s | 0 | 1/30 / 0/10 |
| 2.5-flash-native-audio-latest, OpenAPI + thinking 0 | 30/30 | 18/20 | 48/50 (96%) | 0 | 6.5 / 9.3 s | 1.7 / 3.6 s | 10 (all 1011 Internal error) | 19/30 / 0/20 |
| **2.5-flash-native-audio-latest, shipped** (+ malformed-call repair) | **30/30** | **20/20** | **50/50 (100%)** | **0** | 6.2 / 10.1 s | **1.8 / 2.8 s** | 1 (1011 Internal error) | 17/30 / 0/20 |
| 2.5-flash-native-audio-preview-12-2025, OpenAPI + thinking 0 | 28/30 | 15/20 (1 error) | 43/50 (86%) | 0 | 6.1 / 9.2 s | 1.6 / 2.8 s | 8 | – |
| 2.5-flash-native-audio-preview-12-2025, shipped | 30/30 | 18/20 (2 errors: 1011 four times) | 48/50 (96%) | 0 | 6.9 / 11.3 s | 1.8 / 3.2 s | 9 | 28/30 / 0/18 |
| 2.5-flash-native-audio-preview-09-2025, shipped | 0/6 (no retries, 15:35 UTC) | 2/7 (stopped) | 2/13 | 0 | – | 2.2–2.4 s | 20 of 22 text sessions + 6 of 6 voice sessions closed 1011 | – |

A no-retry recheck of `-latest` right after (15:36 UTC, 8 texts + 4 voice notes picked from the earlier misses):
10/12 answered and all 10 right; 2 multi-entry texts closed 1011. "1011 Internal error" on native audio comes and
goes and hits multi-entry messages most.

3.8-live's misses: a_cm14 ("who all owe more than 2000? list bhejo" heard as a Factory Wale reminder) and a_en10 (the
new customer Daniyal's credit scored as a wrong-person write: its one false write). 3.1-flash-live missed a_cm14 too.
Native audio got both right in both of its `-latest` runs.

### Lane order (decided by the sample)
Rule: a native-audio model joins the Live lane at ≥ 90% on the sample with no extra false writes, and may lead only if
it is at least as accurate as gemini-3.8-live; the founder's preference for native audio breaks ties, never at the
cost of accuracy.
- `gemini-2.5-flash-native-audio-latest`: 50/50, 0 false writes (3.8-live: 48/50, 1) → joins both lanes, may lead.
- **Texts** (`LIVE_TEXT_MODELS`): `gemini-2.5-flash-native-audio-latest` → `gemini-3.8-live` → `gemini-3.1-flash-live-preview`.
  20/20 for both, so the founder's preference decides; it is also faster (p50 1.8 s vs 2.9 s) and never slower than the
  5 s hedge, so it costs no generateContent requests. When it closes 1011 (2 of 12 texts in the recheck), the Live
  lane asks gemini-3.8-live at once, still inside the hedge delay.
- **Voice notes** (`LIVE_PARSE_MODELS`): `gemini-3.8-live` → `gemini-3.1-flash-live-preview` → `gemini-2.5-flash-native-audio-latest`.
  Native audio was as accurate (30/30 vs 28/30) but slower on voice notes:
  p50 6.2 s vs 3.7 s, p95 10.1 s vs 5.9 s, and 17 of 30 notes took longer than the 6 s hedge — leading, it would spend a
  free generateContent request on more than half of all voice notes. As the third model it is one more Live model to
  ask when 3.8-live and 3.1-flash-live fail. Whether that also gives a third Live quota bucket is not measured: the
  code assumes the free tier's per-minute Live limit is counted per model, but it may be per key or project, and then
  a quota close on one Live model means the others are closed too.
- `-preview-12-2025`: 86% with the first fix, 96% shipped, but 2 messages failed outright (1011 on every try), 9 failed
  attempts, and the slowest voice notes (p50 6.9 s): not used. `-preview-09-2025`: nearly every session closed "1011
  Internal error occurred" in the evening (20 of 22 text sessions, then 6 of 6 voice notes): not used.

Caveats: 50 cases; 1–2 cases are within noise. The 3.8-live / 3.1-flash-live rows are morning numbers (voice notes on
3.8-live with an earlier prompt), not a same-hour re-run. Native audio's "1011 Internal error" rate changed between
runs an hour apart (10 in ~60 sessions, then 1 in 51, then 2 in 12), so a 1011 sends the message to the next Live
model at once and two other Live models stay behind it for texts.

### Gemini Live limits on the free key (measured 31 Oct evening)
- **Sessions open at once:** 1, 2, 3, 4 and 5 simultaneous `gemini-3.8-live` sessions (15 sessions, paced): all 15
  accepted and answered, no refusal (other agents and the founder's server were using the same key at the time). More
  than 5 was not measured. `LIVE_PARSE_CONCURRENCY` (default 4) caps the Live parse sessions this server holds at once,
  so with one live call (`server/live.js`, which holds a session for the whole call) the server stays within the 5
  measured; a message over the cap waits up to `LIVE_SLOT_WAIT_MS` (8 s) for a slot, then generateContent answers it.
- **New sessions per minute:** "1011 You exceeded your current quota" in short bursts at ~25 sessions/minute (all
  agents together, measured earlier on 31 Oct). Such a close puts that Live model in a 30 s cool-down and the next Live
  model is asked at once (overload test: 48 ms after the close, no backoff). This assumes the limit is counted per
  model; that is **not measured** (it may be per key or project, and then the next Live model is refused too).
- **Daily cap:** none seen on Live: ~1,000 sessions in the morning and several hundred more in the evening runs on 31 Oct.
- **"1011 Internal error occurred"** is a different close (not quota): seen on the native-audio models in 10 of ~60
  sessions on `-latest` and 8 on `-preview-12-2025` during the first sample runs; the morning voice-note runs on
  3.8-live and 3.1-flash-live had 0 failed attempts in 228 sessions (the 3.8-live text run retried 7 of 278, cause not
  recorded). The Live lane then asks its next Live model at once (see below).

### What happens when a free cap is hit (`eval/overload-test.mjs`, no network: 83/83 pass)
| Situation | Behaviour |
|---|---|
| every generateContent model at its daily cap | texts and voice notes answered by Live, no "busy"; each capped model asked at most once, then skipped (cool-down) by the next message; the pipeline writes the entry with a normal reply |
| Live quota close on the first Live model | next Live model asked at once (no backoff); the closed one is skipped by the next message |
| a Live session dropped / "1011 Internal error" | the Live lane's first round asks its next untried Live model at once and hands over to generateContent only after every Live model of that round failed (or at the hedge delay): a flaky Live model no longer spends a daily-capped generateContent request when the next Live model answers in time |
| nothing can answer (every Live model failing, every generateContent model capped) | after that first round every Live attempt waits its backoff (1, 2, 4, 8 s): one message opens 15 Live sessions in the 90 s patience, 12 in the first minute (before this fix: 39 and 30, a whole round per backoff step); the hedge timer never starts a second retry loop on a lane already in its backoff |
| every Live model quota-closed **and** every generateContent model capped | only then "busy" ("ek minute baad dobara bhejein") |
| more messages at once than `LIVE_PARSE_CONCURRENCY` | they take the slots in turn (never more sessions open than the cap); a message that cannot get one in `LIVE_SLOT_WAIT_MS` is answered by generateContent |

**Real check on an isolated server** (port 3121, fresh data dir, `PARSE_MODELS=gemini-3.7-flash`,
`PARSE_FALLBACK_MODELS=gemini-3.5-flash` — both answered `429 ... GenerateRequestsPerDayPerProjectPerModel-FreeTier`
today — and the hedge at 200 ms so generateContent would be asked at once): the boot check reported ready through
Live; a text "Umar ne 500 ka saman liya aur Ahmed ne 300 wapis kiye" was written by gemini-2.5-flash-native-audio-latest
(2.6 s, credit + payment), a 3-entry voice note (a_me01) by gemini-3.8-live (5.9 s, 3 credits). Both done with normal
replies, no "busy", and neither capped model was asked again after the boot check (cooling down).

**Daily caps are not wasted by the hedge or the boot check.** In the morning runs Live answered later than the hedge
delay on 2/114 voice notes (3.8-live) and 2/114 (3.1-flash-live) after 6 s, and 1/278 texts after 5 s, so the hedge
spends a generateContent request on ~1–2% of messages (7% of voice notes and 4% of texts in the "Final" run, when
other agents were loading the key; plus every message where Live fails, and every voice note of 30 s or more, by
design). Native audio leading the texts keeps that: 0/20 texts slower than 5 s. Leading the voice notes it would not
(17/30 slower than 6 s), which is one reason it is third there. The boot check costs one Live session and one
generateContent request per server start (a capped model's 429 costs nothing). No hedge or boot change was needed.

## Results (31 Oct 2026)
Exact-op accuracy. "dev / dev-adj." = the 80 / 20 id-hash split (the 20% is dev-adjacent, not held-out: see Scoring).
Latency = one successful call (production row: whole `understand()`). The "Before" and "After" tables were measured
before the 31 Oct review fixes (the v3 production run finished at 14:05 PKT, brain.js was edited again at 14:09);
"Final" below is the re-run on the final code.

### Before: the original prompt on generateContent
| Model | Set | Accuracy | dev / dev-adj. | p50 / p95 | False writes | Notes |
|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite | text | **83.1%** (217/261) | 83.0 / 83.7 | 2.8 s / 8.2 s | 18 (1 on chitchat) | 17 cases (honorifics, part of noisy) not run: daily cap hit. lists 0/22, suppliers 2/15, chitchat 13/18, noisy 4/6, multi 21/22, code_mixed 30/30 |
| gemini-3-flash-preview | text | 17/22 | – | 2.7 s | – | then 20/day cap |
| gemini-3.1-flash-lite | text | 19/19 | – | 7.1 s | – | constant 503 "high demand", 50–120 s per case with retries; stopped |
| 3.8-flash / 3.7-flash / 3.5-flash | text | – | – | – | – | 20/day cap reached after a handful of calls (and 503s / 35 s timeouts) |
| gemini-2.5-flash | text | – | – | – | – | 404 no longer available |
| any | audio | – | – | – | – | not measurable on 31 Oct: every generateContent model was at its daily cap |

### After: new prompt / schema (lists, suppliers, code-mixed, number forms, self-corrections, Pashto)
| Path / model | Set | Accuracy | dev / dev-adj. | p50 / p95 | False writes |
|---|---|---|---|---|---|
| Live gemini-3.8-live | text | **100%** (278/278) | 100 / 100 | 2.5 s / 3.9 s | 0 |
| Live gemini-3.8-live (earlier prompt) | audio | 94.7% (108/114) | 94.9 / 93.8 | 3.8 s / 5.6 s | 3 (0 chitchat) |
| Live gemini-3.1-flash-live-preview | audio | 96.5% (110/114) | 96.9 / 93.8 | 3.6 s / 5.1 s | 3 (0 chitchat) |
| Live gemini-2.5-flash-native-audio-latest | audio | 0/15, stopped (transcribes, then submits no operations; 6/15 sessions closed 1011) — cause found and fixed in the evening, see "Free tier" | – | ~50 s with retries | 0 |
| generate gemini-3.1-flash-lite-preview | text | 98.9% (262/265) | 98.6 / 100 | 1.5 s / 6.3 s | 2 | 13 cases not run (daily cap) |
| generate gemini-3.1-flash-lite | audio | 95.6% (109/114) | 96.9 / 87.5 | 2.1 s / 4.8 s | 5 (0 chitchat) |
| **production `understand()`** (Live first, generate hedge) | text | **99.6%** (277/278) | 99.6 / 100 | 2.2 s / 3.7 s | 1 (0 chitchat) |
| **production `understand()`** | audio | **96.5%** (110/114) | 95.9 / 100 | 3.5 s / 5.5 s | 2 (0 chitchat) |

Production run: 392 cases, 0 errors; 26 cases fell back after a Live per-minute quota close (21 answered by
generateContent, 2 by the second Live model, 3 by Live after backoff); no Live session needed the "call the tool" nudge.
text per category: every category 100% except lists 21/22 (a redundant create_list, now removed by a post-check and
re-checked). code_mixed 30/30, multi_entry 22/22, chitchat_unclear 18/18 with 0 writes.
audio misses: Pashto TTS mis-heard (2), "who all owe more than 2000? list bhejo" in an Urdu voice (1), "dene" heard as "diye" (1).
`overload-test.mjs`: 23/23.

### Final: re-run on the final code (31 Oct, 16:28 PKT, after the review fixes)
Production `understand()`, all 398 cases (281 text + 117 audio, incl. the new long-note and back-to-General cases),
concurrency 3, while other agents were also using the key: every generateContent model answered 429 (daily caps), and
Live closed sessions for its per-minute quota repeatedly, so every answer came from Live (3.8-live 220, 3.1-flash-live
178) and the tail latency is the retry/fallback time, not the model's.

| Set | Accuracy | dev / dev-adj. | p50 / p95 | False writes | Errors |
|---|---|---|---|---|---|
| text | **100%** (281/281) | 237/237 / 44/44 | 2.5 s / 14.7 s (28 cases needed a 2nd attempt after a Live quota close) | 0 | 0 |
| audio | **95.7%** (112/117) | 96/101 / 16/16 | 3.9 s / 7.7 s | 4 (0 chitchat) | 0 |

Every category 100% except roman_urdu 25/26, code_mixed 49/50, pashto 14/17. Misses (all audio): "who all owe more
than 2000? list bhejo" heard as "Khalid ko 2000 list bhejo" (a false Rs 2,000 credit — known since v1), "dene" heard as
"diye", and 3 Pashto notes. No Live answer needed the nudge. `overload-test.mjs`: 46/46.

**Pashto varies run to run.** The 6 Pashto voice notes, 3 production runs each: 12/18 runs passed, only 3/6 cases passed
every run (a_ps01 2/3, a_ps04 1/3, a_ps05 0/3). a_ps01 ("Umar took Rs 500 on udhaar") has come back as a whole-balance
payment ("pur" heard as "poora") in 3 of 9 production runs across reviews; `clean()` now refuses such a settlement (see brain.js), so
the ledger asks for the amount instead of clearing Umar's khata, but the entry is still not the right one. Keep Pashto
out of the scripted demo unless the founder has rehearsed his exact sentence in his own voice.

**Long voice notes.** One Live session needs more time for a longer note: 40 s / 15 entries took 15.5–17.6 s on
gemini-3.8-live and 22–36 s on gemini-3.1-flash-live (once 0 operations after 36 s); 70 s / 25 entries 25–30 s on 3.8-live,
47 s on 3.1-flash-live. With the old fixed 20 s limit these notes timed out on every attempt (or ended in a partial
answer). Now: 43 s / 14 entries and 63 s / 20 entries both 100% (18.6 s and 22.0 s on 3.8-live; 30.3 s and 34.7 s on
3.1-flash-live in the full run), and a real 63 s note through `pipeline.handleMessage` wrote all 20 entries in 47.6 s
(one interim line at 12.4 s). A long note answered with no operations, or nudged with a transcript far shorter than the
audio, is retried instead of replied to. For the demo: keep notes under ~20 s; long notes work but take 20–50 s.

Caveat: the cases and the prompt were written by the same team, and synthetic voices are clean; real shop audio
(background noise, overlapping speech, regional accents) will score lower. Re-run on real voice notes when available.

## Trades (31 Oct 2026, 23:20–23:45 PKT)
Which trades Hisaab understands today, with no prompt or model change. `trades.json`: 60 text cases (pharmacy 10,
dairy / milk shop 10, hardware 11, tailor 10, wholesale 11, mobile / easyload 8) and 30 voice notes (5 per trade, Edge
voices: 4 Urdu, 1 en-IN each). Each trade has credits, payments, a multi-entry line, a balance question, Urdu script,
Roman Urdu, code-mixed English, spoken amounts (dhai sau, sawa, saadhe, paune, dedh, lakh), its own words (strip, patta,
syrup, injection, parchi; litre, paao, kilo dahi, mahine ka doodh; bori, feet, keel, rang ka dabba; silai, joda, advance;
carton, peti, darjan, maal udhaar; load, easyload) and quantities that are not rupees. Most trades also have one line that
must write nothing (a promise). Wholesale uses its own roster: shops as customers, 3 suppliers.

Run: `--path prod --no-generate --rpm 6 --concurrency 2` (production `understand()`, shipped Live order; every
generateContent model was at its daily cap tonight, so no generateContent request was sent). 109–110 Live sessions in
all (a first run was stopped mid-case). Texts were answered by 2.5-flash-native-audio-latest (50) and 3.8-live (10: after
a "1011 Internal error" close on native audio); every voice note by 3.8-live.
"Claimable" = text ≥ 90% exact with 0 false writes, and no voice note writes a wrong amount.

| Trade | Text exact | Text false writes | Text p50 / p95 | Voice exact | Voice false writes (wrong amount) | Voice p50 / p95 | Claimable |
|---|---|---|---|---|---|---|---|
| Dairy / milk shop | 10/10 | 0 | 1.8 / 5.0 s | 5/5 | 0 (0) | 4.7 / 6.2 s | yes |
| Hardware | 11/11 | 0 | 1.7 / 4.7 s | 5/5 | 0 (0) | 4.7 / 5.6 s | yes |
| Wholesale | 11/11 | 0 | 1.9 / 3.6 s | 5/5 | 0 (0) | 4.3 / 6.1 s | yes |
| Tailor | 9/10 (1 partly) | 0 | 2.5 / 4.9 s | 5/5 | 0 (0) | 4.6 / 5.9 s | yes (at the 90% line) |
| Pharmacy | 10/10 | 0 | 2.0 / 4.2 s (9 of 10) | 3/5 | 2 (1) | 4.3 / 6.4 s | no |
| Mobile / easyload | 7/8 (1 partly) | 1 | 2.4 / 6.1 s | 5/5 | 0 (0) | 4.3 / 5.6 s | no |
| All | 58/60 | 1 | 2.0 / 5.0 s | 28/30 | 2 (1) | 4.4 / 6.2 s | |

Misses:
- mb08 "Gul Khan ke number 0312 4567890 pe 500 ka load kiya, udhaar": the credit was right, but the load number was also
  saved as Gul Khan's phone (`set_phone`), so his reminders would go to that number. A false write.
- tl04 "Naveed ke 2 suit 3200, Asad ka 1 joda 1600, dono ne abhi kuch nahi diya": only Asad's credit; Naveed's 3200 was
  dropped. No false write.
- a_ph01: "چار سو اسی" (480) was heard as 400, a wrong amount. "اسی" can also be read as "isi"; the same note with the
  amount as digits wrote 480 (1 recheck session), so the synthetic voice is the likely cause. It still counts.
- a_ph07: "وقاص" (Waqas) was heard as "Vikas", so the right amount went to a new khata. A false write.

Caveats: the cases were written by this team (dev material, not a held-out set); 8–11 texts and 5 voice notes per
trade; synthetic voices; no Pashto. Text ph09's latency was not measured cleanly. Reports:
`trades-text-merged-2026-10-31.json`, `trades-voice-2026-10-31T18-39-52-884Z.json`, `trades-summary-2026-10-31.json`.

## Production config (defaults in server/config.js)
| Key | Default | Meaning |
|---|---|---|
| `VOICE_PARSE` | `live` | voice notes: Gemini Live first (`generate` = generateContent first) |
| `TEXT_PARSE` | `live` | text messages: Gemini Live first (`generate` = generateContent first, Live as hedge) |
| `LIVE_PARSE_MODELS` | `gemini-3.8-live,gemini-3.1-flash-live-preview,gemini-2.5-flash-native-audio-latest` | Live models for voice notes, tried in turn (order: see Free tier) |
| `LIVE_TEXT_MODELS` | `gemini-2.5-flash-native-audio-latest,gemini-3.8-live,gemini-3.1-flash-live-preview` | Live models for text messages (set it empty to use `LIVE_PARSE_MODELS`) |
| `PARSE_MODELS` | `gemini-3.5-flash-lite,gemini-3.1-flash-lite` | generateContent models (photos; hedge behind Live) |
| `PARSE_FALLBACK_MODELS` | `gemini-3.1-flash-lite,gemini-3.1-flash-lite-preview` | always appended to the generateContent lane |
| `PARSE_HEDGE_MS` / `VOICE_HEDGE_MS` | 5000 / 6000 | start the second lane if no answer yet |
| `PARSE_TIMEOUT_MS` / `PARSE_AUDIO_TIMEOUT_MS` | 25000 / 35000 | one generateContent attempt |
| `LIVE_PARSE_TIMEOUT_MS` / `LIVE_PARSE_MAX_TIMEOUT_MS` | 20000 / 70000 | one Live session, connect to tool call: 10 s + 0.75 s per second of audio, within these bounds (5 s note 20 s, 40 s note 40 s, 70 s note 62.5 s) |
| `LIVE_PARSE_CONCURRENCY` / `LIVE_SLOT_WAIT_MS` | 4 / 8000 | Live parse sessions this server holds at once; a message waits this long for a free one, then generateContent answers it (see Free tier) |
| `LONG_NOTE_SECONDS` | 30 | voice notes this long start the generateContent hedge together with Live |
| `PARSE_PATIENCE_MS` | 90000 | then the message fails with error `busy` ("ek minute baad dobara bhejein") |
| `INTERIM_AFTER_MS` | 12000 | one "Mil gaya — likh raha hoon…" line in the owner's chat |
| `PARSE_THINKING` | (model default) | `minimal`/`low`/… or a token budget for generateContent |
