import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import LangSwitch from '../components/LangSwitch.jsx'
import { Logo } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useCommon, useStrings } from '../lib/i18n.jsx'

const STRINGS = {
  en: { privacy: 'Privacy', terms: 'Terms', legal: 'Legal' },
  ur: { privacy: 'رازداری', terms: 'شرائط', legal: 'قانونی' },
}

// Signed in (reconnect, welcome)? Save the choice to the shop too, or /app would switch back to the saved language.
const saveLang = value =>
  api('/api/session')
    .then(s => s?.signedIn && api('/api/me', { method: 'PATCH', body: { ui_lang: value } }))
    .catch(() => {})

/** Connect / login / welcome: a quiet ivory header and one centred column (max 560px) so the page's one task gets all the attention. */
export default function AuthLayout() {
  const S = useStrings(STRINGS)
  const C = useCommon()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="auth">
      <a className="skip-link" href="#main">{C.skip}</a>
      <header className="auth-header">
        <Logo />
        <LangSwitch onChange={saveLang} />
      </header>
      <main id="main" className="auth-main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="auth-footer">
        <nav aria-label={S.legal}>
          <Link to="/privacy">{S.privacy}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms">{S.terms}</Link>
        </nav>
      </footer>
    </div>
  )
}
