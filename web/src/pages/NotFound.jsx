import { Link, useLocation } from 'react-router-dom'
import LangSwitch from '../components/LangSwitch.jsx'
import { Button, Logo } from '../components/ui.jsx'
import { useStrings } from '../lib/i18n.jsx'
import './Legal.css'

const STRINGS = {
  en: {
    eyebrow: 'Error 404',
    title: ['This page isn’t', 'in the khata.'],
    body: path => (
      <>
        Nothing is written at <code dir="ltr">{path}</code>. The link may be old or mistyped — your khata itself is safe.
      </>
    ),
    home: 'Back to home',
    dashboard: 'Open my khata',
    legal: 'Legal pages',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  ur: {
    eyebrow: 'خرابی 404',
    title: ['یہ صفحہ', 'کھاتے میں نہیں۔'],
    body: path => (
      <>
        <code dir="ltr">{path}</code> پر کچھ درج نہیں۔ لنک پرانا یا غلط ہو سکتا ہے — آپ کا کھاتہ بالکل محفوظ ہے۔
      </>
    ),
    home: 'ہوم پیج پر واپس',
    dashboard: 'میرا کھاتہ کھولیں',
    legal: 'قانونی صفحات',
    privacy: 'رازداری',
    terms: 'شرائط',
  },
}

export default function NotFound() {
  const S = useStrings(STRINGS)
  const { pathname } = useLocation()
  return (
    <div className="nf-page">
      <header className="nf-head">
        <Logo />
        <LangSwitch />
      </header>
      <main id="main" className="nf-main" tabIndex={-1} aria-labelledby="nf-title">
        <p className="eyebrow">{S.eyebrow}</p>
        <h1 className="hero-title" id="nf-title">
          {S.title.map(line => (
            <span key={line}>{line}</span>
          ))}
        </h1>
        <p className="lead">{S.body(pathname)}</p>
        <div className="cluster">
          <Button variant="primary" size="lg" to="/">
            {S.home}
          </Button>
          <Button size="lg" to="/app">
            {S.dashboard}
          </Button>
        </div>
      </main>
      <nav className="nf-foot" aria-label={S.legal}>
        <Link to="/privacy">{S.privacy}</Link>
        <Link to="/terms">{S.terms}</Link>
      </nav>
    </div>
  )
}
