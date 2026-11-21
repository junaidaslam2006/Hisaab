import { GoogleGenAI } from '@google/genai'
import { config } from './config.js'

let client = null
export function gemini() {
  if (!config.geminiKey) throw new Error('GEMINI_API_KEY is missing. Put it in hisaab/.env')
  client ??= new GoogleGenAI({ apiKey: config.geminiKey })
  return client
}

export const OP_TYPES = [
  'credit', 'payment', 'purchase', 'supplier_payment', 'undo', 'correct', 'set_phone', 'create_list', 'move_to_list',
  'balance', 'dues_list', 'total_due', 'today_summary', 'full_ledger', 'reminder', 'lists_summary',
  'help', 'dashboard_link', 'chitchat', 'unclear',
]
// Ops whose meaning can depend on a list ("Factory walon ka total", a new person "in the Teachers list").
const LIST_OPS = new Set(['credit', 'payment', 'purchase', 'supplier_payment', 'create_list', 'move_to_list', 'balance', 'dues_list', 'total_due', 'full_ledger', 'reminder'])

/** The parse result. The same schema is the Live path's submit_operations tool parameters. */
export const SCHEMA = {
  type: 'object',
  properties: {
    transcript_urdu: {
      type: 'string',
      description: 'Exactly what the shopkeeper said, in Urdu script (Pashto script if they spoke Pashto). For text input, the message rewritten in Urdu script.',
    },
    transcript_roman: { type: 'string', description: 'The same sentence in Roman Urdu / Roman Pashto as Pakistanis type on WhatsApp.' },
    language: { type: 'string', enum: ['urdu', 'pashto', 'punjabi', 'hindko', 'english', 'mixed'] },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: OP_TYPES },
          customer_id: { type: ['string', 'null'], description: 'id from CUSTOMERS if the person is already in the khata, else null' },
          customer_name: { type: ['string', 'null'], description: 'Roman spelling, Title Case, without honorifics (bhai, sahab, chacha, baji, ji)' },
          customer_name_urdu: { type: ['string', 'null'], description: 'Name in Urdu script, without honorifics' },
          amount: { type: ['integer', 'null'], description: 'Rupees as a plain integer, or null if not said' },
          full_settlement: { type: 'boolean', description: 'true when they paid off the whole balance (saara / poora hisaab)' },
          items: { type: 'array', items: { type: 'string' }, description: 'Goods in Roman Urdu with quantity, e.g. "cheeni 2kg"' },
          threshold: { type: ['integer', 'null'], description: 'For dues_list: only people owing more than this' },
          phone: { type: ['string', 'null'], description: 'For set_phone: the digits of the phone number as said, e.g. "03001234567"' },
          list_name: { type: ['string', 'null'], description: 'The list this op is about, as in LISTS (or as said for a new list); null if no list was mentioned' },
          list_name_urdu: { type: ['string', 'null'], description: 'The same list name in Urdu script, or null' },
          list_kind: { type: ['string', 'null'], description: '"suppliers" for supplier lists / what the shop owes, "customers" for create_list of a customer list, else null' },
        },
        required: ['type', 'customer_id', 'customer_name', 'customer_name_urdu', 'amount', 'full_settlement', 'items', 'threshold', 'phone', 'list_name', 'list_name_urdu', 'list_kind'],
      },
    },
    reply_urdu: {
      type: ['string', 'null'],
      description: 'Only for chitchat or unclear: one or two short, warm sentences in natural Urdu script that answer what was said (sent as the WhatsApp text). Otherwise null.',
    },
    reply_roman: { type: ['string', 'null'], description: 'The same reply in Roman Urdu, or null' },
  },
  required: ['transcript_urdu', 'transcript_roman', 'language', 'operations', 'reply_urdu', 'reply_roman'],
}

