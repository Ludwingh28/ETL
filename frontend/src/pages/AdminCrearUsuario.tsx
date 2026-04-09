import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  UserPlus, ChevronLeft, Eye, EyeOff,
  Check, AlertCircle, Shield, Info, AtSign, RefreshCw,
} from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import {
  CARGOS, REGIONALES, DASHBOARD_GROUPS,
  ALL_DASHBOARD_IDS, PERMISOS_POR_CARGO,
  type Cargo,
} from '../constants/adminConstants'

// ── Estado inicial del formulario ────────────────────────────────────────────

// Normaliza texto para username: minúsculas, sin tildes, sin espacios
function toSlug(s: string) {
  return s.trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
}

function buildUsername(first: string, last: string) {
  const a = toSlug(first)
  const b = toSlug(last)
  if (a && b) return `${a}.${b}`
  return a || b
}

const INITIAL = {
  first_name:            '',
  last_name:             '',
  username:              '',
  email:                 '',
  cargo:                 '' as Cargo | '',
  regional:              '',
  password:              '',
  confirm_password:      '',
  dashboard_permissions: [] as string[],
}

// ── Componente de checkbox con indeterminate ─────────────────────────────────

function GroupCheckbox({
  checked, indeterminate, onChange,
}: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  // sync indeterminate (no es atributo HTML estándar)
  if (ref.current) ref.current.indeterminate = indeterminate
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
    />
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function AdminCrearUsuario() {
  const { apiFetch } = useAuth()
  const navigate     = useNavigate()

  const [form,           setForm]           = useState(INITIAL)
  const [usernameTouched, setUsernameTouched] = useState(false) // true si el usuario lo editó manualmente
  const [showPass,       setShowPass]       = useState(false)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [success,        setSuccess]        = useState(false)

  // Setter genérico
  const set = <K extends keyof typeof INITIAL>(k: K, v: (typeof INITIAL)[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // Al cambiar nombre o apellido, auto-rellena username SOLO si no fue tocado manualmente
  const handleNameChange = (field: 'first_name' | 'last_name', value: string) => {
    setForm(f => {
      const next = { ...f, [field]: value }
      if (!usernameTouched) {
        next.username = buildUsername(
          field === 'first_name' ? value : f.first_name,
          field === 'last_name'  ? value : f.last_name,
        )
      }
      return next
    })
  }

  // Regenerar username desde nombre+apellido actuales
  const regenerateUsername = () => {
    setUsernameTouched(false)
    setForm(f => ({ ...f, username: buildUsername(f.first_name, f.last_name) }))
  }

  // Cambio de cargo → pre-cargar permisos sugeridos
  const handleCargo = (cargo: Cargo | '') => {
    set('cargo', cargo)
    if (cargo && PERMISOS_POR_CARGO[cargo]) {
      set('dashboard_permissions', [...PERMISOS_POR_CARGO[cargo]])
    }
  }

  // Toggle individual
  const togglePerm = (id: string) =>
    setForm(f => ({
      ...f,
      dashboard_permissions: f.dashboard_permissions.includes(id)
        ? f.dashboard_permissions.filter(p => p !== id)
        : [...f.dashboard_permissions, id],
    }))

  // Toggle grupo completo
  const toggleGroup = (ids: string[]) => {
    const allOn = ids.every(id => form.dashboard_permissions.includes(id))
    setForm(f => ({
      ...f,
      dashboard_permissions: allOn
        ? f.dashboard_permissions.filter(p => !ids.includes(p))
        : [...new Set([...f.dashboard_permissions, ...ids])],
    }))
  }

  // Envío
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.username.trim()) {
      setError('El nombre de usuario es requerido.')
      return
    }
    if (form.password !== form.confirm_password) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setLoading(true)
    try {
      await apiFetch('/admin/users/create/', {
        method: 'POST',
        body: JSON.stringify({
          username:              form.username.trim(),
          first_name:            form.first_name.trim(),
          last_name:             form.last_name.trim(),
          email:                 form.email.trim(),
          cargo:                 form.cargo,
          regional:              form.regional,
          password:              form.password,
          dashboard_permissions: form.dashboard_permissions,
        }),
      })
      setSuccess(true)
      setTimeout(() => navigate('/admin/gestion-usuarios'), 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el usuario. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  // ── Pantalla de éxito ────────────────────────────────────────────────────
  if (success) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">¡Usuario creado exitosamente!</h2>
          <div className="text-center text-sm text-slate-600 space-y-1">
            <p>
              <strong>{form.first_name} {form.last_name}</strong> ya puede iniciar sesión con:
            </p>
            <p className="font-mono bg-slate-100 px-4 py-2 rounded-lg text-slate-800 inline-block">
              Usuario: <strong>{form.username.trim()}</strong>
            </p>
          </div>
          <p className="text-xs text-slate-400">Redirigiendo a gestión de usuarios…</p>
        </div>
      </DashboardLayout>
    )
  }

  // ── Formulario ───────────────────────────────────────────────────────────
  return (
    <DashboardLayout>

      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/gestion-usuarios" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <ChevronLeft size={18} />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <UserPlus size={20} className="text-brand-600" />
            <h1 className="text-xl font-bold text-slate-800">Creación de Usuario</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Administración</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-5 pb-10">

        {/* Error global */}
        {error && (
          <div className="flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle size={15} className="shrink-0" />
            {error}
          </div>
        )}

        {/* ─── Datos personales ─────────────────────────────────────────── */}
        <section className="card">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            Datos Personales
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.first_name}
                onChange={e => handleNameChange('first_name', e.target.value)}
                required
                placeholder="Ej. Juan"
                className="input-field"
              />
            </div>

            {/* Apellido */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Apellido <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.last_name}
                onChange={e => handleNameChange('last_name', e.target.value)}
                required
                placeholder="Ej. Pérez"
                className="input-field"
              />
            </div>

            {/* Usuario (username) */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Nombre de Usuario <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <AtSign size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={form.username}
                  onChange={e => {
                    setUsernameTouched(true)
                    set('username', e.target.value.toLowerCase().replace(/\s+/g, ''))
                  }}
                  required
                  placeholder="Ej. juan.perez"
                  className="input-field pl-8 pr-10 font-mono"
                />
                {usernameTouched && (
                  <button
                    type="button"
                    onClick={regenerateUsername}
                    title="Regenerar desde nombre y apellido"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-600 transition-colors"
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Info size={11} />
                Con este usuario iniciará sesión en el sistema.
                {!usernameTouched && form.username && ' (generado automáticamente)'}
              </p>
            </div>

            {/* Correo */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Correo Electrónico <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                required
                placeholder="usuario@cruzimex.com"
                className="input-field"
              />
            </div>
          </div>
        </section>

        {/* ─── Rol y organización ───────────────────────────────────────── */}
        <section className="card">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            Rol y Organización
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Cargo */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Cargo <span className="text-red-500">*</span>
              </label>
              <select
                value={form.cargo}
                onChange={e => handleCargo(e.target.value as Cargo | '')}
                required
                className="input-field"
              >
                <option value="">Seleccionar cargo…</option>
                {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Regional */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Regional <span className="text-red-500">*</span>
              </label>
              <select
                value={form.regional}
                onChange={e => set('regional', e.target.value)}
                required
                className="input-field"
              >
                <option value="">Seleccionar regional…</option>
                {REGIONALES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {form.cargo && (
            <p className="mt-3 text-xs text-brand-600 flex items-center gap-1.5">
              <Info size={12} className="shrink-0" />
              Los permisos de acceso se pre-configuraron según el cargo. Puedes ajustarlos en la sección de abajo.
            </p>
          )}
        </section>

        {/* ─── Contraseña ───────────────────────────────────────────────── */}
        <section className="card">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            Contraseña
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Contraseña <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  required
                  placeholder="Mínimo 6 caracteres"
                  className="input-field pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Confirmar Contraseña <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirm_password}
                  onChange={e => set('confirm_password', e.target.value)}
                  required
                  placeholder="Repetir contraseña"
                  className={`input-field pr-10 ${
                    form.confirm_password && form.confirm_password !== form.password
                      ? 'border-red-300 focus:ring-red-400'
                      : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {form.confirm_password && form.confirm_password !== form.password && (
                <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
              )}
            </div>
          </div>
        </section>

        {/* ─── Acceso a dashboards ──────────────────────────────────────── */}
        <section className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield size={15} className="text-brand-600" />
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Acceso a Dashboards
              </h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('dashboard_permissions', [...ALL_DASHBOARD_IDS])}
                className="text-xs px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors font-medium"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => set('dashboard_permissions', [])}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium"
              >
                Ninguno
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {DASHBOARD_GROUPS.map(group => {
              const ids      = group.items.map(i => i.id)
              const allOn    = ids.every(id => form.dashboard_permissions.includes(id))
              const someOn   = ids.some(id => form.dashboard_permissions.includes(id))
              return (
                <div key={group.grupo}>
                  <label className="flex items-center gap-2.5 cursor-pointer mb-2">
                    <GroupCheckbox
                      checked={allOn}
                      indeterminate={someOn && !allOn}
                      onChange={() => toggleGroup(ids)}
                    />
                    <span className="text-sm font-semibold text-slate-700">{group.grupo}</span>
                    <span className="text-xs text-slate-400">
                      ({ids.filter(id => form.dashboard_permissions.includes(id)).length}/{ids.length})
                    </span>
                  </label>
                  <div className="ml-7 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {group.items.map(item => (
                      <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.dashboard_permissions.includes(item.id)}
                          onChange={() => togglePerm(item.id)}
                          className="w-3.5 h-3.5 rounded accent-brand-600 cursor-pointer"
                        />
                        <span className="text-sm text-slate-600">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ─── Acciones ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creando…
              </>
            ) : (
              <>
                <UserPlus size={15} />
                Crear Usuario
              </>
            )}
          </button>
          <Link to="/admin/gestion-usuarios" className="btn-ghost">
            Cancelar
          </Link>
        </div>

      </form>
    </DashboardLayout>
  )
}
