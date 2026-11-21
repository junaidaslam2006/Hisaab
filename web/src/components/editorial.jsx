import { isValidElement, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCommon } from '../lib/i18n.jsx'

// Launch-post building blocks. Styles live in styles/components.css; usage in web/COMPONENTS.md.

const cx = (...parts) => parts.filter(Boolean).join(' ')
const safeId = value => String(value).replace(/[^\w-]+/g, '-')

function ItemLink({ item, className, children }) {
  if (item.to) return <Link className={className} to={item.to}>{children}</Link>
  if (item.href) return <a className={className} href={item.href}>{children}</a>
  if (item.onClick) return <button type="button" className={className} onClick={item.onClick}>{children}</button>
  return <span className={className}>{children}</span>
}

/**
 * Numbered contents with dotted leaders.
 * hero:    "[1] ……………… Label"           (ivory text for the painted sky; labels end-aligned)
 * index:   "[1] ……………… Label"           (same shape in ink on the paper — Help, Privacy, Terms)
 * article: "[1] Label ……………… meta"     (leader only when the item has a meta)
 * items: [{ label, href? | to? | onClick?, meta? }] (meta is ignored by hero and index)
 */
export function Toc({ items = [], variant = 'article', label, title, start = 1, className }) {
  const C = useCommon()
  const labelAtEnd = variant === 'hero' || variant === 'index'
  return (
    <nav className={cx('toc', `toc-${variant}`, className)} aria-label={label || title || C.contents}>
      {title && <p className="toc-title label">{title}</p>}
      <ol>
        {items.map((item, i) => {
          const n = (
            <span className="toc-n num" aria-hidden="true">
              [{start + i}]
            </span>
          )
          const leader = <span className="toc-leader" aria-hidden="true" />
          const text = <span className="toc-label">{item.label}</span>
          const meta = !labelAtEnd && item.meta != null && item.meta !== ''
          return (
            <li key={item.href || item.to || i}>
              <ItemLink item={item} className="toc-link">
                {n}
                {labelAtEnd ? (
                  <>
                    {leader}
                    {text}
                  </>
                ) : (
                  <>
                    {text}
                    {meta && (
                      <>
                        {leader}
                        <span className="toc-meta">{item.meta}</span>
                      </>
                    )}
                  </>
                )}
              </ItemLink>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * Text tabs above a frame. tabs: [{ value, label, count? }]. Arrow keys move and select (mirrored in RTL), Home/End jump.
 * Pass `id` + `controls` to link the tabs to a panel; or wrap the panel in <TabPanel tabsId={id} value={value}>.
 */
export function Tabs({ tabs = [], value, onChange, label, id, controls, className }) {
  const auto = useId()
  const base = id || safeId(auto)
  const refs = useRef([])
  const selectedIndex = Math.max(0, tabs.findIndex(t => t.value === value))

  const onKeyDown = (e, i) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    let next = null
    if (e.key === 'ArrowRight') next = rtl ? i - 1 : i + 1
    else if (e.key === 'ArrowLeft') next = rtl ? i + 1 : i - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next == null) return
    e.preventDefault()
    next = (next + tabs.length) % tabs.length
    refs.current[next]?.focus()
    onChange?.(tabs[next].value)
  }

  return (
    <div className={cx('tabs', className)} role="tablist" aria-label={label}>
      {tabs.map((t, i) => {
        const selected = i === selectedIndex
        return (
          <button
            key={t.value}
            ref={el => (refs.current[i] = el)}
            type="button"
            role="tab"
            id={`${base}-tab-${safeId(t.value)}`}
            className="tab"
            aria-selected={selected}
            aria-controls={controls}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange?.(t.value)}
            onKeyDown={e => onKeyDown(e, i)}
          >
            {t.label}
            {t.count != null && <span className="tab-count">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** The panel a <Tabs id="x"> controls: <TabPanel tabsId="x" value={value}>…</TabPanel> (give Tabs controls="x-panel"). */
export function TabPanel({ tabsId, value, children, className }) {
  return (
    <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${safeId(value)}`} className={className} tabIndex={0}>
      {children}
    </div>
  )
}

/** Round legend markers. items: [{ label, tone: 'owed' | 'paid' | 'warn' | 'sage' | 'ink' | 'sky' | 'neutral' }] */
export function Legend({ items = [], className }) {
  return (
    <ul className={cx('legend', className)}>
      {items.map((it, i) => (
        <li key={it.label ?? i} className="legend-item">
          <span className={cx('legend-dot', it.tone)} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * Square ink frame for charts, tables and lists. Header row: title (start) + meta (end), legend under it.
 * `flush` removes the body padding (for a table or row list) and rules off the header.
 */
export function Frame({ title, titleAs: Title = 'h3', meta, legend, children, foot, flush, tone, className, id, as: Tag = 'div', ...rest }) {
  const head = title || meta
  return (
    <Tag className={cx('frame', flush && 'flush', tone, className)} id={id} {...rest}>
      {head && (
        <div className="frame-head">
          {title && <Title className="frame-title">{title}</Title>}
          {meta && <span className="frame-meta">{meta}</span>}
        </div>
      )}
      {legend?.length > 0 && <Legend items={legend} />}
      <div className="frame-body">{children}</div>
      {foot && <div className="frame-foot">{foot}</div>}
    </Tag>
  )
}

/** Figure with an optional wash behind it and a small centred caption. wash: none | sage | heather | sky | sand */
export function Figure({ wash = 'none', wide, caption, children, className, id }) {
  return (
    <figure className={cx('figure', `wash-${wash}`, wide && 'wide', className)} id={id}>
      <div className="figure-body">{children}</div>
      {caption && <figcaption className="caption">{caption}</figcaption>}
    </figure>
  )
}

/**
 * Labeled cells separated by ink hairlines ("COMPANY | AUTHOR"). cells: [{ label, value }].
 * tone: plain | sage | sunk. `min` = narrowest cell before wrapping (default 160px).
 */
export function LabeledCells({ cells = [], tone, framed = true, min, className }) {
  const style = min ? { '--cell-min': typeof min === 'number' ? `${min}px` : min } : undefined
  return (
    <dl className={cx('cells', tone && `tone-${tone}`, framed && 'framed', className)} style={style}>
      {cells.map((c, i) => (
        <div className="cell" key={c.key ?? i}>
          <dt className="label">{c.label}</dt>
          <dd className="cell-value">{c.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Card with a small label, serif quote text and an optional LabeledCells footer. tone: sage | plain | warn */
export function QuoteCard({ label, children, cells, tone = 'sage', className }) {
  return (
    <figure className={cx('quote-card', `tone-${tone}`, className)}>
      <div className="quote-card-body">
        {label && <span className="label">{label}</span>}
        <blockquote className="quote-text">{children}</blockquote>
      </div>
      {cells?.length > 0 && <LabeledCells cells={cells} framed={false} />}
    </figure>
  )
}

const asNote = it => (it && typeof it === 'object' && !isValidElement(it) && ('text' in it || 'lead' in it) ? it : { text: it })

/** End-of-page footnotes. items: strings/nodes, or { id?, lead?, text } (lead = bold run-in label). */
export function Footnotes({ items = [], title, id = 'footnotes', rule = true, className }) {
  const C = useCommon()
  return (
    <section className={cx('endnotes footnotes', !rule && 'no-rule', className)} id={id} aria-labelledby={`${id}-title`}>
      <h2 className="endnotes-title" id={`${id}-title`}>
        {title || C.footnotes}
      </h2>
      <ol>
        {items.map((raw, i) => {
          const item = asNote(raw)
          const key = item.id || i + 1
          return (
            <li key={key} id={`fn-${key}`}>
              <span className="fn-n num" aria-hidden="true">
                {i + 1}
              </span>
              <p className="fn-text">
                {item.lead && <strong>{item.lead} </strong>}
                {item.text}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Inline reference to a footnote: …two seconds<FootnoteRef n={1} />. Use `id` when the footnote has one. */
export function FootnoteRef({ n, id }) {
  const C = useCommon()
  return (
    <a className="fn-ref num" href={`#fn-${id || n}`} aria-label={C.footnote(n)}>
      [{n}]
    </a>
  )
}

/** Numbered further-reading list. items: [{ text, link: { label, to? | href? } }] */
export function FurtherReading({ items = [], title, id = 'further-reading', rule = true, className }) {
  const C = useCommon()
  return (
    <section className={cx('endnotes further', !rule && 'no-rule', className)} id={id} aria-labelledby={`${id}-title`}>
      <h2 className="endnotes-title" id={`${id}-title`}>
        {title || C.furtherReading}
      </h2>
      <ol>
        {items.map((it, i) => (
          <li key={i}>
            <span className="further-n num" aria-hidden="true">
              {i + 1}.
            </span>
            <div>
              <p className="further-text">{it.text}</p>
              {it.link &&
                (it.link.to ? (
                  <Link className="further-link" to={it.link.to}>
                    {it.link.label}
                  </Link>
                ) : (
                  <a className="further-link" href={it.link.href} {...(/^https?:/.test(it.link.href || '') ? { target: '_blank', rel: 'noopener' } : {})}>
                    {it.link.label}
                  </a>
                ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Section progress ticks fixed at the inline-start edge (shown >= 1200px only).
 * sections: [{ id, label }] — ids of elements on the page. The current section's tick is longer and ink.
 */
export function SectionRail({ sections = [], label }) {
  const C = useCommon()
  const key = sections.map(s => s.id).join('|')
  const [active, setActive] = useState(sections[0]?.id)

  useEffect(() => {
    const ids = key ? key.split('|') : []
    if (!ids.length || typeof IntersectionObserver === 'undefined') return
    const wide = window.matchMedia('(min-width: 1200px)')
    let io = null
    let timer = null
    let tries = 0

    const observe = () => {
      io?.disconnect()
      io = null
      clearTimeout(timer)
      if (!wide.matches) return
      const els = ids.map(id => document.getElementById(id)).filter(Boolean)
      // Sections that render after data loads: look again shortly.
      if (els.length < ids.length && tries++ < 20) timer = setTimeout(observe, 300)
      if (!els.length) return
      io = new IntersectionObserver(
        entries => {
          for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id)
        },
        { rootMargin: '-40% 0px -55% 0px' },
      )
      els.forEach(el => io.observe(el))
    }
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) setActive(ids[ids.length - 1])
      else if (window.scrollY < 8) setActive(ids[0])
    }

    observe()
    wide.addEventListener('change', observe)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io?.disconnect()
      clearTimeout(timer)
      wide.removeEventListener('change', observe)
      window.removeEventListener('scroll', onScroll)
    }
  }, [key])

  if (!sections.length) return null
  return (
    <nav className="section-rail" aria-label={label || C.sections}>
      <ol>
        {sections.map(s => (
          <li key={s.id}>
            <a className="rail-link" href={`#${s.id}`} aria-current={active === s.id ? 'location' : undefined}>
              <span className="rail-line" aria-hidden="true" />
              <span className="rail-tip">{s.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Horizontal rule. heavy = the 2px rule above end matter; ink = 1px ink. */
export function Rule({ heavy, ink, className }) {
  return <hr className={cx('rule', heavy && 'heavy', ink && 'ink', className)} />
}