export const SYSTEM = `You are the ears of "Hisaab", a voice khata (credit ledger) assistant for a small Pakistani shop.
The SHOPKEEPER sends you WhatsApp voice notes or texts in Urdu, English, Pashto, Punjabi or Hindko - very often Urdu and
English mixed in one sentence ("Kamal ne 700 ka saman liya on credit"). Turn each message into ledger operations.
You never calculate balances; the app does that.

WHO IS WHO
- Customers buy from the shop on udhaar: they owe the shop.
- Suppliers (people in a list of kind "suppliers", marked "kind":"supplier" in CUSTOMERS) sell stock to the shop: the SHOP owes them.
The same words flip meaning: "Malik Traders ko 5000 diye" is supplier_payment when Malik Traders is a supplier, but
credit (cash given on udhaar) when the person is a customer. "X se 3000 mile" is payment from a customer.

OPERATION TYPES
Writes - only for something that already happened:
- credit: a customer took goods or cash on udhaar. "Kamal ne 700 ka sauda liya", "Sana ko 1200 ka ration diya", "Rizwan ke khate mein 450 likh do",
  "5k likh do Faraz ke naam", "put 900 on Danish's account", "Danish bought stuff for 650 on credit", "Faraz ne 1100 ka ghee liya credit pe".
- payment: a customer paid money back. "Kamal ne 300 wapis kiye", "Sana se 500 mil gaye", "Rizwan ne 1000 jama karwaye", "Faraz paid back 400",
  "got 2k from Danish", money sent by Easypaisa / JazzCash / bank. Whole balance paid ("saara hisaab chuka diya", "poora clear", "full payment ho gaya",
  "hisaab settle ho gaya", "cleared his account"): full_settlement=true, amount=null.
- purchase: the shop took stock on credit FROM a supplier. "Malik Traders se 20 hazaar ka maal udhaar aaya", "got stock worth 15000 from Malik Traders on credit".
  A new supplier ("naya supplier ...") is a purchase with customer_id=null.
- supplier_payment: the shop paid a supplier. "Malik Traders ko 10 hazaar de diye", "paid Malik Traders 5000". Whole balance: full_settlement=true, amount=null.
- undo: cancel the last entry. "undo", "galat ho gaya", "pichli entry mita do", "cancel karo", "delete the last one". Fill the customer only if they name one ("Kamal wali entry cancel karo").
- correct: change the last entry's amount. "nahi 300 nahi 400 the", "Kamal wali entry 450 kar do", "it should be 600". amount = the NEW amount.
- set_phone: save a phone number. "Kamal ka number 0300 1234567 hai". phone = the digits (spoken digits too: "zero teen sau..." -> "0300...").
- create_list: make a new list of people. "naya list banao Factory wale", "make a list called Drivers", "suppliers ki list bana do". list_name as said;
  list_kind "suppliers" when the list is for suppliers/vendors, else "customers".
- move_to_list: put an existing person into a list. "Kamal ko Mohalla list mein daal do", "move Sana to Teachers". customer + list_name.
Questions - never write:
- balance: one person's hisaab. "Kamal ka hisaab batao", "Sana ke zimme kitne hain", "what does Danish owe", "how much do I owe Malik Traders".
- dues_list: who owes. "kis kis ka udhaar hai", "1000 se zyada kis ka hai" (threshold=1000), "who owes more than 5k" (threshold=5000), "sab se zyada kis ka hai".
- total_due: the total outstanding. "kul kitna udhaar hai", "total pending kitna hai", "market mein kitna paisa phansa hai".
- today_summary: today's activity. "aaj ka hisaab", "aaj kitna wasool hua", "today's summary".
- full_ledger: the whole khata. "poora khata bhejo", "sab ka hisaab bhej do".
- reminder: a payment reminder for one customer ("Kamal ko reminder bhejo", "yaad dihani ka message") or for a whole list ("Factory walon ko reminder bhejo": list_name, no customer).
- lists_summary: the shop's lists. "meri lists dikhao", "sab lists ka hisaab", "show my lists".
- help: how to use Hisaab / what they can say. dashboard_link: the website, dashboard or login link.
Other:
- chitchat: greetings, thanks, small talk, "ok", emojis, and anything with no ledger meaning. Put a short friendly reply in reply_urdu
  (Urdu script) and the same reply in Roman Urdu in reply_roman.
- unclear: you cannot tell what to record. Put a short clarifying question in reply_urdu (e.g. "معاف کیجیے، کس کے کھاتے میں کتنے روپے لکھوں؟")
  and the same in Roman Urdu in reply_roman (e.g. "Maaf kijiye, kis ke khate mein kitne rupay likhun?").
HOW TO WRITE reply_urdu: talk like a polite, trusted munshi of the shop, in natural everyday Urdu, one or two short
sentences. Answer what they actually said; never a generic "how can I help" line. Use Urdu words, not English ones
(کھاتہ، ادھار، حساب، شکریہ), except words Pakistanis normally say in English such as انٹری. A promise ("kal dega") gets
a reply that it is not written yet, e.g. "ٹھیک ہے، جب پیسے ملیں تو بتا دیجیے گا، میں لکھ لوں گا۔". Thanks gets a warm,
short answer, e.g. "جی، آپ کا شکریہ! کوئی اور حساب لکھنا ہو تو بتا دیں۔".

NEVER WRITE WHEN NOTHING HAPPENED
Only record what already happened. Promises and plans are not entries: "kal paise de dega", "shayad agle hafte dega", "Friday ko dega",
"will he pay?" -> chitchat. Someone came by without a sale ("aaya tha", "kuch nahi liya") -> chitchat. A question is never a write.

SEVERAL ENTRIES, NAME LISTS, SELF-CORRECTIONS
One message can hold many operations, in the order said ("Kamal ne 500 liye aur Sana ne 300 wapis kiye" -> credit + payment).
A plain list of names with amounts ("Kamal 500, Sana 300, Rizwan 200", "udhaar: ...") is a credit for each person unless they say wapis / jama / diye / paid.
"Kamal aur Sana ne 400 400 ka liya" = 400 each. "Kamal ne 500 diye aur 300 ka saman liya" = payment 500 + credit 300 for Kamal.
Ignore fillers (umm, acha, haan, matlab, woh, kya naam hai, sun rahe ho). When they correct themselves ("Kamal ne... nahi nahi Sana ne",
"200 ka... nahi 250 ka", "pehle 500 bola tha lekin asal mein 400"), record ONLY the final version and nothing for the abandoned one.
A correction inside the same message is NOT a "correct" operation: "Kamal ne 200 ka... nahi 250 ka saman liya" is one credit of 250.
"correct" and "undo" are only for an entry from an EARLIER message ("nahi woh 400 the", "pichli entry galat thi").

AMOUNTS (always plain integer rupees)
Digits as written: "1,250", "Rs. 750/-", "2000 rupay". k = thousand: 5k=5000, 1.5k=1500, 2.5k=2500. lakh = 100000: 2 lakh=200000, dedh lakh=150000, dhai lakh=250000, sawa lakh=125000.
Urdu: sau=100, hazaar=1000. dedh = 1.5x, dhai/dhaai = 2.5x, sawa = +1/4 (sawa sau=125, sawa hazaar=1250, sawa do hazaar=2250),
paune = -1/4 (paune do sau=175, paune hazaar=750, paune teen hazaar=2750), saadhe = +1/2 (saadhe teen sau=350, saadhe chaar hazaar=4500).
Counted hundreds: barah sau=1200, pandrah sau=1500, pachees sau=2500. "2 hazaar 500"=2500, "ek hazaar paanch sau"=1500, "chaar sau pachaas"=450, "ek sau bees"=120.
English: fifteen hundred=1500, two thousand five hundred=2500, eleven hundred=1100, "two fifty" as money=250.
Pashto: yaw/یو 1, dwa/دوه 2, dre/درې 3, salor/څلور 4, pinza/پنځه 5, shpag/شپږ 6, owa/اووه 7, ata/اته 8, naha/نهه 9, las/لس 10, shal/شل 20,
sal/سل/sawa/سوه 100, zar/زر/zara/زره 1000. A number before sawa/zara multiplies it: pinza sawa/پنځه سوه = 500, owa sawa = 700, dwa zara/دوه زره = 2000,
dre zara = 3000. "zar rupay"/"زر روپۍ" alone = 1000 (zar is a thousand, never ten); "las" is ten.
Pashto direction: "X ta ... warkra / ورکړه / ورکړې" (I gave to X) = credit; "X ... rakra / raka / راکړې / راکړل" (X gave me) = payment;
"X ... yowra / یوړه / واخیسته" (X took) = credit; berta / بیرته / wapas = back (payment); pur / پور = udhaar; "hisab sumra de / حساب څومره دی" = balance.
Punjabi / Hindko: ikk, do, tin/tre, chaar, panj, chhe, satt, atth, naun, das, sau, hazaar.
If items are listed with prices, amount is their total. If no amount was said for a credit, payment or purchase, amount=null.

CUSTOMERS
You get CUSTOMERS with ids, Urdu names, aliases, their list and kind. If the speaker means one of them, set customer_id to that id and
customer_name to the name from CUSTOMERS. Allow spelling and pronunciation variants of the SAME name (Umar/Umer/Omar, Ahmed/Ahmad, Naveed/Navid),
honorifics (bhai, bhaijaan, sahab, sir, chacha, baji, aunty, ji, lala, haji, master) and aliases. Different names are different people:
Umair is not Umar, Irfan is not Imran, Asif is not Asad - for them customer_id=null.
A new person: customer_id=null, customer_name in Roman (Title Case, without honorifics; keep "Khan" or "Traders" when part of the name) and customer_name_urdu.
Never invent people that were not mentioned.

LISTS
You get the shop's LISTS. People not in a list are in the general khata. Questions and reminders about one list take its list_name
("Factory walon ka total" -> total_due list_name "Factory Wale"; "Mohalla list mein kis kis ka udhaar hai" -> dues_list list_name "Mohalla").
What the shop owes its suppliers: "suppliers ko kitna dena hai", "how much do I owe" -> total_due list_kind "suppliers"; "kis kis supplier ka dena hai" -> dues_list list_kind "suppliers".
Use the exact name from LISTS when the speaker means an existing list. For a credit or payment of a NEW person, set list_name only when they
said which list to put them in ("Teachers list mein naya khata Sir Adeel ka ..."). Otherwise list_name=null. Never use "General" as a list_name,
except to move someone back to the general khata: "Kamal ko Mohalla list se nikal do", "Sana ko aam khate mein daal do", "move Danish back to general"
-> move_to_list list_name "General".
list_kind is null unless the op is about suppliers or it is create_list.

TRANSCRIPTS
transcript_urdu must be faithful to what was said, in proper Urdu script (Pakistani Urdu spelling, never Devanagari/Hindi); Pashto in Pashto script;
English words may stay in English. transcript_roman is the same in Roman Urdu.`

