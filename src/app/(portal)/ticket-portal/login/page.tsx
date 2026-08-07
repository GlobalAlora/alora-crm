'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react'

function AloraLogo() {
  return (
    <img
      src="/logo-nav-white.png"
      alt="Alora"
      style={{ height: 36, display: 'block', objectFit: 'contain' }}
    />
  )
}

const inputCls = `
  w-full px-4 py-2.5 rounded-xl text-sm transition-all outline-none
  border border-[#e2e8f0] bg-[#f8fafc] text-[#0f172a] placeholder:text-[#94a3b8]
  focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white
`.replace(/\s+/g, ' ').trim()

export default function PortalLoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'login' | 'register'>('login')

  // Login state
  const [loginEmail, setLoginEmail]       = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPwd, setShowLoginPwd]   = useState(false)
  const [loginError, setLoginError]       = useState('')
  const [loginLoading, setLoginLoading]   = useState(false)

  // Register state
  const [regNombre, setRegNombre]     = useState('')
  const [regEmpresa, setRegEmpresa]   = useState('')
  const [regEmail, setRegEmail]       = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [showRegPwd, setShowRegPwd]   = useState(false)
  const [regError, setRegError]       = useState('')
  const [regLoading, setRegLoading]   = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const res  = await fetch('/api/portal/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLoginError(data.error ?? 'Error al iniciar sesión')
        return
      }
      router.replace('/dashboard')
    } catch {
      setLoginError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError('')
    setRegLoading(true)
    try {
      const res  = await fetch('/api/portal/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: regEmail, password: regPassword, nombre: regNombre, empresa: regEmpresa }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRegError(data.error ?? 'Error al crear cuenta')
        return
      }
      router.replace('/dashboard')
    } catch {
      setRegError('Error de conexión. Intentá de nuevo.')
    } finally {
      setRegLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <AloraLogo />
          <span style={{ color: '#64748b', fontSize: 13 }}>Centro de Soporte</span>
        </div>
      </header>

      <main style={{ maxWidth: 480, margin: '0 auto', padding: '48px 24px 60px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
            Portal de Clientes
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            Ingresá para ver tus tickets y el estado de tu servicio
          </p>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e2e8f0' }}>
            {(['login', 'register'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '16px 24px',
                  border: 'none',
                  background: tab === t ? '#fff' : '#f8fafc',
                  color: tab === t ? '#0f172a' : '#64748b',
                  fontSize: 14,
                  fontWeight: tab === t ? 700 : 400,
                  cursor: 'pointer',
                  borderBottom: tab === t ? '2px solid #0f172a' : '2px solid transparent',
                  transition: 'all .15s',
                }}
              >
                {t === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </button>
            ))}
          </div>

          {/* Login form */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} style={{ padding: 28 }}>
              {loginError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
                  <AlertTriangle size={14} color="#ef4444" />
                  <span style={{ fontSize: 13, color: '#dc2626' }}>{loginError}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Email
                  </label>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      required
                      type={showLoginPwd ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className={inputCls}
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPwd(v => !v)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
                    >
                      {showLoginPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loginLoading}
                  style={{
                    width: '100%', padding: '13px 24px', borderRadius: 12, border: 'none',
                    background: loginLoading ? '#94a3b8' : '#0f172a',
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    cursor: loginLoading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    marginTop: 4,
                  }}
                >
                  {loginLoading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Ingresando...</> : 'Ingresar'}
                </button>
              </div>
            </form>
          )}

          {/* Register form */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} style={{ padding: 28 }}>
              {regError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
                  <AlertTriangle size={14} color="#ef4444" />
                  <span style={{ fontSize: 13, color: '#dc2626' }}>{regError}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Nombre <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      required
                      value={regNombre}
                      onChange={e => setRegNombre(e.target.value)}
                      placeholder="Juan García"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Empresa
                    </label>
                    <input
                      value={regEmpresa}
                      onChange={e => setRegEmpresa(e.target.value)}
                      placeholder="Mi Empresa S.A."
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Email <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Contraseña <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      required
                      type={showRegPwd ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className={inputCls}
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPwd(v => !v)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
                    >
                      {showRegPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {regPassword.length > 0 && regPassword.length < 8 && (
                    <p style={{ fontSize: 11, color: '#f97316', marginTop: 4 }}>Mínimo 8 caracteres</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={regLoading || regPassword.length < 8}
                  style={{
                    width: '100%', padding: '13px 24px', borderRadius: 12, border: 'none',
                    background: (regLoading || regPassword.length < 8) ? '#94a3b8' : '#0f172a',
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    cursor: (regLoading || regPassword.length < 8) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    marginTop: 4,
                  }}
                >
                  {regLoading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Creando cuenta...</> : 'Crear cuenta'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 28 }}>
          <a href="https://globalalora.com" style={{ color: '#94a3b8', textDecoration: 'none' }}>
            Alora Digital · globalalora.com
          </a>
        </p>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        * { box-sizing: border-box }
      `}</style>
    </div>
  )
}
