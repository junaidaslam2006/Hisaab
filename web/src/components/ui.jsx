import { Link } from 'react-router-dom'
import Icon, { DIRECTIONAL_ICONS } from './Icon.jsx'
import { Toc } from './editorial.jsx'
import { money, initials } from '../lib/format.js'
import { useCommon, useLang } from '../lib/i18n.jsx'

// Shared UI. Styles: styles/components.css. Usage: web/COMPONENTS.md.

const cx = (...parts) => parts.filter(Boolean).join(' ')
const iconClass = name => (DIRECTIONAL_ICONS.test(name) ? 'flip-rtl' : undefined)

/** Pill button. variant: primary | secondary | ghost | danger | inverse; size: sm | md | lg. `to` = router link, `href` = plain link. */
export function Button({ variant = 'secondary', size, block, icon, iconEnd, loading, disabled, to, href, children, className = '', ...rest }) {
  const cls = cx('btn', variant, size, block && 'block', className)
  const inner = (
    <>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} className={iconClass(icon)} /> : null}
      {children != null && <span>{children}</span>}
      {iconEnd && !loading ? <Icon name={iconEnd} className={iconClass(iconEnd)} /> : null}
    </>
  )
  if (to) return <Link to={to} className={cls} aria-disabled={disabled || undefined} {...rest}>{inner}</Link>
  if (href) return <a href={href} className={cls} aria-disabled={disabled || undefined} {...rest}>{inner}</a>
  return (
    <button type="button" className={cls} {...rest} disabled={Boolean(loading || disabled)} aria-busy={loading || undefined}>
      {inner}
    </button>
  )
}

/** Round icon-only button; `label` is required (aria-label + tooltip). */
export function IconButton({ icon, label, bordered, sunk, size, className = '', ...rest }) {
  return (
    <button type="button" className={cx('icon-btn', bordered && 'bordered', sunk && 'sunk', size, className)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} className={iconClass(icon)} />
    </button>
  )
}

/**
 * Money with meaning: tone 'auto' = rust if > 0 (owed to shop), olive if 0, ink if advance.
 * size: sm | lg | xl | display (serif headline number). sign: 'credit' (+) | 'payment' (−).
 */
export function Money({ value, tone = 'neutral', size, sign, className = '' }) {
  const t = tone === 'auto' ? (value > 0 ? 'owed' : value < 0 ? 'neutral' : 'paid') : tone
  const prefix = sign === 'credit' ? '+' : sign === 'payment' ? '−' : ''
  return <span className={cx('money', t, size, className)}>{prefix}{money(value)}</span>
}

/** Pill label. tone: owed | paid | warn | sage | ink | neutral (default). */
export function Badge({ tone, dot, children, className }) {
  return (
    <span className={cx('badge', tone, className)}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}

export function Avatar({ name, size }) {
  return <span className={cx('avatar', size)} aria-hidden="true">{initials(name)}</span>
}

export function Spinner({ size }) {
  const C = useCommon()
  return <span className={cx('spinner', size)} role="status" aria-label={C.loading} />
}

export function Skeleton({ width = '100%', height = 16, style }) {
  return <span className="skeleton" style={{ display: 'block', width, height, ...style }} aria-hidden="true" />
}

/**
 * Every page opens like a launch post: eyebrow (date / context), serif title, serif lead, actions, optional contents.
 * `subtitle` is an alias of `lead`. `toc` = Toc items array (rendered as the article Toc) or any node.
 */
export function PageHeader({ eyebrow, title, lead, subtitle, actions, toc, className, titleId }) {
  const text = lead ?? subtitle
  return (
    <header className={cx('page-header', className)}>
      <div className="page-header-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 id={titleId}>{title}</h1>
        {text && <p className="lead">{text}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
      {toc && (Array.isArray(toc) ? <Toc items={toc} variant="article" /> : <div className="page-header-toc">{toc}</div>)}
    </header>
  )
}

export function EmptyState({ icon = 'info', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

/** Pill group of options (filters, kinds). `block` stretches it to the full width. */
export function Segmented({ options, value, onChange, label, block, className }) {
  return (
    <div className={cx('segmented', block && 'block', className)} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div className="field">
      {label && <label className="field-label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <div className="field-error" role="alert">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  )
}

/**
 * Hisaab wordmark: serif "Hisaab" · thin rule · Nastaliq "حساب". The UI language's word leads.
 * compact = lead word only; inverse = ivory (dark footer, painted sky); size 'lg' for big placements.
 */
export function Logo({ to = '/', compact, inverse, size, className }) {
  const { lang } = useLang()
  const latin = <span key="latin" className="logo-latin">Hisaab</span>
  const urdu = <span key="urdu" className="logo-urdu" lang="ur">حساب</span>
  const [first, second] = lang === 'ur' ? [urdu, latin] : [latin, urdu]
  return (
    <Link to={to} className={cx('logo', compact && 'compact', inverse && 'inverse', size, className)} aria-label="Hisaab">
      {first}
      <span className="logo-rule" aria-hidden="true" />
      {second}
    </Link>
  )
}

export function LoadError({ onRetry }) {
  const C = useCommon()
  return (
    <div className="banner warn" role="alert">
      <Icon name="alert" />
      <span className="banner-text">{C.loadError}</span>
      {onRetry && <Button size="sm" icon="refresh" onClick={() => onRetry()}>{C.retry}</Button>}
    </div>
  )
}