/** The per-shop context block: lists and people, names only (balances could be stale by the time this is written). */
export function rosterText(customers = [], lists = []) {
  const listName = id => lists.find(l => l.id === id)?.name || null
  const people = customers.map(c => {
    const p = { id: c.id, name: c.name }
    if (c.nameUrdu) p.name_urdu = c.nameUrdu
    if (c.aliases?.length) p.aliases = c.aliases
    const list = c.listName || listName(c.listId)
    if (list) p.list = list
    const kind = c.listKind || lists.find(l => l.id === c.listId)?.kind
    if (kind === 'suppliers') p.kind = 'supplier'
    return p
  })
  const shopLists = lists.map(l => ({ name: l.name, ...(l.nameUrdu ? { name_urdu: l.nameUrdu } : {}), kind: l.kind || 'customers' }))
  return `LISTS:\n${JSON.stringify(shopLists)}\n\nCUSTOMERS:\n${JSON.stringify(people)}`
}

const GENERAL_LIST = /^(general|genral|jenral|aam|aam khat[ae]|aam khaat[ae]|general khat[ae]|default|no list|عام|عام کھات[ہے]|جنرل)$/i
const listKey = s => String(s ?? '').toLowerCase().replace(/[^a-z؀-ۿ]+/g, ' ').replace(/\b(list|lists|wale|walay|walon|waale|wali|ki|ka|ke)\b/g, ' ').replace(/\s+/g, ' ').trim()
const isGeneral = name => GENERAL_LIST.test(listKey(name))
const LANGUAGES = SCHEMA.properties.language.enum
// full_settlement books the person's ENTIRE balance as a payment, so clean() believes it only when the message says
// so. Measured: the Pashto note "عمر پنځه سوه روپۍ پور سودا یوړه" (Umar took Rs 500 on udhaar) came back from Live
// as "Umar 500 rupay poora sauda" = {payment, full_settlement} in 3 of 9 runs, which would have cleared Umar's khata.
// Without settlement words, in Pashto without an unambiguous one ("pur" = udhaar sounds like "poora"), or when the
// only money entry of the message had a rupee figure said with it, the ledger asks for the amount instead.
const wordsRe = words => new RegExp(`(?<![\\p{L}\\p{M}])(${words.join('|')})(?![\\p{L}\\p{M}])`, 'iu')
const SETTLE_WORDS = [
  'saara', 'sara', 'saari', 'sari', 'saare', 'sare', 'sab', 'sabh', 'full', 'fully', 'clear', 'cleared', 'clears', 'settle',
  'settled', 'chuka', 'chukaa', 'chukaya', 'chukay', 'chukta', 'chukti', 'mukka', 'muka', 'mukaa', 'mukaya', 'khatam',
  'khatm', 'khattam', 'barabar', 'baraabar', 'saaf', 'safa', 'baqi', 'baaqi', 'baki', 'baaki', 'bakaya', 'baqaya',
  'everything', 'all', 'whole', 'entire', 'complete', 'completely', 'remaining', 'balance', 'tol', 'tool', 'khalas', 'zero',
  'سارا', 'ساری', 'سارے', 'سب', 'مکمل', 'چکا', 'چکایا', 'چکائے', 'چکتا', 'مکا', 'مُکا', 'کلیئر', 'کلئیر', 'کلیر', 'سیٹل',
  'برابر', 'ختم', 'صاف', 'صفا', 'باقی', 'بقایا', 'ټول', 'ټوله', 'خلاص', 'فل',
]
const POORA = ['poora', 'pura', 'poori', 'puri', 'poore', 'pure', 'pooray', 'puray', 'پورا', 'پوری', 'پورے', 'پوره']
const SETTLED = wordsRe([...SETTLE_WORDS, ...POORA])
const SETTLED_PASHTO = wordsRe(SETTLE_WORDS)
const AMOUNT_SAID = /(?<![\d٠-٩۰-۹])[\d٠-٩۰-۹]{3,7}(?![\d٠-٩۰-۹])|\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s?k(?![\p{L}])|(?<![\p{L}\p{M}])(sau|hazaar|hazar|hajar|lakh|sawa|zar|zara|سو|ہزار|لاکھ|سوه|زر|زره)(?![\p{L}\p{M}])/iu
const MONEY_OPS = new Set(['credit', 'payment', 'purchase', 'supplier_payment'])

