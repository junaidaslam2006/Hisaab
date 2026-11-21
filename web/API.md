# Hisaab HTTP API (same origin, cookie session)

All `/api/*` responses are JSON. A 401 `{ error: 'not_signed_in' }` means the session expired.
Money is integer rupees. Times are epoch milliseconds. Errors are `{ error: '<code>' }` (sometimes with extra fields,
listed below).

## Public
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /api/session | – | `{ signedIn, tenant: Tenant \| null }` |
| POST | /api/link | `{ reconnect?: boolean, method?: 'qr' \| 'code', phone?: string }` | `{ ok }` — starts a WhatsApp link for this browser (cookie-bound). `method:'code'` links with an 8-character code typed on the same phone (WhatsApp → Linked devices → Link a device → *Link with phone number instead*); needs `phone` unless reconnecting. 400 `bad_phone`, 429 `too_many_attempts`. |
| GET | /api/link | – | `{ state: 'none' \| 'starting' \| 'qr' \| 'code' \| 'reconnecting' \| 'expired' \| 'error', qr: dataURL \| null, code: 'ABCD-EFGH' \| null, expiresAt }` or `{ state: 'linked', isNew, next: '/app' \| '/welcome' }` (also signs the browser in) or `{ state: 'mismatch', phone }`. Poll every ~1.5 s. |
| DELETE | /api/link | – | `{ ok }` cancel |
| POST | /api/login/code | `{ phone }` | `{ method: 'code' }` (6-digit code sent to their WhatsApp "Message yourself") or `{ method: 'qr', reason: 'no_account' \| 'not_connected' }`; 429 `too_many_attempts`; 400 `bad_phone` |
| POST | /api/login/verify | `{ phone, code }` | `{ ok, next }`; 400 `wrong_code`; 429 `too_many_attempts` after 5 wrong codes or when expired (request a new code) |
| POST | /api/logout | – | `{ ok }` |
| GET | /auth/magic?t= | – | redirect to /app (one-time link the bot sends when the owner texts "dashboard") |

