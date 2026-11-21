// Turns ledger results into (a) short Urdu sentences (Urdu script), sent as the WhatsApp text and, when a shop turns
// voice replies on, spoken as a voice note, and (b) a structured Roman Urdu card for replies with tables or reminder
// links. Every number comes from the ledger, never from the AI.
// Keep this file free of node built-ins: the web app imports reminderMessage for the Settings preview.
import { payDetailsOf, payLine } from './paydetails.js'

// Invisible marker at the start of every bot message, so self-chat mode never re-reads its own replies.
export const BOT_MARK = '⁣'

const rs = n => `Rs ${Math.abs(Math.round(n)).toLocaleString('en-PK')}`
const ur = c => c?.nameUrdu || c?.name || ''
const isSupplier = c => c?.listKind === 'suppliers'
const sum = list => list.reduce((s, c) => s + Math.max(0, c.balance), 0)
const parseItems = items => {
  try {
    return items ? JSON.parse(items) : []
  } catch {
    return []
  }
}

// Lists: a list object { name, nameUrdu } — null (or name null) is "General", the khata of everyone not in a list.
const GENERAL = 'General'
const GENERAL_UR = 'عام کھاتہ'
const listLabel = l => l?.name || GENERAL
const listLabelUr = l => (l?.name ? l.nameUrdu || l.name : GENERAL_UR)
const customerList = c => (c?.listName ? { name: c.listName, nameUrdu: c.listNameUrdu || '' } : null)
/** "عام کھاتے میں" / "فیکٹری والے کی لسٹ میں" */
const inListUr = l => (l?.name ? `${listLabelUr(l)} کی لسٹ میں` : 'عام کھاتے میں')