// Live tool-call arguments are not schema-checked. Measured 31 Oct on the 2.5 native-audio models: some calls carry
// keys wrapped in quote characters ('"type"', 'operations"') and some carry each operation as a JSON string. Both
// are undone here (a no-op for well-formed output), so such a call is read like any other instead of as "nothing said".
const bareKey = key => key.replace(/^[\s"'\\]+|[\s"'\\]+$/g, '')
const unquoteKeys = v => (Array.isArray(v) ? v.map(unquoteKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [bareKey(k), unquoteKeys(x)])) : v)
const parsedJson = v => {
  if (typeof v !== 'string' || !/^\s*[[{]/.test(v)) return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}
function tidyArgs(out) {
  const args = unquoteKeys(out && typeof out === 'object' ? out : {})
  const ops = parsedJson(args.operations)
  return { ...args, operations: Array.isArray(ops) ? ops.map(op => unquoteKeys(parsedJson(op))) : ops }
}

/** Validate and normalise model output (generateContent JSON or the Live tool call) into what ledger.js applies. */
export function clean(raw, { customers = [], lists = [], text = null } = {}) {
  const out = tidyArgs(raw)
  // Whole rupees, 1 to 10 crore; anything else means the amount was not understood.
  const int = v => (Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 100_000_000 ? Math.round(Number(v)) : null)
  const str = v => (typeof v === 'string' && v.trim() && !/^(null|none|undefined)$/i.test(v.trim()) ? v.trim() : null)
  const ids = new Set(customers.map(c => c.id))
  const said = [text, out?.transcript_urdu, out?.transcript_roman].filter(s => typeof s === 'string').join(' ')
  const rawOps = (Array.isArray(out?.operations) ? out.operations : []).filter(op => OP_TYPES.includes(op?.type))
  const settlementSaid = (out?.language === 'pashto' ? SETTLED_PASHTO : SETTLED).test(said)
    && !(rawOps.filter(op => MONEY_OPS.has(op.type)).length === 1 && AMOUNT_SAID.test(said))
  const knownList = name => lists.find(l => [l.name, l.nameUrdu, ...(l.aliases || [])].some(n => n && listKey(n) === listKey(name)))
  // "General" is not a list, but it is where move_to_list sends someone out of a list ("list se nikal do").
  const backToGeneral = op => op.type === 'move_to_list' && [op.list_name, op.list_name_urdu].some(n => str(n) && isGeneral(n))
  const listName = op => {
    const name = str(op.list_name)
    if (backToGeneral(op)) return 'General'
    if (!name || !LIST_OPS.has(op.type) || isGeneral(name)) return null
    // Point a loosely said name ("factory walon") at the existing list's exact spelling.
    return knownList(name)?.name || name.slice(0, 60)
  }
  const listNameUrdu = op => {
    const name = str(op.list_name_urdu)
    if (backToGeneral(op)) return 'عام کھاتہ'
    if (!name || !LIST_OPS.has(op.type) || isGeneral(name) || (str(op.list_name) && !listName(op))) return null
    return knownList(name)?.nameUrdu || name.slice(0, 60)
  }
  const operations = rawOps
    .map(op => {
      const kind = ['customers', 'suppliers'].includes(op.list_kind) ? op.list_kind : null
      const amount = int(op.amount)
      const settles = ['payment', 'supplier_payment'].includes(op.type) && [true, 'true'].includes(op.full_settlement)
      return {
        type: op.type,
        // An id the model made up must not hide the name: the ledger then matches by name.
        customer_id: ids.size && !ids.has(str(op.customer_id)) ? null : str(op.customer_id),
        customer_name: str(op.customer_name),
        customer_name_urdu: str(op.customer_name_urdu),
        amount,
        full_settlement: settles && (amount != null || settlementSaid),
        items: Array.isArray(op.items) ? op.items.filter(i => typeof i === 'string' && i.trim()).slice(0, 8) : [],
        threshold: int(op.threshold),
        phone: typeof op.phone === 'string' ? op.phone.replace(/[^\d+]/g, '').slice(0, 16) || null : null,
        list_name: listName(op),
        list_name_urdu: listNameUrdu(op),
        list_kind: op.type === 'create_list' ? kind || 'customers' : kind === 'suppliers' && LIST_OPS.has(op.type) ? 'suppliers' : null,
      }
    })
  return {
    transcriptUrdu: str(out?.transcript_urdu) || '',
    transcriptRoman: str(out?.transcript_roman) || '',
    // Live tool-call arguments are not schema-enforced: anything but a known language name is 'mixed'.
    language: LANGUAGES.includes(out?.language) ? out.language : 'mixed',
    replyUrdu: str(out?.reply_urdu),
    replyRoman: str(out?.reply_roman),
    operations: withoutRedundantLists(operations, customers),
  }
}

/**
 * "Rishtedaron ki list mein Rafiq ka 2000 likho" sometimes comes back as create_list + credit. The ledger already
 * creates the list for a NEW person's entry (and for move_to_list), so the extra create_list is dropped. It is kept when
 * the later op is about someone already in the khata, because then nothing else would create the list.
 */
function withoutRedundantLists(operations, customers) {
  const known = op => {
    const names = [op.customer_name, op.customer_name_urdu].filter(Boolean).map(n => n.toLowerCase())
    return Boolean(op.customer_id) || customers.some(c => [c.name, c.nameUrdu, ...(c.aliases || [])].some(n => n && names.includes(String(n).toLowerCase())))
  }
  const creates = (op, list) => {
    if (!op.list_name || listKey(op.list_name) !== listKey(list.list_name)) return false
    if (op.type === 'move_to_list') return true
    const kinds = list.list_kind === 'suppliers' ? ['purchase', 'supplier_payment'] : ['credit', 'payment']
    return kinds.includes(op.type) && !known(op)
  }
  return operations.filter((op, i) => !(op.type === 'create_list' && op.list_name && operations.slice(i + 1).some(o => creates(o, op))))
}

function inputParts({ audio, image, text, customers, lists }) {
  const kind = audio ? 'WhatsApp voice note' : image ? 'photo' : 'text message'
  const parts = [{ text: `${rosterText(customers, lists)}\n\nINPUT: a ${kind} from the shopkeeper.` }]
  if (audio) parts.push({ inlineData: { mimeType: audio.mimeType, data: audio.buffer.toString('base64') } })
  if (image) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.buffer.toString('base64') } })
    parts.push({
      text: 'If this photo is a handwritten paper khata/register page, output one credit operation per row (name + amount; payment if the row is marked as paid/wapis/jama). If it is a receipt or bill, record it as one credit for the customer named in any caption.',
    })
  }
  if (text) parts.push({ text: `MESSAGE: ${text}` })
  return parts
}

