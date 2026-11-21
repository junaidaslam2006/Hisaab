import { useEffect, useMemo, useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import Icon from './Icon.jsx'
import { Button, Field, Segmented, Avatar, Money } from './ui.jsx'
import { useToast } from './Toast.jsx'
import { api } from '../lib/api.js'
import { money } from '../lib/format.js'
import { useStrings, useCommon, useLang } from '../lib/i18n.jsx'
import { ListChip, isSupplier, listName, pickerLists, useListWords } from '../lib/lists.jsx'

const STRINGS = {
  en: {
    titleCredit: 'Add udhaar',
    titlePayment: 'Record payment',
    desc: 'For when you prefer typing. Voice notes on WhatsApp do the same thing.',
    kind: 'Type',
    credit: 'Udhaar given',
    payment: 'Payment received',
    customer: 'Customer',
    person: 'Customer or supplier',
    search: 'Type a name',
    create: n => `Add "${n}" as a new customer`,
    createIn: n => `Add "${n}" as someone new`,
    change: 'Change',
    list: 'Put them in',
    listHint: 'A suppliers list is for people you buy from on credit: you owe them.',
    customerLists: 'Customers lists',
    supplierLists: 'Suppliers lists',
    amount: 'Amount (Rs)',
    note: 'Items or note (optional)',
    notePh: 'e.g. 2 kg sugar, 1 ghee',
    save: 'Save entry',
    needCustomer: 'Choose or add a customer',
    needAmount: 'Enter an amount above 0',
    saved: (k, a, n) => (k === 'credit' ? `${a} udhaar written for ${n}` : `${a} payment written for ${n}`),
    failed: 'Could not save. Please try again.',
    balance: 'Current balance',
    newBalance: n => `${n}’s new balance`,
    sup: {
      titleCredit: 'Record purchase',
      titlePayment: 'Pay supplier',
      customer: 'Supplier',
      credit: 'Goods on credit',
      payment: 'You paid them',
      notePh: 'e.g. 2 bags flour, 1 carton ghee',
      saved: (k, a, n) => (k === 'credit' ? `${a} purchase from ${n} written` : `${a} payment to ${n} written`),
      balance: 'You owe now',
    },
  },
  ur: {
    titleCredit: 'ادھار لکھیں',
    titlePayment: 'وصولی لکھیں',
    desc: 'اگر لکھنا آسان لگے۔ واٹس ایپ پر وائس نوٹ بھی یہی کام کرتا ہے۔',
    kind: 'قسم',
    credit: 'ادھار دیا',
    payment: 'رقم وصول ہوئی',
    customer: 'گاہک',
    person: 'گاہک یا سپلائر',
    search: 'نام لکھیں',
    // No quotes in Urdu (Nastaliq mirrors them); the name is bidi-isolated (FSI…PDI) since it may be Latin or Urdu.
    create: n => `⁨${n}⁩ کو نیا گاہک بنائیں`,
    createIn: n => `⁨${n}⁩ کو نیا شامل کریں`,
    change: 'بدلیں',
    list: 'کس لسٹ میں',
    listHint: 'سپلائرز کی لسٹ ان لوگوں کے لیے ہے جن سے آپ ادھار مال لیتے ہیں: آپ نے انہیں دینا ہے۔',
    customerLists: 'گاہکوں کی لسٹیں',
    supplierLists: 'سپلائرز کی لسٹیں',
    amount: 'رقم (روپے)',
    note: 'سامان یا نوٹ (اختیاری)',
    notePh: 'مثلاً 2 کلو چینی، 1 گھی',
    save: 'محفوظ کریں',
    needCustomer: 'گاہک منتخب کریں یا نیا بنائیں',
    needAmount: 'صفر سے زیادہ رقم لکھیں',
    saved: (k, a, n) => (k === 'credit' ? `⁨${n}⁩ کے کھاتے میں ${a} ادھار لکھ دیا` : `⁨${n}⁩ سے ${a} وصولی لکھ دی`),
    failed: 'محفوظ نہیں ہو سکا، دوبارہ کوشش کریں۔',
    balance: 'موجودہ بقایا',
    newBalance: n => `⁨${n}⁩ کا نیا بقایا`,
    sup: {
      titleCredit: 'خریداری لکھیں',
      titlePayment: 'سپلائر کو ادائیگی',
      customer: 'سپلائر',
      credit: 'مال ادھار لیا',
      payment: 'آپ نے ادائیگی کی',
      notePh: 'مثلاً 2 بوری آٹا، 1 کارٹن گھی',
      saved: (k, a, n) => (k === 'credit' ? `⁨${n}⁩ سے ${a} کی خریداری لکھ دی` : `⁨${n}⁩ کو ${a} کی ادائیگی لکھ دی`),
      balance: 'ابھی آپ نے دینے ہیں',
    },
  },
}

const sameName = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()

/** A balance with what it means: a supplier's positive balance is what you owe them. */
function PersonBalance({ value, supplier, size }) {
  if (supplier) return <Money value={value} tone={value > 0 ? 'payable' : 'neutral'} size={size} />
  return <Money value={value} tone="auto" size={size} />
}

/**
 * Manual entry. Pass `customer` to lock the person (customer page: { id, name, balance, listKind }), or leave it
 * empty to pick or create one (a new person can go into General or any list). `kind`: 'credit' | 'payment'.
 * On a supplier, credit = goods the shop took on credit and payment = the shop paid them; the labels say so.
 */
export default function EntrySheet({ open, onClose, customer: fixed, kind: initialKind = 'credit', onSaved }) {
  const base = useStrings(STRINGS)
  const C = useCommon()
  const W = useListWords()
  const { lang } = useLang()
  const toast = useToast()
  const [kind, setKind] = useState(initialKind)
  const [customers, setCustomers] = useState([])
  const [lists, setLists] = useState([])
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)
  const [listId, setListId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const searchRef = useRef(null)
  const amountRef = useRef(null)
  // Picking (or un-picking) a customer removes the focused control; move focus to the next field instead of <body>.
  const focusNext = useRef(null)

  useEffect(() => {
    focusNext.current?.current?.focus()
    focusNext.current = null
  }, [picked])

  const pick = c => {
    focusNext.current = amountRef
    setPicked(c)
  }
  const unpick = () => {
    focusNext.current = searchRef
    setPicked(null)
  }

  useEffect(() => {
    if (!open) return
    setKind(initialKind)
    setPicked(fixed || null)
    setQuery('')
    setListId('')
    setAmount('')
    setNote('')
    setErrors({})
    if (!fixed) {
      api('/api/customers').then(setCustomers).catch(() => setCustomers([]))
      api('/api/lists').then(setLists).catch(() => setLists([]))
    }
  }, [open, fixed, initialKind])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers.slice().sort((a, b) => (b.lastEntryAt || 0) - (a.lastEntryAt || 0)).slice(0, 5)
    return customers.filter(c => c.name.toLowerCase().includes(q) || c.nameUrdu.includes(query.trim()) || c.phone.includes(q.replace(/\D/g, '') || '§')).slice(0, 6)
  }, [customers, query])
  // The existing customer whose name (or Urdu name) is exactly what was typed: Save uses it instead of creating a twin.
  const exact = useMemo(() => {
    const q = sameName(query)
    return q ? customers.find(c => sameName(c.name) === q || (c.nameUrdu && sameName(c.nameUrdu) === q)) || null : null
  }, [customers, query])

  // Who the entry is for decides the words: a picked supplier, or a new person going into a suppliers list.
  const newList = lists.find(l => l.id === listId) || null
  const target = picked || exact
  const supplier = target && !target.isNew ? isSupplier(target) : newList?.kind === 'suppliers'
  const S = supplier ? { ...base, ...base.sup } : base
  const hasSuppliers = lists.some(l => l.kind === 'suppliers') || customers.some(isSupplier)

  // Live preview of the balance this entry will leave, from the person's real balance.
  const value = Math.round(Number(amount))
  const startBalance = picked ? (typeof picked.balance === 'number' ? picked.balance : picked.isNew ? 0 : null) : null
  const nextBalance = startBalance != null && value > 0 ? startBalance + (kind === 'credit' ? value : -value) : null
  const balanceWord = n => (supplier ? (n > 0 ? W.youOwe : n < 0 ? W.paidAhead : C.settled) : n > 0 ? C.owes : n < 0 ? C.advance : C.settled)

  async function save() {
    const next = {}
    if (!picked && !query.trim()) next.customer = S.needCustomer
    if (!(value > 0)) next.amount = S.needAmount
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      let person = picked || exact || { id: null, name: query.trim(), isNew: true }
      if (person.isNew) {
        person = await api('/api/customers', { method: 'POST', body: { name: person.name.trim(), listId: listId || null } })
        // If the entry below fails, pressing Save again must reuse this customer, not create a second one.
        setPicked(person)
      }
      await api('/api/entries', { method: 'POST', body: { customerId: person.id, kind, amount: value, note: note.trim() || undefined } })
      toast.success(S.saved(kind, money(value), person.name))
      onSaved?.(person)
      onClose()
    } catch {
      toast.error(S.failed)
    } finally {
      setBusy(false)
    }
  }

  const sorted = pickerLists(lists)
  const isNewPick = Boolean(picked?.isNew) || (!picked && query.trim() && !exact)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={kind === 'credit' ? S.titleCredit : S.titlePayment}
      description={S.desc}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{C.cancel}</Button>
          <Button variant="primary" loading={busy} onClick={save}>{S.save}</Button>
        </>
      }
    >
      <Field label={S.kind}>
        <Segmented
          block
          label={S.kind}
          value={kind}
          onChange={setKind}
          options={[{ value: 'credit', label: S.credit }, { value: 'payment', label: S.payment }]}
        />
      </Field>

      {/* A known supplier (fixed, picked or typed exactly) is called one; otherwise say who this field can be. */}
      <Field label={supplier ? S.customer : hasSuppliers ? S.person : S.customer} error={errors.customer} htmlFor="entry-customer">
        {picked ? (
          <div className="entry-picked">
            <Avatar name={picked.name} />
            <div className="row-main">
              <div className="row-title">
                {picked.name} {!picked.isNew && <ListChip person={picked} lang={lang} W={W} />}
              </div>
              {picked.balance != null && (
                <div className="row-meta">
                  {S.balance}: <PersonBalance value={picked.balance} supplier={isSupplier(picked)} />
                </div>
              )}
            </div>
            {!fixed && <Button variant="ghost" onClick={unpick}>{S.change}</Button>}
          </div>
        ) : (
          <>
            <input ref={searchRef} id="entry-customer" className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder={S.search} autoComplete="off" data-autofocus />
            <ul className="entry-matches">
              {matches.map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => pick(c)}>
                    <Avatar name={c.name} />
                    <span className="row-main">
                      <span className="row-title">{c.name}</span>
                      {c.nameUrdu && <span className="ur muted"> {c.nameUrdu}</span>} <ListChip person={c} lang={lang} W={W} />
                    </span>
                    <PersonBalance value={c.balance} supplier={isSupplier(c)} />
                  </button>
                </li>
              ))}
              {query.trim() && !exact && (
                <li>
                  <button type="button" onClick={() => pick({ id: null, name: query.trim(), isNew: true })} className="entry-create">
                    <span className="avatar"><Icon name="plus" size="sm" /></span>
                    <span className="row-main">{lists.length ? S.createIn(query.trim()) : S.create(query.trim())}</span>
                  </button>
                </li>
              )}
            </ul>
          </>
        )}
      </Field>

      {/* A new person: General or one of the shop's lists (a suppliers list makes them a supplier). */}
      {!fixed && isNewPick && lists.length > 0 && (
        <Field label={S.list} htmlFor="entry-list" hint={S.listHint}>
          <select id="entry-list" className="select" value={listId} onChange={e => setListId(e.target.value)}>
            <optgroup label={S.customerLists}>
              <option value="">{W.general}</option>
              {sorted
                .filter(l => l.kind !== 'suppliers')
                .map(l => (
                  <option key={l.id} value={l.id}>{listName(l, lang, W)}</option>
                ))}
            </optgroup>
            {sorted.some(l => l.kind === 'suppliers') && (
              <optgroup label={S.supplierLists}>
                {sorted
                  .filter(l => l.kind === 'suppliers')
                  .map(l => (
                    <option key={l.id} value={l.id}>{listName(l, lang, W)}</option>
                  ))}
              </optgroup>
            )}
          </select>
        </Field>
      )}

      <Field label={S.amount} error={errors.amount} htmlFor="entry-amount">
        <div className="input-group entry-amount">
          <span className="prefix">Rs</span>
          <input ref={amountRef} id="entry-amount" className="input lg num" inputMode="numeric" pattern="[0-9]*" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" aria-invalid={Boolean(errors.amount)} {...(fixed ? { 'data-autofocus': true } : {})} />
        </div>
      </Field>

      <Field label={S.note} htmlFor="entry-note">
        <input id="entry-note" className="input" value={note} onChange={e => setNote(e.target.value)} placeholder={S.notePh} maxLength={200} />
      </Field>

      {nextBalance != null && (
        <div className="entry-preview">
          <span className="label">{S.newBalance(picked.name)}</span>
          <span>
            <PersonBalance value={nextBalance} supplier={supplier} size="lg" />{' '}
            <span className={supplier && nextBalance > 0 ? 'meta lst-payable' : 'meta'}>{balanceWord(nextBalance)}</span>
          </span>
        </div>
      )}
    </Sheet>
  )
}
