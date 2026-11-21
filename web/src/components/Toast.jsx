import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import Icon from './Icon.jsx'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const show = useCallback((message, { tone = 'info', ms = 4000 } = {}) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t.slice(-2), { id, message, tone }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'error' ? Math.max(ms, 6000) : ms)
  }, [])

  const api = useMemo(() => ({
    show,
    success: m => show(m, { tone: 'success' }),
    error: m => show(m, { tone: 'error' }),
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span className="toast-icon" aria-hidden="true">
              <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'} />
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** const toast = useToast(); toast.success('Saved'); toast.error('Could not save') */
export const useToast = () => useContext(ToastContext)
