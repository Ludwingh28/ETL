import { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  UserPlus, ChevronLeft, Eye, EyeOff,
  Check, AlertCircle, Shield, Info, AtSign, RefreshCw,
} from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import {
  CARGOS, REGIONALES, CARGOS_CON_CANAL, DASHBOARD_GROUPS,
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
  canal:                 '',
  vendedor_nombre_dw:    '',
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

  // Búsqueda de vendedor en DW
  interface DwVendedor { nombre: string; canal: string; regional: string }
  const [dwVendedores,   setDwVendedores]   = useState<DwVendedor[]>([])
  const [dwSearch,       setDwSearch]       = useState('')
  const [dwOpen,         setDwOpen]         = useState(false)
  const dwRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiFetch<{ success: boolean; data: DwVendedor[] }>('/admin/dw-vendedores/')
      .then(j => { if (j.success) setDwVendedores(j.data) })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dwRef.current && !dwRef.current.contains(e.target as Node)) setDwOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selectDwVendedor = (v: DwVendedor) => {
    const parts = v.nombre.trim().split(/\s+/)
    const first = parts[0] ?? ''
    const last  = parts.slice(1).join(' ')
    setForm(f => ({
      ...f,
      first_name:         first,
      last_name:          last,
      username:           usernameTouched ? f.username : buildUsername(first, last),
      canal:              v.canal ?? '',
      regional:           v.regional ?? '',
      vendedor_nombre_dw: v.nombre,
    }))
    setDwSearch(v.nombre)
    setDwOpen(false)
  }

  const clearDwVendedor = () => {
    setDwSearch('')
    setDwOpen(false)
    setForm(f => ({ ...f, vendedor_nombre_dw: '', canal: '', regional: '' }))
  }

  const dwCanales = [...new Set(dwVendedores.map(v => v.canal).filter(Boolean))].sort()

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

  // Cambio de cargo → pre-cargar permisos sugeridos y resetear DW si sale de Vendedor
  const handleCargo = (cargo: Cargo | '') => {
    const perms = cargo && PERMISOS_POR_CARGO[cargo as Cargo]
      ? [...PERMISOS_POR_CARGO[cargo as Cargo]]
      : form.dashboard_permissions
    setForm(f => ({
      ...f,
      cargo,
      dashboard_permissions: perms,
      ...(cargo !== 'Vendedor' ? { vendedor_nombre_dw: '', canal: '', regional: '' } : {}),
    }))
    if (cargo !== 'Vendedor') { setDwSearch(''); setDwOpen(false) }
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
          canal:                 form.canal,
          vendedor_nombre_dw:    form.vendedor_nombre_dw,
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
            <div className={form.cargo === 'Vendedor' ? 'sm:col-span-2' : ''}>
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

            {/* Vendedor: buscador DW (fuente única de canal + regional) */}
            {form.cargo === 'Vendedor' && (
              <div className="sm:col-span-2" ref={dwRef}>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Vendedor del sistema <span className="text-red-500">*</span>
                </label>

                {form.vendedor_nombre_dw ? (
                  // ── Ya vinculado ─────────────────────────────────────────
                  <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <Check size={16} className="text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="font-semibold text-slate-800">{form.vendedor_nombre_dw}</span>
                      <span className="text-slate-400 mx-2">·</span>
                      <span className="text-slate-600">{form.canal}</span>
                      <span className="text-slate-400 mx-2">·</span>
                      <span className="text-slate-600">{form.regional}</span>
                    </div>
                    <button
                      type="button"
                      onClick={clearDwVendedor}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  // ── Buscador ─────────────────────────────────────────────
                  <div className="relative">
                    <input
                      type="text"
                      value={dwSearch}
                      onChange={e => { setDwSearch(e.target.value); setDwOpen(true) }}
                      onFocus={() => setDwOpen(true)}
                      placeholder={dwVendedores.length === 0 ? 'Cargando vendedores…' : 'Buscar nombre del vendedor…'}
                      disabled={dwVendedores.length === 0}
                      className="input-field"
                      autoComplete="off"
                    />
                    {dwOpen && dwVendedores.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
                        {dwVendedores
                          .filter(v => v.nombre.toLowerCase().includes(dwSearch.toLowerCase()))
                          .slice(0, 80)
                          .map(v => (
                            <button
                              key={v.nombre}
                              type="button"
                              onClick={() => selectDwVendedor(v)}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50 border-b border-slate-50 last:border-0"
                            >
                              <span className="font-medium text-slate-800">{v.nombre}</span>
                              <span className="ml-2 text-xs text-slate-400">{v.canal} · {v.regional}</span>
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>
                )}

                {!form.vendedor_nombre_dw && (
                  <p className="text-xs text-amber-600 mt-1">
                    Sin vincular — el dashboard no mostrará datos hasta asociar un vendedor.
                  </p>
                )}
              </div>
            )}

            {/* No-Vendedor: regional + canal con opciones del DW */}
            {form.cargo !== '' && form.cargo !== 'Vendedor' && (
              <>
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

                {CARGOS_CON_CANAL.has(form.cargo) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">
                      Canal asignado
                    </label>
                    <select
                      value={form.canal}
                      onChange={e => set('canal', e.target.value)}
                      className="input-field"
                    >
                      <option value="">Todos los canales</option>
                      {dwCanales.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                      Deja en blanco para acceso a todos los canales.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {form.cargo && (
            <p className="mt-3 text-xs text-brand-600 flex items-center gap-1.5">
              <Info size={12} className="shrink-0" />
              Los permisos de acceso se pre-configuraron según el cargo. Puedes ajustarlos abajo.
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