// Spoken counts read naturally ("پانچ انٹریاں"), digits above ten.
const URDU_COUNT = ['صفر', 'ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'نو', 'دس']
const count = n => URDU_COUNT[n] || String(n)
const people = n => (n === 1 ? 'ایک شخص' : `${count(n)} لوگوں`)
const joinUr = parts => (parts.length > 1 ? `${parts.slice(0, -1).join('، ')} اور ${parts[parts.length - 1]}` : parts[0] || '')
const names = (list, max = 5) => list.slice(0, max).map(x => x.name).join(', ') + (list.length > max ? ` +${list.length - max}` : '')

function spokenBalance(c) {
  if (isSupplier(c)) {
    if (c.balance > 0) return `اب آپ نے ${ur(c)} کو کل ${c.balance} روپے دینے ہیں۔`
    if (c.balance === 0) return `${ur(c)} کا حساب صاف ہو گیا ہے۔`
    return `${ur(c)} کے پاس آپ کے ${Math.abs(c.balance)} روپے ایڈوانس ہیں۔`
  }
  if (c.balance > 0) return `اب ${ur(c)} کا کل بقایا ${c.balance} روپے ہے۔`
  if (c.balance === 0) return `${ur(c)} کا حساب صاف ہو گیا ہے۔`
  return `${ur(c)} کے ${Math.abs(c.balance)} روپے ایڈوانس جمع ہیں۔`
}

/** A supplier's balance, said from the shop's side. */
const supplierOwe = c =>
  c.balance > 0 ? `aap ne dene hain *${rs(c.balance)}*` : c.balance === 0 ? 'hisaab *saaf*' : `un ke paas aap ke *${rs(c.balance)}* advance`

function textBalance(c) {
  if (isSupplier(c)) {
    if (c.balance > 0) return `Aap ne ${c.name} ko dene hain: *${rs(c.balance)}*`
    if (c.balance === 0) return `${c.name} ka hisaab *saaf* hai`
    return `${c.name} ke paas aap ke *${rs(c.balance)}* advance hain`
  }
  if (c.balance > 0) return `${c.name} ka kul baqaya: *${rs(c.balance)}*`
  if (c.balance === 0) return `${c.name} ka hisaab *saaf* hai`
  return `${c.name} ke *${rs(c.balance)}* advance jama hain`
}

const balanceText = c => (c.balance < 0 ? `${rs(c.balance)} adv` : rs(c.balance))
const shortBalance = c => (c.balance === 0 ? 'saaf' : balanceText(c))

/**
 * Only for customers who owe money; callers must not ask for an advance as if it were a debt, nor a supplier.
 * `payDetails` (paydetails.js, the shop's own wallet / Raast / IBAN): one sentence saying where to pay. Without them
 * the text is exactly what it always was.
 */
export function reminderMessage(shopName, customer, payDetails = null) {
  if (!(customer.balance > 0) || isSupplier(customer)) return null
  const pay = payLine(payDetails)
  return `Assalam o Alaikum ${customer.name}, ${shopName || 'hamari dukaan'} ke khate mein aap ka ${rs(customer.balance)} baqaya hai.${pay ? ` ${pay}` : ''} Meharbani kar ke jald ada kar dein. Shukriya!`
}

// encodeURIComponent leaves ( ) ' * as they are; escape them too, so a link sent in a WhatsApp text card is never cut
// short at "(Account name)" or "Ali's". The decoded text is the same. A link is byte-identical to before only when its
// text has none of ( ) ' * (for example a shop called "Ali's Store" now gets "Ali%27s").
const SUB_DELIMS = /[()'*]/g
export function whatsappLink(phone, text) {
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text).replace(SUB_DELIMS, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)}` : null
}

export const HELP_TEXT = [
  '*Hisaab* — aise istemal karein',
  'Apne "Message yourself" chat mein voice note ya message bhejein:',
  '',
  '• "Umar ne 500 ka sauda liya" — udhaar likhein',
  '• "Umar ne 300 wapis diye" — wasooli likhein',
  '• "Umar ka hisaab batao" — baqaya poochein',
  '• "Kis kis ka udhaar hai?" — poori list',
  '• "Umar ka number 0300 1234567" — number save',
  '• "Umar ko reminder bhejo" — yaad dihani ka message',
  '• "Factory wale ki list bana do" — nayi list',
  '• "Umar ko Factory list mein daal do" — list badlein',
  '• "meri lists" — har list ka hisaab',
  '• "Rehman Traders se 20,000 ka maal udhaar liya" — supplier khata',
  '• "undo" — pichli entry cancel',
  '• "dashboard" — website ka login link',
].join('\n')

export const HELP_SPOKEN = 'آپ بول کر ادھار اور وصولی لکھوا سکتے ہیں۔ جیسے: عمر نے پانچ سو کا سودا لیا۔ یا: عمر نے تین سو واپس دیے۔ الگ الگ لسٹیں بھی بن سکتی ہیں، جیسے فیکٹری والے۔'

/** One line per customer, aligned for WhatsApp's monospace block. */
function table(list) {
  return '```' + list.map(x => `${x.name.padEnd(16).slice(0, 16)}${balanceText(x).padStart(12)}`).join('\n') + '```'
}

/** One line per list: name, people, total owed (to the shop, or by the shop for a suppliers list). */
function listTable(lists) {
  return '```' + lists.map(l => `${listLabel(l).padEnd(12).slice(0, 12)} ${`${l.people} log`.padStart(6)}${rs(l.total).padStart(11)}`).join('\n') + '```'
}

// What a query was scoped to (see ledger scopeFor): null = all customers.
const scopeLabel = s => (!s ? null : s.list ? s.list.name : s.general ? GENERAL : 'Suppliers')
const scopeLabelUr = s => (!s ? null : s.list ? s.list.nameUrdu || s.list.name : s.general ? GENERAL_UR : 'سپلائرز')
const scopeIsSuppliers = s => s?.kind === 'suppliers'
/** 'فیکٹری والے کی لسٹ میں' / 'عام کھاتے کا' / 'سپلائرز کے' — a scope followed by a postposition. */
const scopeUr = (s, p) => (!s ? '' : s.list ? `${s.list.nameUrdu || s.list.name} کی لسٹ ${p}` : s.general ? `عام کھاتے ${p}` : `سپلائرز ${p}`)
const suppliersCount = n => `${n} supplier${n === 1 ? '' : 's'}`

const ENTRY_TYPES = new Set(['credit', 'payment', 'purchase', 'supplier_payment'])
const isEntryWrite = r => ENTRY_TYPES.has(r.type) && r.status === 'ok'

/** 3+ entries in one message: a numbered list with each new balance, one total line, a short spoken summary. */
function multiEntry(writes) {
  const lines = [`*${writes.length} entries likh di:*`]
  const totals = { credit: 0, payment: 0, purchase: 0, supplier_payment: 0 }
  writes.forEach((r, i) => {
    const c = r.customer
    const amount = rs(r.entry.amount)
    totals[r.type] += r.entry.amount
    const who = c.listName && !isSupplier(c) ? `${c.listName}: ${c.name}` : c.name
    const isNew = r.isNew ? ' (naya)' : ''
    const line = {
      credit: () => `${who} — udhaar ${amount}${isNew} · baqaya ${shortBalance(c)}`,
      payment: () => `${who} se ${amount} wasool${isNew} · baqaya ${shortBalance(c)}`,
      purchase: () => `${c.name} (supplier) — maal ${amount}${isNew} · dene ${shortBalance(c)}`,
      supplier_payment: () => `${c.name} (supplier) ko ${amount} ada · dene ${shortBalance(c)}`,
    }[r.type]()
    lines.push(`${i + 1}. ${line}`)
  })
  const text = [
    totals.credit && `udhaar ${rs(totals.credit)}`,
    totals.payment && `wasooli ${rs(totals.payment)}`,
    totals.purchase && `maal liya ${rs(totals.purchase)}`,
    totals.supplier_payment && `suppliers ko ada ${rs(totals.supplier_payment)}`,
  ].filter(Boolean)
  lines.push(`*Total:* ${text.join(' · ')}`)
  const said = [
    totals.credit && `${totals.credit} روپے ادھار`,
    totals.payment && `${totals.payment} روپے وصول`,
    totals.purchase && `سپلائرز سے ${totals.purchase} روپے کا مال`,
    totals.supplier_payment && `سپلائرز کو ${totals.supplier_payment} روپے ادا`,
  ].filter(Boolean)
  const spoken = `${count(writes.length)} انٹریاں لکھ دی ہیں: ${joinUr(said)}۔ تفصیل میسج میں ہے۔`
  return { lines, spoken }
}

/** "Factory walon ko reminder bhejo": a wa.me link per person with a number, and who still needs one. */
function listReminders(r, shop, s, t, pay) {
  const label = scopeLabel(r.scope)
  if (r.suppliers) {
    s.push('سپلائرز کو یاد دہانی نہیں بھیجی جاتی، ان کو تو آپ نے پیسے دینے ہیں۔')
    t.push('Suppliers ko reminder nahi bheja jata — un ko to aap ne paise dene hain.')
    return
  }
  if (!r.list.length) {
    s.push(r.scope ? `${scopeUr(r.scope, 'میں')} کسی کا ادھار باقی نہیں۔` : 'کسی کا کوئی ادھار باقی نہیں۔')
    t.push(label ? `${label}: kisi ka udhaar baqi nahi` : 'Koi udhaar baqi nahi')
    return
  }
  const withPhone = r.list.filter(c => c.phone)
  const without = r.list.filter(c => !c.phone)
  const MAX_LINKS = 15
  t.push(`*${label ? `${label} — ` : ''}reminders* (${r.list.length} log · ${rs(sum(r.list))})`)
  if (withPhone.length) {
    t.push('Har link par tap karein — message likha hua khul jayega:', '')
    withPhone.slice(0, MAX_LINKS).forEach((c, i) => t.push(`${i + 1}. ${c.name} — ${rs(c.balance)}`, whatsappLink(c.phone, reminderMessage(shop, c, pay))))
    if (withPhone.length > MAX_LINKS) t.push(`…aur ${withPhone.length - MAX_LINKS} log — baqi dashboard se bhejein`)
  }
  if (without.length) {
    t.push(
      '',
      `${without.length} ${without.length === 1 ? 'bande' : 'logon'} ka number save nahi: ${names(without, 6)}`,
      `_Number save karne ke liye bolein: "${without[0].name} ka number 0300 1234567"_`,
    )
  }
  const where = r.scope ? `${scopeUr(r.scope, 'کے')} ` : ''
  let said = `${where}${people(r.list.length)} کے لیے یاد دہانی تیار ہے۔`
  if (!withPhone.length) said += ' کسی کا نمبر محفوظ نہیں، پہلے نمبر محفوظ کر لیں۔'
  else if (without.length) said += ` ${withPhone.length === 1 ? 'ایک کا لنک بھیج دیا' : `${count(withPhone.length)} کے لنک بھیج دیے`}، ${count(without.length)} کا نمبر محفوظ نہیں۔`
  else said += ' سب کے لنک بھیج دیے ہیں۔'
  s.push(said)
}

function listsSummary(r, s, t) {
  const [general, ...lists] = r.lists
  if (!lists.length) {
    s.push(`ابھی کوئی الگ لسٹ نہیں بنی، سب لوگ عام کھاتے میں ہیں۔ کل ادھار ${general.total} روپے ہے۔`)
    t.push(`Abhi koi alag list nahi — sab *General* (aam khata) mein hain: ${general.people} log · udhaar ${rs(general.total)}`, '_Nayi list ke liye bolein: "Factory wale ki list bana do"_')
    return
  }
  const customerLists = [general, ...lists.filter(l => l.kind === 'customers')]
  const supplierLists = lists.filter(l => l.kind === 'suppliers')
  t.push(`*Aap ki lists* (General + ${lists.length})`, listTable(customerLists))
  if (supplierLists.length) t.push('*Suppliers* — aap ne dene hain', listTable(supplierLists))
  t.push(`Kul udhaar: *${rs(r.totals.due)}*${r.totals.payable ? ` · Suppliers ko dene: *${rs(r.totals.payable)}*` : ''}`)

  const top = customerLists.filter(l => l.total > 0).sort((a, b) => b.total - a.total).slice(0, 4)
  let said = `عام کھاتے کے علاوہ آپ کی ${count(lists.length)} ${lists.length === 1 ? 'لسٹ ہے' : 'لسٹیں ہیں'}۔`
  if (top.length) said += ` ادھار: ${top.map(l => `${listLabelUr(l)} ${l.total} روپے`).join('، ')}۔`
  if (r.totals.payable) said += ` سپلائرز کو ${r.totals.payable} روپے دینے ہیں۔`
  s.push(said)
}

/** The spoken and text lines for one result. `pay`: the shop's payment details for reminders (or null). */
function describe(r, shop, pay) {
  const s = []
  const t = []
  const c = r.customer
  const label = scopeLabel(r.scope)
  const labelUr = scopeLabelUr(r.scope)

  if (r.status === 'ambiguous' || r.status === 'confirm') {
    s.push(`کون سے؟ ${r.candidates.map(ur).join('، یا ')}؟`)
    t.push(`Kaun se? ${r.candidates.map(x => x.name).join(' / ')} — poora naam bol dein`)
    return [s, t]
  }
  if (r.status === 'not_found') {
    s.push('اس نام کا کوئی کھاتہ نہیں ملا۔')
    t.push(`"${r.name || '?'}" naam ka koi khata nahi mila`)
    return [s, t]
  }
  if (r.status === 'list_not_found') {
    const lists = r.candidates || []
    const options = lists.map(l => l.name).join(' / ')
    if (r.kindConflict && lists[0]) {
      // The list with that name holds the other kind of people (an older customers list called "Suppliers").
      const l = lists[0]
      const suppliersList = l.kind === 'suppliers'
      s.push(`${listLabelUr(l)} کی لسٹ ${suppliersList ? 'سپلائرز' : 'گاہکوں'} کی ہے، اس لیے کچھ نہیں لکھا۔ ڈیش بورڈ پر اس لسٹ کا نام بدل کر دوبارہ بھیجیں۔`)
      t.push(`*${l.name}* list ${suppliersList ? 'suppliers' : 'customers'} ki hai — kuch nahi likha.`, '_Dashboard par is list ka naam badal dein, phir dobara bhejein._')
    } else if (!r.name) {
      s.push('کس لسٹ میں ڈالوں؟ لسٹ کا نام بتا دیں۔')
      t.push(`Kis list mein daalun?${options ? ` Aap ki lists: ${options}` : ' List ka naam bolein, jaise "Umar ko Factory wale list mein daal do"'}`)
    } else if (r.listAmbiguous) {
      s.push(`کون سی لسٹ؟ ${lists.map(listLabelUr).join('، یا ')}؟`)
      t.push(`Kaunsi list? ${options} — poora naam bol dein`)
    } else {
      s.push(lists.length ? `اس نام کی کوئی لسٹ نہیں ملی۔ آپ کی لسٹیں ہیں: ${lists.map(listLabelUr).join('، ')}۔` : 'اس نام کی کوئی لسٹ نہیں ملی۔ ابھی کوئی لسٹ نہیں بنی۔')
      t.push(`"${r.name}" naam ki koi list nahi mili.`, options ? `Aap ki lists: ${options}` : 'Abhi koi list nahi bani. Banane ke liye bolein: "Factory wale ki list bana do"')
    }
    return [s, t]
  }
  if (r.status === 'too_many') {
    s.push('بیس سے زیادہ لسٹیں نہیں بن سکتیں۔ پہلے کوئی پرانی لسٹ ختم کر دیں۔ کچھ نہیں لکھا۔')
    t.push('Zyada se zyada 20 lists ban sakti hain — nayi list nahi bani, kuch nahi likha. Pehle dashboard se koi purani list mita dein.')
    return [s, t]
  }
  if (r.status === 'not_supplier') {
    s.push(`${ur(c)} آپ کے گاہک ہیں، سپلائر نہیں، اس لیے کچھ نہیں لکھا۔ کیا ان کا سپلائر کھاتہ کھولنا ہے؟`)
    t.push(`*${c.name}* aap ke customer hain, supplier nahi — kuch nahi likha.`)
    t.push(
      c.entriesCount
        ? `Supplier khata kholna hai? Alag naam se bolein, jaise "${c.name} Traders se 5,000 ka maal udhaar liya".`
        : `Supplier khata kholna hai? Bolein: "${c.name} ko suppliers list mein daal do", phir dobara bhejein.`,
    )
    return [s, t]
  }

  switch (r.type) {
    case 'credit':
    case 'payment':
    case 'purchase':
    case 'supplier_payment': {
      if (r.status === 'needs_amount') {
        s.push(`${ur(c)} کے کھاتے میں کتنے روپے لکھوں؟`)
        t.push(`${c.name} — kitne rupay likhun? Raqam ke saath dobara bolein.`)
        break
      }
      if (r.status === 'needs_name') {
        s.push('کس کے کھاتے میں لکھوں؟ نام بتا دیں۔')
        t.push('Kis ke khate mein likhun? Naam ke saath dobara bolein.')
        break
      }
      if (r.status === 'already_clear') {
        // Nothing owed: either exactly settled, or they have money in advance with the shop.
        s.push(c.balance < 0 ? spokenBalance(c) : `${ur(c)} کا حساب پہلے سے صاف ہے۔`)
        t.push(c.balance < 0 ? textBalance(c) : `${c.name} ka hisaab pehle se saaf hai`)
        break
      }
      if (r.status !== 'ok') break
      const { amount } = r.entry
      const items = parseItems(r.entry.items)
      const fresh = r.isNew && Math.abs(c.balance) === amount
      const list = customerList(c)
      const who = list && !isSupplier(c) ? `${list.name}: ${c.name}` : c.name
      if (r.type === 'credit') {
        s.push(r.isNew ? `${ur(c)} کا نیا کھاتہ ${list ? `${inListUr(list)} ` : ''}کھول کر ${amount} روپے ادھار لکھ دیا۔` : `${ur(c)} کے کھاتے میں ${amount} روپے لکھ دیے۔`)
        t.push(`${who} — udhaar *${rs(amount)}* likh diya${r.isNew ? ' (naya khata)' : ''}`)
      } else if (r.type === 'payment') {
        s.push(`${ur(c)} سے ${amount} روپے وصول ہو گئے۔`)
        t.push(`${who} se *${rs(amount)}* wasool${r.isNew ? ' (naya khata)' : ''}`)
      } else if (r.type === 'purchase') {
        s.push(r.isNew ? `${ur(c)} کا سپلائر کھاتہ کھول کر ${amount} روپے کا مال ادھار لکھ دیا۔` : `${ur(c)} سے ${amount} روپے کا مال ادھار لکھ دیا۔`)
        t.push(`${c.name} (supplier) — *${rs(amount)}* ka maal udhaar liya${r.isNew ? ' (naya khata)' : ''} · ${supplierOwe(c)}`)
      } else {
        s.push(`${ur(c)} کو ${amount} روپے ادا کر دیے۔`)
        t.push(`${c.name} (supplier) ko *${rs(amount)}* ada kiye · ${supplierOwe(c)}`)
      }
      if (items.length) t.push(`_${items.join(', ')}_`)
      // A brand-new khata's balance is the amount just said: no need to say it twice.
      if (!(fresh && (r.type === 'credit' || r.type === 'purchase'))) s.push(spokenBalance(c))
      if (!isSupplier(c)) t.push(textBalance(c))
      if (r.listCreated) {
        s.push(`${listLabelUr(r.listCreated)} کی نئی لسٹ بھی بنا دی۔`)
        t.push(`_Nayi ${r.listCreated.kind === 'suppliers' ? 'supplier ' : ''}list bani: ${r.listCreated.name}_`)
      }
      if (r.listFull) t.push(`_20 lists ki hadd poori hai — ${c.name} ko General mein rakha_`)
      break
    }
    case 'undo':
      if (r.status !== 'ok') {
        s.push('کینسل کرنے کے لیے کوئی نئی انٹری نہیں ملی۔ کسی پرانی انٹری کو کینسل کرنا ہو تو نام کے ساتھ بتائیں۔')
        t.push('Pichle message ki koi entry nahi mili. Purani entry cancel karni ho to naam ke saath bolein, jaise "Umar wali entry cancel karo".')
        break
      }
      s.push(`${ur(c)} کی ${r.entry.amount} روپے والی انٹری کینسل کر دی۔`, spokenBalance(c))
      t.push(`Cancel: ~${c.name} ${rs(r.entry.amount)}~`, textBalance(c))
      break
    case 'correct':
      if (r.status === 'needs_amount' && c) {
        s.push(`${ur(c)} کی انٹری کتنے روپے کی کروں؟`)
        t.push(`${c.name} ki entry kitne rupay ki karun?`)
        break
      }
      if (r.status !== 'ok') {
        s.push('درست کرنے کے لیے کوئی نئی انٹری نہیں ملی۔ نام کے ساتھ بتائیں، جیسے: عمر والی انٹری چار سو کر دو۔')
        t.push('Durust karne ke liye koi nayi entry nahi mili. Naam ke saath bolein, jaise "Umar wali entry 400 kar do".')
        break
      }
      s.push(`درست کر دیا، ${ur(c)} کی انٹری اب ${r.entry.amount} روپے ہے۔`, spokenBalance(c))
      t.push(`${c.name}: ~${rs(r.old.amount)}~ → *${rs(r.entry.amount)}*`, textBalance(c))
      break
    case 'set_phone':
      if (r.status === 'needs_name') {
        s.push('کس کا نمبر محفوظ کروں؟ نام کے ساتھ دوبارہ بتا دیں۔')
        t.push('Kis ka number save karun? Naam ke saath bolein, jaise "Umar ka number 0300 1234567".')
        break
      }
      if (r.status === 'bad_phone') {
        s.push('نمبر صاف سمجھ نہیں آیا، دوبارہ بتا دیں۔')
        t.push(`${c.name} ka number samajh nahi aaya — dobara likhein, jaise 0300 1234567`)
        break
      }
      s.push(`${ur(c)} کا نمبر محفوظ کر لیا۔`)
      t.push(`${c.name} ka number save: ${c.phoneLocal}`)
      break
    case 'balance':
      if (r.status === 'needs_name') {
        s.push('کس کا حساب بتاؤں؟ نام کے ساتھ پوچھیں۔')
        t.push('Kis ka hisaab batayun? Naam ke saath poochein, jaise "Umar ka hisaab batao".')
        break
      }
      if (isSupplier(c)) {
        s.push(c.balance > 0 ? `آپ نے ${ur(c)} کو ${c.balance} روپے دینے ہیں۔` : spokenBalance(c))
        t.push(`${c.name} (supplier) — ${supplierOwe(c)}`)
        break
      }
      s.push(c.balance > 0 ? `${ur(c)} کے ذمے ${c.balance} روپے ہیں۔` : spokenBalance(c))
      t.push(textBalance(c))
      if (c.balance > 0 && c.unpaidDays != null) t.push(`_${c.unpaidDays} din se koi wasooli nahi_`)
      if (c.listName) t.push(`_List: ${c.listName}_`)
      break
    case 'reminder': {
      if (r.status === 'needs_name') {
        s.push('کس کو یاد دہانی بھیجوں؟ نام یا لسٹ بتا دیں۔')
        t.push('Kis ko reminder bhejun? Naam ya list ke saath bolein, jaise "Umar ko reminder bhejo" ya "Factory walon ko reminder bhejo".')
        break
      }
      if (!c) {
        listReminders(r, shop, s, t, pay)
        break
      }
      if (isSupplier(c)) {
        s.push(`${ur(c)} آپ کے سپلائر ہیں، ان کو یاد دہانی نہیں بھیجی جاتی۔`, spokenBalance(c))
        t.push(`${c.name} supplier hain — reminder sirf customers ke liye hai.`, textBalance(c))
        break
      }
      if (c.balance <= 0) {
        s.push(`${ur(c)} کا کوئی بقایا نہیں۔`)
        t.push(`${c.name} ka koi baqaya nahi`)
        break
      }
      const msg = reminderMessage(shop, c, pay)
      const link = whatsappLink(c.phone, msg)
      s.push(`${ur(c)} کے لیے یاد دہانی کا پیغام تیار ہے۔`)
      t.push(`${c.name} ke liye reminder (${rs(c.balance)}):`, '', msg)
      t.push('', link ? `Seedha ${c.name} ko bhejne ke liye tap karein:\n${link}` : `Upar wala message ${c.name} ko forward kar dein. Number save karne ke liye bolein: "${c.name} ka number 0300..."`)
      break
    }
    case 'dues_list': {
      const suppliers = scopeIsSuppliers(r.scope)
      const above = r.threshold ? ` (${rs(r.threshold)} se zyada)` : ''
      if (!r.list.length) {
        if (suppliers) {
          s.push('کسی سپلائر کا کوئی بقایا نہیں۔')
          t.push(`${label}: kisi ko kuch dena baqi nahi`)
        } else if (r.scope) {
          s.push(r.threshold ? `${scopeUr(r.scope, 'میں')} کسی کا ادھار ${r.threshold} روپے سے زیادہ نہیں۔` : `${scopeUr(r.scope, 'میں')} کسی کا ادھار باقی نہیں۔`)
          t.push(`${label}: ${r.threshold ? `kisi ka udhaar ${rs(r.threshold)} se zyada nahi` : 'koi udhaar baqi nahi'}`)
        } else {
          s.push(r.threshold ? `کسی کا ادھار ${r.threshold} روپے سے زیادہ نہیں۔` : 'کسی کا کوئی ادھار باقی نہیں۔')
          t.push(r.threshold ? `Kisi ka udhaar ${rs(r.threshold)} se zyada nahi` : 'Koi udhaar baqi nahi')
        }
        break
      }
      const top = r.list.slice(0, 5).map(x => `${ur(x)} ${x.balance}`).join('، ')
      const total = sum(r.list)
      if (suppliers) {
        const who = r.list.length === 1 ? 'ایک سپلائر' : `${count(r.list.length)} سپلائرز`
        s.push(`آپ نے ${who} کو کل ${total} روپے دینے ہیں۔ ${top} روپے۔`)
        t.push(`*${label} — aap ne dene hain*`, table(r.list.slice(0, 30)), `Kul: *${rs(total)}* (${suppliersCount(r.list.length)})`)
      } else if (r.scope) {
        s.push(`${scopeUr(r.scope, 'میں')} ${people(r.list.length)} کا ادھار ${r.threshold ? `${r.threshold} روپے سے زیادہ ` : ''}باقی ہے، کل ${total} روپے۔ ${top} روپے۔`)
        t.push(`*${label} — udhaar list*${above}`, table(r.list.slice(0, 30)), `Kul: *${rs(total)}* (${r.list.length} log)`)
      } else {
        s.push(`${people(r.list.length)} کا ادھار ${r.threshold ? `${r.threshold} روپے سے زیادہ ` : ''}باقی ہے۔ ${top} روپے۔`)
        t.push(`*Udhaar list*${above}`, table(r.list.slice(0, 30)))
      }
      break
    }
    case 'total_due': {
      if (r.scoped) {
        const { total, owing } = r.scoped
        if (scopeIsSuppliers(r.scope)) {
          s.push(total ? `آپ نے ${labelUr} کو کل ${total} روپے دینے ہیں۔` : `${labelUr} کو کچھ دینا باقی نہیں۔`)
          t.push(total ? `${label} ko kul dene hain: *${rs(total)}* (${suppliersCount(owing)})` : `${label}: kuch dena baqi nahi`)
        } else {
          s.push(total ? `${scopeUr(r.scope, 'کا')} کل ادھار ${total} روپے ہے، ${people(owing)} کے ذمے۔` : `${scopeUr(r.scope, 'میں')} کسی کا ادھار باقی نہیں۔`)
          t.push(total ? `${label} ka kul udhaar: *${rs(total)}* (${owing} log)` : `${label}: koi udhaar baqi nahi`)
        }
        break
      }
      const totals = r.overview.totals
      s.push(totals.due ? `کل ادھار ${totals.due} روپے ہے، ${people(totals.customersWithDue)} کے ذمے۔` : 'کسی کا کوئی ادھار باقی نہیں۔')
      t.push(`Kul udhaar: *${rs(totals.due)}* (${totals.customersWithDue} log)`)
      if (totals.payable > 0) t.push(`_Suppliers ko dene: ${rs(totals.payable)}_`)
      break
    }
    case 'today_summary': {
      const d = r.overview.today
      s.push(`آج ${d.given} روپے کا ادھار دیا اور ${d.collected} روپے وصول ہوئے۔`)
      t.push(`*Aaj*: udhaar ${rs(d.given)} · wasooli ${rs(d.collected)}`)
      break
    }
    case 'full_ledger': {
      const list = r.customers.filter(x => x.balance !== 0).sort((a, b) => b.balance - a.balance)
      if (r.scope) {
        const total = r.scoped.total
        if (scopeIsSuppliers(r.scope)) {
          s.push(`آپ نے ${labelUr} کو کل ${total} روپے دینے ہیں۔ پوری فہرست بھیج دی۔`)
          t.push(`*${label} — poora khata*`, list.length ? table(list.slice(0, 40)) : 'Sab hisaab saaf hai', `Kul dene hain: *${rs(total)}*`)
        } else {
          s.push(`${scopeUr(r.scope, 'کا')} کل ادھار ${total} روپے ہے۔ پوری فہرست بھیج دی۔`)
          t.push(`*${label} — poora khata*`, list.length ? table(list.slice(0, 40)) : 'Sab hisaab saaf hai', `Kul: *${rs(total)}*`)
        }
        break
      }
      s.push(`کل ادھار ${r.overview.totals.due} روپے ہے۔ پوری فہرست بھیج دی۔`)
      t.push(`*Poora khata*${shop ? ` — ${shop}` : ''}`, list.length ? table(list.slice(0, 40)) : 'Sab hisaab saaf hai', `Kul: *${rs(r.overview.totals.due)}*`)
      const suppliers = (r.suppliers || []).filter(x => x.balance !== 0).sort((a, b) => b.balance - a.balance)
      if (suppliers.length) {
        s.push(`سپلائرز کو ${r.overview.totals.payable} روپے دینے ہیں۔`)
        t.push('', '*Suppliers — aap ne dene hain*', table(suppliers.slice(0, 20)), `Kul dene hain: *${rs(r.overview.totals.payable)}*`)
      }
      break
    }
    case 'create_list': {
      const l = r.listRef
      if (r.status === 'needs_name') {
        s.push('لسٹ کا نام کیا رکھوں؟')
        t.push('List ka naam kya rakhun? Jaise: "Factory wale ki list bana do"')
      } else if (r.status === 'exists') {
        if (!l?.name) {
          s.push('عام کھاتہ پہلے سے موجود ہے، جو کسی لسٹ میں نہیں وہ اسی میں ہیں۔')
          t.push('*General* (aam khata) pehle se hai — jo kisi list mein nahi, woh isi mein hain')
        } else {
          s.push(`${listLabelUr(l)} کی لسٹ پہلے سے موجود ہے۔`)
          t.push(`*${l.name}* list pehle se hai (${l.people} log${l.total ? ` · ${rs(l.total)}` : ''})`)
        }
      } else if (r.status === 'ok' && l.kind === 'suppliers') {
        s.push(/^suppliers?$/i.test(l.name) ? 'سپلائرز کی نئی لسٹ بنا دی۔' : `${listLabelUr(l)} کے نام سے سپلائرز کی نئی لسٹ بنا دی۔`)
        t.push(`Nayi supplier list ban gayi: *${l.name}*`, '_Is mein woh log jin ko aap ne paise dene hain. Bolein: "Rehman Traders se 20,000 ka maal udhaar liya"_')
      } else if (r.status === 'ok') {
        s.push(`${listLabelUr(l)} کے نام سے نئی لسٹ بنا دی۔`)
        t.push(`Nayi list ban gayi: *${l.name}*`, `_Log daalne ke liye bolein: "Asif ko ${l.name} list mein daal do" — ya naye bande ke saath list ka naam bolein._`)
      }
      break
    }
    case 'move_to_list': {
      const l = r.listRef
      const where = l?.name ? `*${l.name}* list` : '*General* (aam khata)'
      if (r.status === 'needs_name') {
        s.push('کس کو لسٹ میں ڈالوں؟ نام کے ساتھ دوبارہ بتا دیں۔')
        t.push('Kis ko list mein daalun? Naam ke saath bolein, jaise "Umar ko Factory list mein daal do".')
        break
      }
      if (r.status === 'has_entries') {
        s.push(`${ur(c)} کے کھاتے میں انٹریاں موجود ہیں، اس لیے گاہک اور سپلائر کا کھاتہ آپس میں نہیں بدل سکتا۔ کچھ نہیں بدلا۔`)
        t.push(`${c.name} ke khate mein entries hain — customer aur supplier khate aapas mein nahi badal sakte. Kuch nahi badla.`)
        t.push(isSupplier(c) ? `_Customer ke liye alag naam se naya khata kholein._` : `_Supplier ke liye alag naam se khata kholein, jaise "${c.name} Traders se 5,000 ka maal udhaar liya"_`)
        break
      }
      if (r.status !== 'ok') break
      if (r.unchanged) {
        s.push(`${ur(c)} پہلے سے ${inListUr(l)} ہیں۔`)
        t.push(`${c.name} pehle se ${where} mein hain`)
        break
      }
      s.push(`${ur(c)} کو ${inListUr(l)} ڈال دیا۔${r.listCreated ? ' یہ نئی لسٹ بھی بنا دی۔' : ''}`)
      t.push(`${c.name} ko ${where} mein daal diya${r.listCreated ? ' (nayi list bani)' : ''}`)
      if (c.balance) t.push(`_${textBalance(c)}_`.replace(/\*/g, ''))
      break
    }
    case 'lists_summary':
      listsSummary(r, s, t)
      break
    case 'help':
      s.push(HELP_SPOKEN)
      t.push(HELP_TEXT)
      break
    default:
      break
  }
  return [s, t]
}

// Replies that carry a table or wa.me links keep the structured Roman Urdu card; every other reply is sent as
// natural Urdu sentences.
const STRUCTURED = new Set(['reminder', 'dues_list', 'full_ledger', 'lists_summary', 'help'])
const OPENERS = ['جی، ', 'ٹھیک ہے، ', 'بالکل، ', 'جی بہتر، ']
const urduRs = n => `${Math.abs(Math.round(n)).toLocaleString('en-PK')} روپے`
/** Amounts in the Urdu sentences read "3,000 روپے" and stand out in bold on WhatsApp. */
const boldAmounts = s => s.replace(/(\d+) روپے/g, (_, n) => `*${Number(n).toLocaleString('en-PK')} روپے*`)

/** The reply as natural Urdu: what was done, the new balance, the shop's total, and how to fix a mistake. */
function urduReply(results, writes, sentences, totals) {
  const lines = sentences.map(boldAmounts)
  const wrote = results.filter(r => (ENTRY_TYPES.has(r.type) || r.type === 'undo' || r.type === 'correct') && r.status === 'ok')
  if (writes.length && lines.length) {
    // A short, varied opener so the same kind of entry does not read like a form every time.
    const pick = [...lines[0]].reduce((n, ch) => n + ch.charCodeAt(0), 0) % OPENERS.length
    lines[0] = OPENERS[pick] + lines[0]
  }
  if (wrote.length) {
    const forSuppliers = wrote.some(r => isSupplier(r.customer))
    const forCustomers = wrote.some(r => !isSupplier(r.customer))
    const footer = []
    if (forCustomers || !forSuppliers) footer.push(`دکان کا کل ادھار: ${urduRs(totals.due)}`)
    if (forSuppliers && totals.payable != null) footer.push(`سپلائرز کو دینے ہیں: ${urduRs(totals.payable)}`)
    const last = writes[writes.length - 1]
    footer.push(writes.length >= 2 ? `غلطی ہو تو نام کے ساتھ بولیں: «${ur(last.customer)} والی انٹری کینسل کرو»` : 'غلطی ہو تو بول دیں: «پچھلی انٹری کینسل کرو»')
    lines.push('', ...footer.map(f => `_${f}_`))
  }
  return `${BOT_MARK}*حساب*\n${lines.join('\n')}`
}

export function buildReply(results, parsed, { tenant, totals }) {
  const spoken = []
  const lines = []
  const shop = tenant.shop_name
  const pay = payDetailsOf(tenant)

  const writes = results.filter(isEntryWrite)
  const compact = writes.length >= 3
  if (compact) {
    const block = multiEntry(writes)
    spoken.push(block.spoken)
    lines.push(...block.lines)
  }
  for (const r of results) {
    if (compact && isEntryWrite(r)) continue
    const [s, t] = describe(r, shop, pay)
    spoken.push(...s)
    lines.push(...t)
  }

  if (!spoken.length) {
    spoken.push(parsed.replyUrdu || 'جی، بتائیں کس کے کھاتے میں کیا لکھوں؟')
    lines.push(parsed.replyRoman || parsed.replyUrdu || 'Samajh nahi aaya. Aise bolein: "Umar ne 500 ka sauda liya". Madad ke liye "help" likhein.')
  }

  if (!compact && !results.some(r => STRUCTURED.has(r.type))) {
    return { spoken: spoken.join(' '), text: urduReply(results, writes, spoken, totals) }
  }

  const wrote = results.filter(r => (ENTRY_TYPES.has(r.type) || r.type === 'undo' || r.type === 'correct') && r.status === 'ok')
  if (wrote.length) {
    const forSuppliers = wrote.some(r => isSupplier(r.customer))
    const forCustomers = wrote.some(r => !isSupplier(r.customer))
    const parts = []
    if (forCustomers || !forSuppliers) parts.push(`Kul udhaar ${rs(totals.due)}`)
    if (forSuppliers && totals.payable != null) parts.push(`suppliers ko dene ${rs(totals.payable)}`)
    // A plain "undo" cancels only the last entry of a message, so with two or more say which one.
    parts.push(writes.length >= 2 ? `galti ho to naam ke saath bolein: "${writes[writes.length - 1].customer.name} wali entry cancel karo"` : 'galti ho to "undo" bolein')
    const footer = parts.join(' · ')
    lines.push('', `_${footer[0].toUpperCase()}${footer.slice(1)}_`)
  }
  return { spoken: spoken.join(' '), text: `${BOT_MARK}*Hisaab*\n${lines.join('\n')}` }
}

/** Where a result belongs: the list it acted on or was scoped to, else the person's own list. */
function resultList(r) {
  if (r.listRef !== undefined) return r.listRef ? { id: r.listRef.id, name: r.listRef.name, kind: r.listRef.kind } : { id: null, name: null, kind: 'customers' }
  if (r.scope) return r.scope.list ? { id: r.scope.list.id, name: r.scope.list.name, kind: r.scope.list.kind } : { id: null, name: null, kind: r.scope.kind }
  if (r.customer) return { id: r.customer.listId, name: r.customer.listName, kind: r.customer.listKind }
  return null
}

function resultTotal(r) {
  if (r.status !== 'ok') return null
  if (r.type === 'dues_list' || (r.type === 'reminder' && !r.customer)) return sum(r.list || [])
  if (r.scoped) return r.scoped.total
  if (r.type === 'total_due' || r.type === 'full_ledger' || r.type === 'lists_summary') return (r.overview?.totals || r.totals)?.due ?? null
  return null
}

/** Compact, structured record of what a message did — shown in the dashboard's activity log. */
export function summarize(results) {
  return results.map(r => {
    // For these statuses `name` is the list as said, not a person.
    const listProblem = r.status === 'list_not_found' || r.status === 'too_many'
    const list = listProblem ? { id: null, name: r.name || null, kind: null } : resultList(r)
    return {
      type: r.type,
      status: r.status,
      customerId: r.customer?.id || null,
      customerName: r.customer?.name || (listProblem ? null : r.name) || null,
      customerNameUrdu: r.customer?.nameUrdu || null,
      isNew: Boolean(r.isNew),
      kind: r.entry?.kind || null,
      amount: r.entry?.amount ?? null,
      oldAmount: r.old?.amount ?? null,
      items: parseItems(r.entry?.items),
      balance: r.customer?.balance ?? null,
      threshold: r.threshold ?? null,
      candidates: r.candidates?.map(c => c.name) || undefined,
      listId: list?.id ?? null,
      listName: list?.name ?? null,
      listKind: list?.kind ?? null,
      listCreated: Boolean(r.listCreated || (r.type === 'create_list' && r.status === 'ok')),
      kindConflict: r.kindConflict || undefined,
      fromListName: r.fromList !== undefined ? r.fromList?.name ?? null : undefined,
      count: Array.isArray(r.list) ? r.list.length : r.lists ? r.lists.length - 1 : undefined,
      total: resultTotal(r) ?? undefined,
    }
  })
}
