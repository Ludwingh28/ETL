import { useState } from 'react'
import { KeyRound, Eye, EyeOff, Check, AlertCircle, ShieldCheck } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'

// ── Indicador de fortaleza de contraseña ─────────────────────────────────────

function strengthInfo(pwd: string): { level: 0 | 1 | 2 | 3; label: string; color: string } {
  if (!pwd)           return { level: 0, label: '',         color: 'bg-slate-200' }
  if (pwd.length < 6) return { level: 1, label: 'Débil',   color: 'bg-red-400'   }
  const hasUpper  = /[A-Z]/.test(pwd)
  const hasNumber = /[0-9]/.test(pwd)
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd)
  const score = [pwd.length >= 8, hasUpper, hasNumber, hasSymbol].filter(Boolean).length
  if (score <= 1) return { level: 1, label: 'Débil',    color: 'bg-red-400'    }
  if (score <= 2) return { level: 2, label: 'Moderada', color: 'bg-yellow-400' }
  return              { level: 3, label: 'Fuerte',   color: 'bg-green-500'  }
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function AdminCambiarContrasena() {
  const { apiFetch, user } = useAuth()

  const [form, setForm] = useState({
    current_password: '',
    new_password:     '',
    confirm:          '',
  })
  const [show, setShow]       = useState({ cur: false, new_: false, conf: false })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const strength = strengthInfo(form.new_password)

  const toggle = (k: 'cur' | 'new_' | 'conf') =>
    setShow(s => ({ ...s, [k]: !s[k] }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (form.new_password.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (form.new_password !== form.confirm) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }
    if (form.current_password === form.new_password) {
      setError('La nueva contraseña debe ser distinta a la actual.')
      return
    }

    setLoading(true)
    try {
      await apiFetch('/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify({
          current_password: form.current_password,
          new_password:     form.new_password,
        }),
      })
      setSuccess(true)
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La contraseña actual es incorrecta o hubo un error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardLayout>

      {/* Cabecera */}
      <div className="flex items-center gap-2 mb-6">
        <KeyRound size={20} className="text-brand-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-800">Cambiar Contraseña</h1>
          <p className="text-xs text-slate-400 mt-0.5">Administración</p>
        </div>
      </div>

      <div className="max-w-md mx-auto">

        {/* Mensaje de éxito */}
        {success && (
          <div className="flex items-center gap-3 px-4 py-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 mb-5">
            <ShieldCheck size={18} className="shrink-0 text-green-600" />
            <div>
              <p className="font-semibold">Contraseña actualizada</p>
              <p className="text-xs text-green-600 mt-0.5">Tu contraseña fue cambiada exitosamente.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card space-y-5">

          {/* Info de usuario */}
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">
                {(user?.full_name || user?.username || '?')[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{user?.full_name || user?.username}</p>
              <p className="text-xs text-slate-400">{user?.email || 'Sin email'}</p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Contraseña actual */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Contraseña Actual <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={show.cur ? 'text' : 'password'}
                value={form.current_password}
                onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))}
                required
                placeholder="Tu contraseña actual"
                className="input-field pr-10"
              />
              <button type="button" onClick={() => toggle('cur')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show.cur ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Nueva contraseña */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Nueva Contraseña <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={show.new_ ? 'text' : 'password'}
                value={form.new_password}
                onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
                required
                placeholder="Mínimo 6 caracteres"
                className="input-field pr-10"
              />
              <button type="button" onClick={() => toggle('new_')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show.new_ ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* Indicador de fortaleza */}
            {form.new_password && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3].map(lvl => (
                    <div
                      key={lvl}
                      className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                        strength.level >= lvl ? strength.color : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Seguridad: <span className="font-medium text-slate-700">{strength.label}</span>
                  {strength.level < 3 && (
                    <span className="text-slate-400">
                      {' · '}Usa mayúsculas, números y símbolos para mejorarla.
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Confirmar nueva */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Confirmar Nueva Contraseña <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={show.conf ? 'text' : 'password'}
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                required
                placeholder="Repetir nueva contraseña"
                className={`input-field pr-10 ${
                  form.confirm && form.confirm !== form.new_password
                    ? 'border-red-300 focus:ring-red-400'
                    : ''
                }`}
              />
              <button type="button" onClick={() => toggle('conf')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show.conf ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {form.confirm && form.confirm !== form.new_password && (
              <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden.</p>
            )}
            {form.confirm && form.confirm === form.new_password && form.new_password.length >= 6 && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <Check size={11} /> Las contraseñas coinciden.
              </p>
            )}
          </div>

          {/* Submit */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Actualizando…
                </>
              ) : (
                <>
                  <KeyRound size={15} />
                  Cambiar Contraseña
                </>
              )}
            </button>
          </div>
        </form>

        {/* Recomendaciones */}
        <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
          <p className="text-xs font-semibold text-blue-700 mb-1.5">Recomendaciones</p>
          <ul className="space-y-1 text-xs text-blue-600">
            <li>• Usa al menos 8 caracteres.</li>
            <li>• Combina letras mayúsculas, minúsculas y números.</li>
            <li>• Incluye símbolos (!@#$%) para mayor seguridad.</li>
            <li>• No uses contraseñas fáciles como tu nombre o fecha de nacimiento.</li>
          </ul>
        </div>

      </div>
    </DashboardLayout>
  )
}
