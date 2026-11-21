import { useLang } from '../lib/i18n.jsx'

/** EN | اردو pill pair. `onChange` lets the signed-in app also save the choice to the shop profile. */
export default function LangSwitch({ onChange, className }) {
  const { lang, setLang } = useLang()
  const pick = value => {
    setLang(value)
    onChange?.(value)
  }
  return (
    <div className={['lang-switch', className].filter(Boolean).join(' ')} role="group" aria-label="Language / زبان">
      <button type="button" aria-pressed={lang === 'en'} onClick={() => pick('en')} lang="en">EN</button>
      <button type="button" aria-pressed={lang === 'ur'} onClick={() => pick('ur')} lang="ur"><span className="ur">اردو</span></button>
    </div>
  )
}
