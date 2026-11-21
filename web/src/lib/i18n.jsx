import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const LangContext = createContext({ lang: 'en', setLang: () => {} })

function stored() {
  try {
    return localStorage.getItem('hisaab-lang')
  } catch {
    return null
  }
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => (stored() === 'ur' ? 'ur' : 'en'))

  const setLang = useCallback(next => {
    const value = next === 'ur' ? 'ur' : 'en'
    setLangState(value)
    try {
      localStorage.setItem('hisaab-lang', value)
    } catch {}
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'
  }, [lang])

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)

/** Pick the current language's strings from a page's `{ en: {...}, ur: {...} }` table. */
export function useStrings(table) {
  const { lang } = useLang()
  return table[lang] || table.en
}

/** Strings shared by the app shell and common components. */
export const COMMON = {
  en: {
    home: 'Today',
    customers: 'Customers',
    activity: 'Messages',
    settings: 'Settings',
    help: 'Help',
    signOut: 'Sign out',
    owes: 'owes',
    settled: 'Settled',
    advance: 'Advance',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    delete: 'Delete',
    back: 'Back',
    retry: 'Try again',
    loading: 'Loading…',
    loadError: 'Could not load. Check your internet and try again.',
    waConnected: 'WhatsApp connected',
    waReconnecting: 'WhatsApp reconnecting…',
    waOff: 'WhatsApp not connected',
    waBanner: 'WhatsApp is not connected, so voice notes you send yourself are not being recorded.',
    waReconnect: 'Reconnect WhatsApp',
    credit: 'Udhaar',
    payment: 'Payment',
    play: 'Play voice note',
    pause: 'Pause',
    skip: 'Skip to content',
    mainNav: 'Main',
    menu: 'Menu',
    closeMenu: 'Close menu',
    account: 'Account',
    waShortOk: 'Connected',
    waShortWait: 'Reconnecting',
    waShortOff: 'Not connected',
    contents: 'Contents',
    sections: 'Sections on this page',
    footnotes: 'Footnotes',
    furtherReading: 'Further reading',
    footnote: n => `Footnote ${n}`,
  },
  ur: {
    home: 'آج',
    customers: 'گاہک',
    activity: 'پیغامات',
    settings: 'سیٹنگز',
    help: 'مدد',
    signOut: 'سائن آؤٹ',
    owes: 'کے ذمے',
    settled: 'حساب صاف',
    advance: 'ایڈوانس',
    cancel: 'منسوخ',
    save: 'محفوظ کریں',
    close: 'بند کریں',
    delete: 'حذف کریں',
    back: 'واپس',
    retry: 'دوبارہ کوشش کریں',
    loading: 'لوڈ ہو رہا ہے…',
    loadError: 'لوڈ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔',
    waConnected: 'واٹس ایپ منسلک ہے',
    waReconnecting: 'واٹس ایپ دوبارہ جڑ رہا ہے…',
    waOff: 'واٹس ایپ منسلک نہیں',
    waBanner: 'واٹس ایپ منسلک نہیں، اس لیے آپ کے وائس نوٹ ریکارڈ نہیں ہو رہے۔',
    waReconnect: 'واٹس ایپ دوبارہ جوڑیں',
    credit: 'ادھار',
    payment: 'وصولی',
    play: 'وائس نوٹ چلائیں',
    pause: 'روکیں',
    skip: 'مواد پر جائیں',
    mainNav: 'مرکزی',
    menu: 'مینو',
    closeMenu: 'مینو بند کریں',
    account: 'اکاؤنٹ',
    waShortOk: 'منسلک',
    waShortWait: 'جڑ رہا ہے',
    waShortOff: 'منسلک نہیں',
    contents: 'فہرست',
    sections: 'اس صفحے کے حصے',
    footnotes: 'حواشی',
    furtherReading: 'مزید مطالعہ',
    footnote: n => `حاشیہ ${n}`,
  },
}

export const useCommon = () => useStrings(COMMON)