function thinkingFor(model, options) {
  const level = options.thinking ?? config.parseThinking
  if (level === '' || level == null) return undefined
  if (/^\d+$/.test(String(level))) return { thinkingBudget: Number(level) }
  // 2.5 models take a token budget; 3.x models take a level.
  if (/gemini-2\.5/.test(model)) return { thinkingBudget: String(level).toLowerCase() === 'minimal' ? 0 : 512 }
  return { thinkingLevel: String(level).toUpperCase() }
}

/** One generateContent call on one model, no retries. Used by understand() and by the eval. */
export async function parseOnce({ model, audio, image, text, customers = [], lists = [], signal, timeoutMs, options = {} }) {
  const t0 = Date.now()
  const timeout = AbortSignal.timeout(timeoutMs || (audio || image ? config.parseAudioTimeoutMs : config.parseTimeoutMs))
  const res = await gemini().models.generateContent({
    model,
    contents: [{ role: 'user', parts: inputParts({ audio, image, text, customers, lists }) }],
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: 'application/json',
      responseJsonSchema: SCHEMA,
      temperature: options.temperature ?? 0,
      ...(thinkingFor(model, options) ? { thinkingConfig: thinkingFor(model, options) } : {}),
      abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    },
  })
  let json
  try {
    json = JSON.parse(res.text)
  } catch {
    // An empty or cut-off answer is Google failing, not the shopkeeper being unclear: retry it like a 503.
    throw Object.assign(new Error(`bad_output from ${model}: ${String(res.text).slice(0, 120)}`), { transient: true })
  }
  return { ...clean(json, { customers, lists, text }), model, ms: Date.now() - t0, path: 'generate' }
}

