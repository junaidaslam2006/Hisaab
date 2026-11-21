import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, Outlet, useLocation } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import LangSwitch from '../components/LangSwitch.jsx'
import { useModal } from '../components/Sheet.jsx'
import { Button, IconButton, Logo } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useCommon, useStrings } from '../lib/i18n.jsx'

const STRINGS = {
  en: {
    how: 'How it works',
    languages: 'Languages',
    dashboard: 'Dashboard',
    pricing: 'Pricing',
    login: 'Log in',
    connect: 'Connect WhatsApp',
    open: 'Open my khata',
    privacy: 'Privacy',
    terms: 'Terms',
    help: 'Help',
    siteNav: 'Site',
    footerNav: 'More from Hisaab',
    brand: 'Hisaab',
    made: 'Made in Peshawar by TensorMind',
  },
  ur: {
    how: 'یہ کیسے کام کرتا ہے',
    languages: 'زبانیں',
    dashboard: 'ڈیش بورڈ',
    pricing: 'قیمت',
    login: 'لاگ ان',
    connect: 'واٹس ایپ جوڑیں',
    open: 'میرا کھاتہ کھولیں',
    privacy: 'رازداری',
    terms: 'شرائط',
    help: 'مدد',
    siteNav: 'ویب سائٹ',
    footerNav: 'حساب کے مزید صفحات',
    brand: 'حساب',
    made: 'پشاور میں TensorMind نے بنایا',
  },
}

/** Landing / privacy / terms: ivory header, full-bleed main (pages set their own widths), dark footer. */
export default function PublicLayout() {
  const S = useStrings(STRINGS)
  const C = useCommon()
  const location = useLocation()
  const [signedIn, setSignedIn] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    api('/api/session').then(s => setSignedIn(Boolean(s?.signedIn))).catch(() => {})
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the menu on navigation; scroll to /#section targets once the (lazy) page has rendered them.
  useEffect(() => {
    setMenuOpen(false)
    const id = decodeURIComponent(location.hash.slice(1))
    if (!id) return
    let tries = 0
    let frame = 0
    const seek = () => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ block: 'start' })
      else if (tries++ < 120) frame = requestAnimationFrame(seek)
    }
    seek()
    return () => cancelAnimationFrame(frame)
  }, [location.key, location.hash])

  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // Signed in: save the choice to the shop too, or /app would switch back to the saved language.
  const saveLang = signedIn ? value => api('/api/me', { method: 'PATCH', body: { ui_lang: value } }).catch(() => {}) : undefined

  const links = [
    { to: '/#how-it-works', label: S.how },
    { to: '/#languages', label: S.languages },
    { to: '/#dashboard', label: S.dashboard },
    { to: '/#pricing', label: S.pricing },
  ]
  const footerLinks = [
    { to: '/#how-it-works', label: S.how },
    { to: '/privacy', label: S.privacy },
    { to: '/terms', label: S.terms },
    signedIn ? { to: '/app', label: S.open } : { to: '/login', label: S.login },
    { to: signedIn ? '/app/help' : '/#faq', label: S.help },
  ]

  return (
    <div className="public">
      <a className="skip-link" href="#main">{C.skip}</a>

      <header className={['pub-header', scrolled && 'is-scrolled'].filter(Boolean).join(' ')}>
        <div className="pub-header-inner">
          <Logo />
          <nav className="pub-nav" aria-label={S.siteNav}>
            {links.map(l => (
              <Link key={l.to} to={l.to} className="nav-pill">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="pub-actions">
            <LangSwitch onChange={saveLang} />
            {signedIn ? (
              <Button variant="primary" size="sm" to="/app">{S.open}</Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" to="/login" className="pub-login">{S.login}</Button>
                <Button variant="primary" size="sm" to="/connect">{S.connect}</Button>
              </>
            )}
            <IconButton icon="menu" label={C.menu} sunk className="pub-menu-btn" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} />
          </div>
        </div>
      </header>

      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} links={links} signedIn={signedIn} saveLang={saveLang} S={S} C={C} />

      <main id="main" className="public-main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <Logo inverse size="lg" className="pub-footer-logo" />
          <nav className="pub-footer-nav" aria-label={S.footerNav}>
            <ul>
              {footerLinks.map(l => (
                <li key={l.to + l.label}>
                  <Link className="pub-footer-row" to={l.to}>
                    <span>{l.label}</span>
                    <Icon name="arrow-right" size="sm" className="flip-rtl" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="pub-footer-legal">
            © <span className="num">{new Date().getFullYear()}</span> {S.brand} · {S.made}
          </p>
        </div>
      </footer>
    </div>
  )
}

/** Phone / tablet menu (< 900px): full-screen paper sheet with the section links and the account actions. */
function MenuDrawer({ open, onClose, links, signedIn, saveLang, S, C }) {
  const ref = useRef(null)
  useModal(ref, open, onClose, { pickInitial: els => els.find(el => el.classList.contains('icon-btn')) || els[0] })
  if (!open) return null
  return createPortal(
    <div ref={ref} className="pub-drawer" role="dialog" aria-modal="true" aria-label={C.menu} tabIndex={-1}>
      <div className="pub-drawer-head">
        <Logo />
        <IconButton icon="x" label={C.closeMenu} sunk onClick={onClose} />
      </div>
      <nav className="pub-drawer-nav" aria-label={S.siteNav}>
        <ul>
          {links.map(l => (
            <li key={l.to}>
              <Link to={l.to} onClick={onClose}>
                <span>{l.label}</span>
                <Icon name="arrow-right" className="flip-rtl" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="pub-drawer-foot">
        <LangSwitch onChange={saveLang} />
        {signedIn ? (
          <Button variant="primary" size="lg" block to="/app">{S.open}</Button>
        ) : (
          <>
            <Button variant="primary" size="lg" block to="/connect">{S.connect}</Button>
            <Button variant="secondary" size="lg" block to="/login">{S.login}</Button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
