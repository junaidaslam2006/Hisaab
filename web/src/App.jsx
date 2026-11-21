import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LangProvider } from './lib/i18n.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { Spinner } from './components/ui.jsx'
import AppLayout from './layouts/AppLayout.jsx'
import PublicLayout from './layouts/PublicLayout.jsx'
import AuthLayout from './layouts/AuthLayout.jsx'

const Landing = lazy(() => import('./pages/Landing.jsx'))
const Privacy = lazy(() => import('./pages/Privacy.jsx'))
const Terms = lazy(() => import('./pages/Terms.jsx'))
const Connect = lazy(() => import('./pages/Connect.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const Welcome = lazy(() => import('./pages/Welcome.jsx'))
const Home = lazy(() => import('./pages/Home.jsx'))
const Customers = lazy(() => import('./pages/Customers.jsx'))
const CustomerDetail = lazy(() => import('./pages/CustomerDetail.jsx'))
const Activity = lazy(() => import('./pages/Activity.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Help = lazy(() => import('./pages/Help.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

const fallback = (
  <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
    <Spinner size="lg" />
  </div>
)

export default function App() {
  return (
    <LangProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={fallback}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<Landing />} />
                <Route path="privacy" element={<Privacy />} />
                <Route path="terms" element={<Terms />} />
              </Route>
              <Route element={<AuthLayout />}>
                <Route path="connect" element={<Connect />} />
                <Route path="login" element={<Login />} />
                <Route path="welcome" element={<Welcome />} />
              </Route>
              <Route path="app" element={<AppLayout />}>
                <Route index element={<Home />} />
                <Route path="customers" element={<Customers />} />
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="activity" element={<Activity />} />
                <Route path="settings" element={<Settings />} />
                <Route path="help" element={<Help />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </LangProvider>
  )
}