// ---------------------------------------------------------------- overload policy

const TRANSIENT = /\b(408|429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE|INTERNAL|high demand|overloaded|try again|timed? ?out|timeout|aborted|fetch failed|socket|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|network|live_|bad_output|1011|1013/i
// A bad or blocked key. Not "billing": Google's ordinary per-minute 429 says "please check your plan and billing details".
const CONFIG = /API key|API_KEY|PERMISSION_DENIED|UNAUTHENTICATED|\b(401|403)\b|missing/i
// Rate limits and quota closes are always worth waiting for (per-day caps are handled by noteQuota / deadModels).
const QUOTA = /\b429\b|RESOURCE_EXHAUSTED|exceeded your current quota/i
const OFFLINE = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|getaddrinfo/i
const describe = err => `${err?.code || ''} ${err?.message || err}`
export const isTransient = err => Boolean(err?.transient) || QUOTA.test(describe(err)) || (TRANSIENT.test(describe(err)) && !CONFIG.test(describe(err)))

/** Why understanding finally failed, as the error codes the pipeline shows: busy | network | ai_config. */
function finalError(errors) {
  const all = errors.map(e => describe(e.err))
  const badKey = errors.length && errors.every(e => CONFIG.test(describe(e.err)) && !isTransient(e.err))
  const code = badKey ? 'ai_config' : all.length && all.every(e => OFFLINE.test(e)) ? 'network' : 'busy'
  return Object.assign(new Error(`understanding failed (${code}) after ${errors.length} attempts: ${all.slice(-3).join(' | ').slice(0, 400)}`), { code, attempts: errors.length })
}

// Free-tier keys have per-model limits (e.g. 15 requests/minute, and only 20/day on the bigger flash models).
// Remember which model is cooling down so the next message goes straight to one that can answer.
const cooldown = new Map() // model -> timestamp it may be tried again

function nextPacificMidnight(now = Date.now()) {
  const la = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const offset = la.getTime() - now
  la.setHours(24, 0, 30, 0)
  return la.getTime() - offset
}

function noteQuota(model, err) {
  const text = describe(err)
  // A daily cap normally lasts until the Pacific-midnight reset, but Google has been seen lifting it within minutes:
  // look again after 15 minutes rather than losing the model for the whole day.
  if (/PerDay/i.test(text)) cooldown.set(model, Math.min(nextPacificMidnight(), Date.now() + 15 * 60e3))
  else if (/\b429\b|RESOURCE_EXHAUSTED/.test(text)) {
    const hint = /retry in (\d+(?:\.\d+)?)s/i.exec(text)
    cooldown.set(model, Date.now() + (hint ? Math.ceil(Number(hint[1]) * 1000) : 20000))
  } else if (/exceeded your current quota/i.test(text)) {
    // Live sessions closed for quota (a per-minute limit; the close reason carries no retry hint).
    cooldown.set(model, Date.now() + 30000)
  } else if (/\b404\b|NOT_FOUND|no longer available/i.test(text)) cooldown.set(model, Date.now() + 3600e3)
}

/** Models currently skipped because of a quota or availability error, and until when (for the system check). */
export function modelCooldowns() {
  const now = Date.now()
  return Object.fromEntries([...cooldown].filter(([, until]) => until > now).map(([m, until]) => [m, new Date(until).toISOString()]))
}

const sleep = (ms, signal) => new Promise(resolve => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
})

/**
 * Hedged, patient parsing. Lane 0 starts at once; lane 1 (a different model family) starts when lane 0 has not answered
 * within `hedgeMs`, or as soon as lane 0 fails. Each lane retries transient errors with backoff, cycling through its
 * models. The first valid answer wins and the other call is aborted. Gives up after `patienceMs` with error 'busy'.
 * A lane with nothing to call right now (all its models cooling down or dead) hands over to the next lanes at once.
 * A lane marked `rotate` (Live) first tries each of its models once, at once, before it hands over; after that first
 * round it backs off between attempts like the other lanes.
 * `signal` (optional) aborts the whole parse: every call is stopped and the promise rejects with code 'aborted'.
 */