## Signed-in shop
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /api/me | – | `Tenant` |
| PATCH | /api/me | `{ shop_name?, owner_name?, city?, business_type?, ui_lang?: 'en'\|'ur', voice_replies?: bool }` | `Tenant` |
| POST | /api/onboarding | same fields as PATCH /api/me | `Tenant` (marks onboarded) |
| GET | /api/overview | – | `Overview` |
| GET | /api/lists | – | `List[]` — the shop's real lists, oldest first (General is not in it; see Overview.lists) |
| POST | /api/lists | `{ name, nameUrdu?, kind?: 'customers' \| 'suppliers' }` | 201 `List` (a name that means suppliers — "Suppliers", "Vendors", "سپلائرز" — always makes a `suppliers` list, whatever `kind` says); 400 `bad_name` (empty / not text / no letters) · 400 `bad_kind` (unknown kind) · 400 `too_many` (20 lists per shop) · 409 `exists` + `list: { id, name, nameUrdu, kind } \| null` (same name ignoring case, spaces, "wale"/"ki list" etc.; `null` = it means General) |
| PATCH | /api/lists/:id | `{ name?, nameUrdu? }` | `List` (a list's `kind` never changes; other fields are ignored); 404 · 400 `bad_name` · 400 `bad_kind` (renaming a customers list to a name that means suppliers) · 409 `exists` (+ `list`) |
| DELETE | /api/lists/:id | – | `{ ok, moved }` — a customers list's people move to General (`moved` = how many); 404; 409 `not_empty` + `people` for a suppliers list that still has people (move or delete them first) |
| GET | /api/customers | – | `Customer[]` (customers and suppliers; filter on `listId` / `listKind`) |
| POST | /api/customers | `{ name, nameUrdu?, phone?, listId?: string \| null }` | 201 `Customer` (`listId` null/absent = General; a suppliers list makes a supplier); 400 `bad_list` (not one of this shop's lists) |
| GET | /api/customers/:id | – | `Customer & { entries: Entry[] }` (newest first, with runningBalance) |
| PATCH | /api/customers/:id | `{ name?, nameUrdu?, phone?, listId?: string \| null }` (empty phone clears it; `listId` absent = unchanged, null = General) | `Customer`; 400 `bad_phone` · 400 `bad_list` · 409 `has_entries` (moving between a customers list/General and a suppliers list once the khata has entries: the entries would flip meaning) |
| DELETE | /api/customers/:id | – | `{ ok }` (deletes the person and all their entries) |
| POST | /api/customers/:id/merge | `{ intoId }` | `Customer` (the one merged into); 400 `cannot_merge`; 409 `has_entries` (a customer and a supplier khata, when either has entries) |
| GET | /api/customers/:id/reminder | – | `{ text, whatsappUrl, hasPhone }`; 409 `nothing_owed` (balance ≤ 0, or a supplier) |
| POST | /api/entries | `{ customerId, kind: 'credit'\|'payment', amount, note? }` | `Entry` (on a supplier: credit = goods taken on credit, payment = paid them) |
| POST | /api/entries/:id/void | – | `{ ok }` |
| GET | /api/messages?before=&limit= | – | `Message[]` newest first |
| POST | /api/messages/voice | raw audio body (Content-Type audio/webm etc.) | 202 `{ ok, id }` — processed in background; progress arrives as realtime `message` events with that id |
| POST | /api/messages/text | `{ text }` | 202 `{ ok, id }` |
| GET | /api/export.csv | – | CSV download: Date, Time, Customer, Phone, **List** (list name or "General"), Type ("Udhaar (credit given)", "Payment received", "Supplier: goods taken on credit", "Supplier: payment made"), Amount (Rs), Items, Note, Recorded via, Status |
| POST | /api/whatsapp/disconnect | – | `Tenant` |
| DELETE | /api/me | – | `{ ok }` deletes the shop and all data (lists included) |
| GET | /media/:name | – | the shop's own voice notes/photos (URLs come from Message/Entry objects) |

### Pitch-day tools (server/ops.js, same sign-in)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /api/system-check[?send=1] | – | `{ ok, ms, ranAt, checks: [{ id: 'ai'\|'voice'\|'whatsapp'\|'database', ok, ms, code, detail, detailUr }] }` — AI = a real parse of a fixed Urdu+English sentence (nothing written); voice = a short TTS render; whatsapp = connection state (`send=1` also sends "✅ Hisaab system check" to the shop's own chat when connected); database = read/write + disk space. 429 `too_soon` + `retryAfter` (seconds; max one run per 20 s per shop) |
| GET | /api/sample-data | – | `{ ready, present, people, lists, entries }` (is clearly-labelled sample data in this shop?) |
| POST | /api/sample-data | – | 201 `{ ok, added, details }` — ≈12 sample customers across General + 2 lists, 2 suppliers, 6 weeks of entries (all `sample`, entries `source: 'sample'`); 409 `already_has_sample` |
| DELETE | /api/sample-data | – | `{ ok, removed, details }` — removes the sample people (their entries go too) and the sample lists |

## Realtime
WebSocket `/ws` (cookie auth) sends `{ type, data }`:
- `ledger` — entries/customers/lists changed: refetch overview / customers / lists / customer detail
- `message` — `data` is a `Message` (new or updated; status goes received → thinking → speaking → done | error)
- `tenant` — shop profile or WhatsApp status changed: refetch /api/me

WebSocket `/live` = live voice call (see components/LiveCall.jsx).

## Shapes
```ts
Tenant = { id, phone, phoneLocal, shopName, ownerName, city, businessType, uiLang: 'en'|'ur', voiceReplies,
  whatsapp: { status: 'connected'|'reconnecting'|'disconnected'|'logged_out', live: 'open'|'qr'|'reconnecting'|null, name },
  createdAt, onboarded, firstMessageAt, limits: { dailyMessages } }

Customer = { id, name, nameUrdu, phone, phoneLocal, aliases: string[],
  balance        // customer: >0 owes the shop, <0 advance. Supplier: >0 the SHOP owes them, <0 shop paid in advance.
  listId,        // string | null — null = General (UI label en "General", ur "عام کھاتہ")
  listName,      // string | null (null = General)
  listNameUrdu,  // string | null
  listKind,      // 'customers' | 'suppliers' (General is 'customers')
  sample,        // boolean: demo data added from Settings, removable
  lastCreditAt, lastPaymentAt, lastEntryAt, entriesCount /* live (not cancelled) entries */,
  unpaidDays /* days since last payment (or first udhaar) while balance>0, else null */, createdAt }

List = { id, name, nameUrdu /* '' when unknown */, kind: 'customers'|'suppliers', aliases: string[], sample,
  people,   // people in the list
  owing,    // people with balance > 0 (for a suppliers list: suppliers the shop owes)
  total,    // sum of positive balances
  createdAt }

Entry = { id, kind: 'credit'|'payment', amount, items: string[], note, source /* whatsapp_voice|whatsapp_text|web_voice|web_text|web|call|sample */,
  createdAt, voidedAt, voidReason /* 'undo'|'corrected'|'cancelled from dashboard' */, runningBalance, transcript /* Urdu */, transcriptRoman, audio /* file name or null */, audioSeconds }

Overview = {
  // Everything except `payable`, `suppliersWithDue`, `suppliers` and `lists` is about customers only:
  // supplier balances and entries never count as udhaar, follow-ups, largest, today/last30/daily or recent.
  totals: { due, customersWithDue, customers, advance,
            payable /* sum of positive supplier balances = what the shop owes */, suppliersWithDue, suppliers },
  today: { given, givenCount, collected, collectedCount },
  last30: { given, collected },
  followUp: Customer[]   // owes money and no payment for >= 7 days, longest first (max 6)
  largest: Customer[]    // biggest balances (max 6)
  recent: { id, kind, amount, items, source, createdAt, voidedAt, customer: { id, name, nameUrdu, listId, listName, listKind } }[]  // 12 newest
  daily: { day: 'YYYY-MM-DD', given, collected }[]  // last 14 days, oldest first
  lists: { id /* null = General */, name /* null = General */, nameUrdu, kind, aliases, sample, people, owing, total, createdAt }[]  // General first, then List[] order
}

Message = { id, channel: 'whatsapp'|'web', kind: 'voice'|'text'|'photo', text, audioUrl, imageUrl, seconds,
  transcript /* Urdu script */, transcriptRoman, language,
  results: Result[],
  replyText /* WhatsApp markdown: *bold* _italic_ ~strike~ ```mono``` */, replySpoken, replyAudioUrl, replySeconds,
  status: 'received'|'thinking'|'speaking'|'done'|'error', error: null|'busy'|'ai_config'|'network'|'not_understood'|'limit'|'interrupted' (server restarted before it was written), ms, createdAt }

Result = { type, status, customerId, customerName, customerNameUrdu, isNew,
  kind /* 'credit'|'payment' for entry results */, amount, oldAmount, items, balance /* the person's balance after this */,
  threshold, candidates? /* names: people for ambiguous/confirm, lists for list_not_found */,
  listId, listName /* null = General */, listKind /* 'customers'|'suppliers'|null */,
  // entry results: the person's list; create_list / move_to_list: the list acted on (move: the target);
  // scoped queries: the list asked about (listKind 'suppliers' + listName null = all suppliers)
  listCreated /* a list was created by this result */, kindConflict? /* list_not_found: the list is of the other kind */, fromListName? /* move_to_list: where they were (null = General) */,
  count? /* people in a dues / reminders result; number of lists for lists_summary */,
  total? /* dues / totals / lists_summary: the amount the result is about */ }
```

Result `type`: credit, payment, **purchase** (shop took goods on credit from a supplier), **supplier_payment** (shop paid
a supplier), undo, correct, set_phone, balance, reminder, dues_list, total_due, today_summary, full_ledger,
**create_list**, **move_to_list**, **lists_summary**, help, dashboard_link, chitchat, unclear.
A credit/payment said about an existing supplier comes back as purchase/supplier_payment.

`status`: ok, needs_amount, needs_name, ambiguous, confirm, not_found, already_clear, nothing_to_undo, bad_phone, and
- `exists` — create_list: a list with that name already exists (or it means General)
- `has_entries` — move_to_list: customer ↔ supplier list change refused because the khata has entries
- `not_supplier` — purchase/supplier_payment named a customer; nothing written (the reply asks about a supplier khata)
- `list_not_found` — the named list does not exist (or the name fits several lists); `listName` = the list as said,
  `candidates` = closest list names. move_to_list without any list name: `listName` null, `customerName` set,
  `candidates` = the shop's lists. `kindConflict: true` = the list with that name holds the other kind of people (e.g. an
  older customers list called "Suppliers" when a purchase needs a suppliers list); nothing written, `candidates[0]` is that list.
- `too_many` — a needed list could not be created (20 lists already); nothing written; `listName` = the list as said
