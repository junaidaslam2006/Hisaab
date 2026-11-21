import { useStrings } from './i18n.jsx'
import './lists.css'

// Lists of people (General, "Factory wale", "Suppliers") as the pages show them. General is not a list row: it is
// everyone whose listId is null. A suppliers list holds people the SHOP owes: balance > 0 = "you owe them".

const WORDS = {
  en: {
    general: 'General',
    supplier: 'Supplier',
    suppliers: 'Suppliers',
    customer: 'Customer',
    customersKind: 'Customers',
    suppliersKind: 'Suppliers',
    sample: 'Sample',
    sampleTitle: 'Sample data, added from Settings. Removing the sample data removes it.',
    youOwe: 'you owe',
    paidAhead: 'paid ahead',
  },
  ur: {
    general: 'عام کھاتہ',
    supplier: 'سپلائر',
    suppliers: 'سپلائرز',
    customer: 'گاہک',
    customersKind: 'گاہک',
    suppliersKind: 'سپلائرز',
    sample: 'نمونہ',
    sampleTitle: 'نمونے کا ڈیٹا، سیٹنگز سے شامل کیا گیا۔ نمونے کا ڈیٹا ہٹانے سے یہ بھی ہٹ جائے گا۔',
    youOwe: 'آپ نے دینے ہیں',
    paidAhead: 'ایڈوانس دیا',
  },
}

export const useListWords = () => useStrings(WORDS)

export const isSupplier = person => person?.listKind === 'suppliers'

/** A list's name in the UI language. `list` is a List ({ name, nameUrdu }) or null / { name: null } for General. */
export function listName(list, lang, W) {
  if (!list || list.name == null) return W.general
  return (lang === 'ur' && list.nameUrdu) || list.name
}

/** The name of the list a person is in (Customer.listName / listNameUrdu; null = General). */
export function personListName(person, lang, W) {
  return listName(person?.listName == null ? null : { name: person.listName, nameUrdu: person.listNameUrdu }, lang, W)
}

/** The ?list= value that opens a list on the Customers page: 'general' or the list id. */
export const listParam = id => id || 'general'

export const listHref = id => `/app/customers?list=${encodeURIComponent(listParam(id))}`

/** Customers lists first (General leads), then suppliers lists, each oldest first — the order of every list picker. */
export function pickerLists(lists = []) {
  return [...lists.filter(l => l.kind !== 'suppliers'), ...lists.filter(l => l.kind === 'suppliers')]
}

/** The person's list as a small pill (suppliers lists in the payable colour). Renders nothing for General. */
export function ListChip({ person, lang, W, className }) {
  if (!person?.listId) return null
  const name = personListName(person, lang, W)
  const script = /[\u0600-\u06FF]/.test(name) ? 'ur' : 'latin'
  return (
    <span className={['lst-chip', isSupplier(person) && 'is-suppliers', script, className].filter(Boolean).join(' ')} dir="auto">
      {name}
    </span>
  )
}

/** "Sample" pill for demo data added from Settings. */
export function SampleBadge({ W, className }) {
  return (
    <span className={['lst-sample', className].filter(Boolean).join(' ')} title={W.sampleTitle}>
      {W.sample}
    </span>
  )
}