export function hedge(lanes, { hedgeMs, patienceMs, interimMs, onInterim, signal = null, log = () => {} }) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const stop = new AbortController()
    const errors = []
    const timers = []
    let settled = false
    let calls = 0
    const state = lanes.map(() => ({ started: false, running: false, dead: false, tries: 0, failures: 0, deadModels: new Set(), round: new Set(), rotated: false }))

    const onAbort = () => finish(Object.assign(new Error('understanding aborted by the caller'), { code: 'aborted', attempts: calls }))
    const finish = (err, value) => {
      if (settled) return
      settled = true
      timers.forEach(clearTimeout)
      signal?.removeEventListener('abort', onAbort)
      stop.abort()
      if (err) reject(err)
      else resolve({ ...value, attempts: calls, hedged: state.filter(s => s.started).length > 1, ms: Date.now() - t0 })
    }
    const left = () => patienceMs - (Date.now() - t0)
    const checkDone = () => {
      if (state.every(s => s.dead)) finish(finalError(errors))
    }
    const handOff = i => state.forEach((o, j) => j !== i && !o.started && launch(j))
    const coolingOrDead = (s, m) => s.deadModels.has(m) || cooldown.get(m) > Date.now()

    const launch = async i => {
      const lane = lanes[i]
      const s = state[i]
      if (settled || s.dead || s.running) return
      const models = lane.models.filter(m => !s.deadModels.has(m))
      const ready = models.filter(m => !(cooldown.get(m) > Date.now()))
      if (!ready.length && models.length) {
        // Every model of this lane is cooling down: wait for the first one if that fits in the patience left.
        const soonest = Math.min(...models.map(m => cooldown.get(m)))
        if (soonest - Date.now() < left() - 3000) {
          s.started = true
          handOff(i)
          await sleep(soonest - Date.now() + 50, stop.signal)
          return launch(i)
        }
      }
      if (!ready.length || left() < 2000) {
        s.dead = true
        handOff(i)
        return checkDone()
      }
      s.started = true
      s.running = true
      const untried = lane.rotate && !s.rotated ? ready.filter(m => !s.round.has(m)) : []
      const model = untried.length ? untried[0] : ready[s.tries++ % ready.length]
      calls++
      const a0 = Date.now()
      try {
        const value = await lane.run(model, AbortSignal.any([stop.signal, AbortSignal.timeout(Math.min(lane.timeoutMs, left()))]))
        finish(null, value)
      } catch (err) {
        s.running = false
        if (settled) return
        errors.push({ lane: lane.name, model, err })
        log(`${lane.name}:${model} failed after ${Date.now() - a0}ms: ${describe(err).slice(0, 200)}`)
        noteQuota(model, err)
        if (!isTransient(err) || /PerDay/i.test(describe(err))) s.deadModels.add(model)
        s.round.add(model)
        if (lane.models.every(m => s.deadModels.has(m))) {
          s.dead = true
          handOff(i)
          return checkDone()
        }
        // A Live lane's first round asks its next untried Live model at once: a dropped session, an internal error or a
        // quota close on one Live model then costs no generateContent request (free tier: small daily caps) when another
        // Live model answers within the hedge delay. Once every model of that round has failed, the other lane takes
        // over at once instead of waiting for the hedge timer, and every later Live attempt waits its backoff like any
        // other lane: one session per backoff step, not one per Live model per step (mock with every model failing, 3
        // Live models: 12 sessions in the first minute instead of 30), which would push the whole key towards Live's
        // per-minute quota.
        if (lane.rotate && !s.rotated && lane.models.some(m => !s.round.has(m) && !coolingOrDead(s, m))) return launch(i)
        s.rotated = true
        handOff(i)
        // The model that failed is out (dead or cooling down) and another one of this lane can answer: no backoff.
        const another = coolingOrDead(s, model) && lane.models.some(m => m !== model && !coolingOrDead(s, m))
        if (!another) await sleep(Math.min(8000, 1000 * 2 ** s.failures++) + Math.floor(Math.random() * 400), stop.signal)
        launch(i)
      }
    }

    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    launch(0)
    // Only a lane that has not started yet: one already handed over may be sleeping in its backoff, and launching it
    // again would run a second retry loop on it (twice the sessions or requests for one message).
    if (lanes.length > 1) timers.push(setTimeout(() => !state[1].started && launch(1), hedgeMs))
    if (onInterim) {
      timers.push(setTimeout(() => {
        if (!settled) Promise.resolve().then(onInterim).catch(() => {})
      }, interimMs))
    }
    timers.push(setTimeout(() => finish(finalError(errors.length ? errors : [{ err: new Error('timeout: no answer within patience') }])), patienceMs))
  })
}

/**
 * Understand one shopkeeper message (text, voice note or photo).
 * - Voice note, VOICE_PARSE=live: Gemini Live first, generateContent (PARSE_MODELS + fallbacks) as the hedge.
 * - Text, TEXT_PARSE=live: the same, with the Live models in LIVE_TEXT_MODELS order. TEXT_PARSE=generate:
 *   generateContent primary, Live as the hedge, the other generateContent models join if a call fails.
 * - Photos: generateContent only.
 * `onInterim` is called once if the answer takes longer than INTERIM_AFTER_MS. `signal` (optional) cancels the parse
 * (e.g. the system check giving up), so it stops spending quota that real messages need.
 * Long voice notes get longer per-attempt timeouts (Live needs ~0.3–0.7 s per second of audio) and, from
 * LONG_NOTE_SECONDS, both lanes start at once.
 */
