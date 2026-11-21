import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import LangSwitch from '../components/LangSwitch.jsx'
import { Avatar, Button, LoadError, Logo, Spinner } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { MeContext } from '../lib/me.jsx'
import { RealtimeProvider, useRealtime } from '../lib/realtime.jsx'
import { useCommon, useLang } from '../lib/i18n.jsx'

/** Loads the signed-in shop, guards the app routes, and draws the header / bottom tab bar. */
export default function AppLayout() {
  const navigate = useNavigate()
  const { setLang } = useLang()
  const [me, setMe] = useState(null)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    try {
      const data = await api('/api/me')
      setMe(data)
      setFailed(false)
      return data
    } catch (err) {
      if (err.status === 401) navigate('/login', { replace: true })
      else setFailed(true)
      return null
    }
  }, [navigate])

  // First load: apply the shop's language and send unfinished sign-ups to onboarding.
  const boot = useCallback(
    () =>
      reload().then(data => {
        if (!data) return
        setLang(data.uiLang)
        if (!data.onboarded) navigate('/welcome', { replace: true })
      }),
    [reload, setLang, navigate],
  )

  useEffect(() => {
    boot()
    const onSignedOut = () => navigate('/login', { replace: true })
    window.addEventListener('hisaab:signedout', onSignedOut)
    return () => window.removeEventListener('hisaab:signedout', onSignedOut)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Offline, or the server is restarting: keep trying quietly, and at once when the connection comes back.
  useEffect(() => {
    if (me || !failed) return
    const timer = setInterval(boot, 10000)
    window.addEventListener('online', boot)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', boot)
    }
  }, [me, failed, boot])

  const value = useMemo(() => ({ me, reload, setMe }), [me, reload])

  if (!me) {
    return (
      <div className="app-loading">
        {failed ? (
          <LoadError
            onRetry={() => {
              setFailed(false)
              boot()
            }}
          />
        ) : (
          <Spinner size="lg" />
        )}
      </div>
    )
  }
  return (
    <MeContext.Provider value={value}>
      <RealtimeProvider enabled>
        <Shell me={me} reload={reload} setMe={setMe} />
      </RealtimeProvider>
    </MeContext.Provider>
  )
}

function Shell({ me, reload, setMe }) {
  const C = useCommon()
  const navigate = useNavigate()
  const location = useLocation()
  useRealtime(['tenant'], () => reload())

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  const saveLang = async value => {
    try {
      setMe(await api('/api/me', { method: 'PATCH', body: { ui_lang: value } }))
    } catch {}
  }

  const signOut = async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    navigate('/', { replace: true })
  }

  const wa = me.whatsapp?.status
  const waTone = wa === 'connected' ? 'ok' : wa === 'reconnecting' ? 'wait' : 'bad'
  const waLabel = wa === 'connected' ? C.waConnected : wa === 'reconnecting' ? C.waReconnecting : C.waOff
  const waWord = wa === 'connected' ? C.waShortOk : wa === 'reconnecting' ? C.waShortWait : C.waShortOff
  const shop = me.shopName || me.phoneLocal

  const nav = [
    { to: '/app', end: true, icon: 'home', label: C.home },
    { to: '/app/customers', icon: 'users', label: C.customers },
    { to: '/app/activity', icon: 'message', label: C.activity },
    { to: '/app/settings', icon: 'settings', label: C.settings },
    { to: '/app/help', icon: 'help', label: C.help },
  ]

  return (
    <div className="app">
      <a className="skip-link" href="#main">{C.skip}</a>

      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <Logo to="/app" compact />
            <span className="app-brand-rule" aria-hidden="true" />
            {/* dir=auto: a Latin name in the Urdu UI (or an Urdu name in English) truncates at its own end. */}
            <span className="app-shop" title={shop} dir="auto">{shop}</span>
          </div>

          <nav className="app-nav" aria-label={C.mainNav}>
            {nav.map(n => (
              <NavLink key={n.to} to={n.to} end={n.end} className="nav-pill">
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="app-tools">
            <Link to="/app/settings" className={`status-pill ${waTone}`} aria-label={waLabel} title={waLabel}>
              <span className="status-dot" aria-hidden="true" />
              <span className="status-word" aria-hidden="true">{waWord}</span>
            </Link>
            <LangSwitch onChange={saveLang} />
            <AccountMenu me={me} shop={shop} onSignOut={signOut} />
          </div>
        </div>
      </header>

      <main id="main" className="app-main" tabIndex={-1}>
        <div className="app-main-inner">
          {(wa === 'logged_out' || wa === 'disconnected') && (
            <div className="banner warn" role="alert">
              <Icon name="alert" />
              <span className="banner-text">{C.waBanner}</span>
              <Button variant="primary" size="sm" to="/connect?reconnect=1" icon="qr">{C.waReconnect}</Button>
            </div>
          )}
          <Outlet />
        </div>
      </main>

      <nav className="tabbar" aria-label={C.mainNav}>
        {nav.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** Desktop account disclosure: shop, owner, phone, Settings, Help, Sign out. */
function AccountMenu({ me, shop, onSignOut }) {
  const C = useCommon()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const button = useRef(null)
  const popId = useId()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (!wrap.current?.contains(e.target)) setOpen(false)
    }
    const onKey = e => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onBlur = e => {
    if (open && !wrap.current?.contains(e.relatedTarget)) setOpen(false)
  }

  return (
    <div className="account" ref={wrap} onBlur={onBlur}>
      <button ref={button} type="button" className="account-btn" aria-expanded={open} aria-controls={popId} aria-label={C.account} title={C.account} onClick={() => setOpen(o => !o)}>
        <Avatar name={me.ownerName || shop} size="sm" />
        <Icon name="chevron-down" size="sm" />
      </button>
      {open && (
        <div className="account-pop" id={popId}>
          <div className="account-pop-head">
            <p className="account-pop-name">{shop}</p>
            {me.ownerName && <p className="meta">{me.ownerName}</p>}
            <p className="meta">
              <span className="num" dir="ltr">{me.phoneLocal}</span>
            </p>
          </div>
          <Link to="/app/settings">
            <Icon name="settings" /> {C.settings}
          </Link>
          <Link to="/app/help">
            <Icon name="help" /> {C.help}
          </Link>
          <button type="button" className="account-pop-out" onClick={onSignOut}>
            <Icon name="logout" className="flip-rtl" /> {C.signOut}
          </button>
        </div>
      )}
    </div>
  )
}