export async function understand({ audio, image, text, customers = [], lists = [], onInterim = null, signal = null }) {
  if (!config.geminiKey) throw Object.assign(new Error('GEMINI_API_KEY is missing'), { code: 'ai_config' })
  const input = { audio, image, text, customers, lists }
  // The note as 16 kHz PCM, once: its length sets the timeouts, and every Live attempt streams it.
  let pcm = null
  let seconds = 0
  if (audio) {
    const { toPcm16k, pcmSeconds } = await import('./liveparse.js')
    pcm = await toPcm16k(audio.buffer).catch(err => (console.warn(`[brain] could not decode the voice note: ${err.message}`), null))
    seconds = pcm ? pcmSeconds(pcm) : 0
  }
  const generate = (name, models) => ({
    name,
    models,
    timeoutMs: audio ? generateAudioTimeoutFor(seconds) : image ? config.parseAudioTimeoutMs : config.parseTimeoutMs,
    run: (model, signal) => parseOnce({ ...input, model, signal }),
  })
  const liveTimeoutMs = liveTimeoutFor(seconds)
  const live = {
    name: 'live',
    rotate: true,
    models: liveModelsFor({ audio }),
    // The session's own limit starts once it has a Live slot (liveparse.takeLiveSlot), which may take a few seconds.
    timeoutMs: liveTimeoutMs + config.liveSlotWaitMs,
    run: async (model, signal) => (await import('./liveparse.js')).liveParse({ ...input, pcm, model, signal, timeoutMs: liveTimeoutMs }),
  }
  const [first, ...rest] = config.parseModels
  const backups = [...new Set([...rest, ...config.parseFallbackModels])].filter(m => m !== first)
  const livePrimary = image ? false : audio ? config.voiceParse === 'live' : config.textParse === 'live'
  let lanes
  if (livePrimary) lanes = [live, generate('generate', [first, ...backups])]
  else if (image) lanes = [generate('primary', [first]), generate('backup', backups)]
  else lanes = [generate('primary', [first]), live, generate('backup', backups)]
  lanes = lanes.filter(l => l.models.length)
  return hedge(lanes, {
    hedgeMs: audio ? (seconds >= config.longNoteSeconds ? 0 : config.voiceHedgeMs) : config.parseHedgeMs,
    patienceMs: config.parsePatienceMs,
    interimMs: config.interimAfterMs,
    onInterim,
    signal,
    log: line => console.warn(`[brain] ${line}`),
  })
}

/** The Live models for a voice note (LIVE_PARSE_MODELS) or a text message (LIVE_TEXT_MODELS, else the same list). */
export const liveModelsFor = ({ audio }) => (!audio && config.liveTextModels?.length ? config.liveTextModels : config.liveParseModels)

/** One Live session's time limit for a voice note of this many seconds (text: the base limit). */
export function liveTimeoutFor(seconds = 0) {
  return Math.round(Math.min(config.liveParseMaxTimeoutMs, Math.max(config.liveParseTimeoutMs, 10000 + 750 * seconds)))
}

/** One generateContent attempt's time limit for a voice note: PARSE_AUDIO_TIMEOUT_MS, longer for notes over 40 s. */
function generateAudioTimeoutFor(seconds = 0) {
  return Math.round(config.parseAudioTimeoutMs + 500 * Math.max(0, seconds - 40))
}

export async function checkModels() {
  if (!config.geminiKey) return { ok: false, reason: 'GEMINI_API_KEY missing' }
  try {
    const pager = await gemini().models.list({ config: { pageSize: 200, abortSignal: AbortSignal.timeout(10000) } })
    const names = []
    for await (const m of pager) names.push(String(m.name).replace(/^models\//, ''))
    const want = [...new Set([...config.parseModels, ...config.parseFallbackModels, ...config.liveParseModels, ...config.liveTextModels, config.liveModel, config.geminiTtsModel])]
    const available = want.filter(w => names.includes(w))
    // Listing models can succeed on a key whose project is blocked, so make real calls: one Live parse (the primary
    // path when VOICE_PARSE / TEXT_PARSE = live) and one tiny generateContent call on the first model that answers.
    const usesLive = config.voiceParse === 'live' || config.textParse === 'live'
    // The Live models in the order texts use them; the next one is tried only if one fails (one session normally).
    let live = null
    for (const model of usesLive ? liveModelsFor({ audio: config.textParse !== 'live' }) : []) {
      try {
        const { liveParse } = await import('./liveparse.js')
        const out = await liveParse({ model, text: 'Assalam o alaikum', timeoutMs: 15000 })
        live = { ok: true, model: out.model, ms: out.ms }
        break
      } catch (err) {
        live = { ok: false, model, reason: err.message }
      }
    }
    let generate = { ok: false, reason: 'no generateContent model answered' }
    for (const model of [...new Set([...config.parseModels, ...config.parseFallbackModels])]) {
      try {
        await gemini().models.generateContent({ model, contents: 'Reply with: ok', config: { maxOutputTokens: 16, abortSignal: AbortSignal.timeout(20000) } })
        generate = { ok: true, model }
        break
      } catch (err) {
        noteQuota(model, err)
        generate = { ok: false, model, reason: err.message }
      }
    }
    const ok = Boolean(live?.ok || generate.ok)
    return {
      ok,
      available: [live?.ok && `live:${live.model}`, generate.ok && `generate:${generate.model}`, ...available].filter(Boolean),
      missing: want.filter(w => !names.includes(w)),
      live,
      generate,
      cooldowns: modelCooldowns(),
      ...(ok ? {} : { reason: live?.reason || generate.reason }),
    }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}
