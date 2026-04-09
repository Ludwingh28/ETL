import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users2, UserPlus, Search, Pencil, X, Check,
  AlertCircle, Shield, KeyRound, Eye, EyeOff,
  ChevronDown, UserCheck, UserX, RotateCcw, AtSign,
} from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import type { ManagedUser } from '../types'
import {
  CARGOS, REGIONALES, DASHBOARD_GROUPS,
  ALL_DASHBOARD_IDS, PERMISOS_POR_CARGO,
  CARGO_COLOR, type Cargo,
} from '../constants/adminConstants'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(u: ManagedUser) {
  const a = u.first_name?.[0] ?? ''
  const b = u.last_name?.[0]  ?? ''
  return (a + b).toUpperCase() || u.username?.[0]?.toUpperCase() || '?'
}

const AVATAR_COLORS = [
  'bg-brand-600', 'bg-purple-600', 'bg-rose-600',
  'bg-indigo-600', 'bg-cyan-600', 'bg-emerald-600',
]
function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length] }

// ── Checkbox con indeterminate ────────────────────────────────────────────────

function GroupCheckbox({ checked, indeterminate, onChange }: {
  checked: boolean; indeterminate: boolean; onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  if (ref.current) ref.current.indeterminate = indeterminate
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 rounded accent-brand-600 cursor-pointer" />
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface Toast { msg: string; type: 'ok' | 'err' }

// ── Modal de edición ──────────────────────────────────────────────────────────

type Tab = 'datos' | 'accesos' | 'contrasena'

interface EditModalProps {
  user:     ManagedUser
  onClose:  () => void
  onSaved:  (u: ManagedUser) => void
  onToast:  (t: Toast) => void
}

function EditModal({ user, onClose, onSaved, onToast }: EditModalProps) {
  const { apiFetch } = useAuth()
  const [tab, setTab] = useState<Tab>('datos')

  // ── Tab: Datos ───────────────────────────────────────────────────────────
  const [datos, setDatos] = useState({
    username:   user.username,
    first_name: user.first_name,
    last_name:  user.last_name,
    email:      user.email,
    cargo:      user.cargo as Cargo | '',
    regional:   user.regional,
    is_active:  user.is_active,
  })
  const [savingDatos, setSavingDatos] = useState(false)

  const handleSaveDatos = async () => {
    setSavingDatos(true)
    try {
      const updated = await apiFetch<ManagedUser>(`/admin/users/${user.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          username:   datos.username.trim(),
          first_name: datos.first_name,
          last_name:  datos.last_name,
          email:      datos.email,
          cargo:      datos.cargo,
          regional:   datos.regional,
          is_active:  datos.is_active,
        }),
      })
      onSaved(updated)
      onToast({ msg: 'Datos actualizados correctamente.', type: 'ok' })
    } catch {
      onToast({ msg: 'Error al guardar los datos.', type: 'err' })
    } finally {
      setSavingDatos(false)
    }
  }

  // ── Tab: Accesos ─────────────────────────────────────────────────────────
  const [perms, setPerms] = useState<string[]>(user.dashboard_permissions)
  const [savingPerms, setSavingPerms] = useState(false)

  const togglePerm = (id: string) =>
    setPerms(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const toggleGroup = (ids: string[]) => {
    const allOn = ids.every(id => perms.includes(id))
    setPerms(p => allOn ? p.filter(x => !ids.includes(x)) : [...new Set([...p, ...ids])])
  }

  const applyCargoSuggestion = () => {
    if (datos.cargo && PERMISOS_POR_CARGO[datos.cargo as Cargo]) {
      setPerms([...PERMISOS_POR_CARGO[datos.cargo as Cargo]])
    }
  }

  const handleSavePerms = async () => {
    setSavingPerms(true)
    try {
      const updated = await apiFetch<ManagedUser>(`/admin/users/${user.id}/permissions/`, {
        method: 'PATCH',
        body: JSON.stringify({ dashboard_permissions: perms }),
      })
      onSaved(updated)
      onToast({ msg: 'Permisos actualizados correctamente.', type: 'ok' })
    } catch {
      onToast({ msg: 'Error al guardar los permisos.', type: 'err' })
    } finally {
      setSavingPerms(false)
    }
  }

  // ── Tab: Contraseña ──────────────────────────────────────────────────────
  const [pwd, setPwd] = useState({ new_password: '', confirm: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)

  const handleSavePwd = async () => {
    setPwdError(null)
    if (pwd.new_password.length < 6) { setPwdError('Mínimo 6 caracteres.'); return }
    if (pwd.new_password !== pwd.confirm) { setPwdError('Las contraseñas no coinciden.'); return }
    setSavingPwd(true)
    try {
      await apiFetch(`/admin/users/${user.id}/set-password/`, {
        method: 'POST',
        body: JSON.stringify({ new_password: pwd.new_password }),
      })
      setPwd({ new_password: '', confirm: '' })
      onToast({ msg: 'Contraseña actualizada correctamente.', type: 'ok' })
    } catch {
      onToast({ msg: 'Error al cambiar la contraseña.', type: 'err' })
    } finally {
      setSavingPwd(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className={`w-9 h-9 rounded-full ${avatarColor(user.id)} flex items-center justify-center shrink-0`}>
            <span className="text-white text-sm font-bold">{initials(user)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 truncate">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs text-slate-400 truncate">{user.username}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6">
          {([
            { id: 'datos',      label: 'Datos',      icon: UserCheck },
            { id: 'accesos',    label: 'Accesos',    icon: Shield    },
            { id: 'contrasena', label: 'Contraseña', icon: KeyRound  },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── TAB: Datos ─────────────────────────────────────────────── */}
          {tab === 'datos' && (
            <div className="space-y-4">

              {/* Usuario (username) */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Nombre de Usuario
                </label>
                <div className="relative">
                  <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={datos.username}
                    onChange={e => setDatos(d => ({
                      ...d,
                      username: e.target.value.toLowerCase().replace(/\s+/g, ''),
                    }))}
                    className="input-field pl-8 font-mono"
                    placeholder="nombre.apellido"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Nombre</label>
                  <input
                    type="text"
                    value={datos.first_name}
                    onChange={e => setDatos(d => ({ ...d, first_name: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Apellido</label>
                  <input
                    type="text"
                    value={datos.last_name}
                    onChange={e => setDatos(d => ({ ...d, last_name: e.target.value }))}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Correo Electrónico</label>
                <input
                  type="email"
                  value={datos.email}
                  onChange={e => setDatos(d => ({ ...d, email: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Cargo</label>
                  <select
                    value={datos.cargo}
                    onChange={e => setDatos(d => ({ ...d, cargo: e.target.value as Cargo | '' }))}
                    className="input-field"
                  >
                    <option value="">Sin cargo</option>
                    {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Regional</label>
                  <select
                    value={datos.regional}
                    onChange={e => setDatos(d => ({ ...d, regional: e.target.value }))}
                    className="input-field"
                  >
                    <option value="">Sin regional</option>
                    {REGIONALES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              {/* Estado activo */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="text-sm font-medium text-slate-700">Estado de la cuenta</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {datos.is_active ? 'El usuario puede iniciar sesión.' : 'El usuario no puede iniciar sesión.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDatos(d => ({ ...d, is_active: !d.is_active }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    datos.is_active
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
                >
                  {datos.is_active ? <><UserCheck size={13} /> Activo</> : <><UserX size={13} /> Inactivo</>}
                </button>
              </div>
            </div>
          )}

          {/* ── TAB: Accesos ───────────────────────────────────────────── */}
          {tab === 'accesos' && (
            <div className="space-y-4">
              {/* Barra rápida */}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setPerms([...ALL_DASHBOARD_IDS])}
                  className="text-xs px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors font-medium">
                  Todos
                </button>
                <button type="button" onClick={() => setPerms([])}
                  className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium">
                  Ninguno
                </button>
                {datos.cargo && PERMISOS_POR_CARGO[datos.cargo as Cargo] && (
                  <button type="button" onClick={applyCargoSuggestion}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-medium">
                    <RotateCcw size={11} />
                    Según cargo
                  </button>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  {perms.length}/{ALL_DASHBOARD_IDS.length} activos
                </span>
              </div>

              {/* Árbol */}
              <div className="space-y-3">
                {DASHBOARD_GROUPS.map(group => {
                  const ids   = group.items.map(i => i.id)
                  const allOn = ids.every(id => perms.includes(id))
                  const someOn = ids.some(id => perms.includes(id))
                  return (
                    <div key={group.grupo} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <label className="flex items-center gap-2.5 cursor-pointer mb-2">
                        <GroupCheckbox
                          checked={allOn}
                          indeterminate={someOn && !allOn}
                          onChange={() => toggleGroup(ids)}
                        />
                        <span className="text-sm font-semibold text-slate-700">{group.grupo}</span>
                      </label>
                      <div className="ml-7 grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {group.items.map(item => (
                          <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={perms.includes(item.id)}
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
            </div>
          )}

          {/* ── TAB: Contraseña ────────────────────────────────────────── */}
          {tab === 'contrasena' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Establece una nueva contraseña para <strong>{user.first_name} {user.last_name}</strong>.
              </p>
              {pwdError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={14} className="shrink-0" />
                  {pwdError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Nueva Contraseña</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={pwd.new_password}
                    onChange={e => setPwd(p => ({ ...p, new_password: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                    className="input-field pr-10"
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Confirmar Contraseña</label>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={pwd.confirm}
                  onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
                  placeholder="Repetir contraseña"
                  className={`input-field ${pwd.confirm && pwd.confirm !== pwd.new_password ? 'border-red-300 focus:ring-red-400' : ''}`}
                />
              </div>
            </div>
          )}

        </div>

        {/* Footer con botón de guardar según tab */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn-ghost text-sm">Cerrar</button>

          {tab === 'datos' && (
            <button onClick={handleSaveDatos} disabled={savingDatos} className="btn-primary text-sm flex items-center gap-2">
              {savingDatos ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Guardando…</> : <><Check size={14} /> Guardar Datos</>}
            </button>
          )}
          {tab === 'accesos' && (
            <button onClick={handleSavePerms} disabled={savingPerms} className="btn-primary text-sm flex items-center gap-2">
              {savingPerms ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Guardando…</> : <><Shield size={14} /> Guardar Permisos</>}
            </button>
          )}
          {tab === 'contrasena' && (
            <button onClick={handleSavePwd} disabled={savingPwd} className="btn-primary text-sm flex items-center gap-2">
              {savingPwd ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Guardando…</> : <><KeyRound size={14} /> Cambiar Contraseña</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AdminGestionUsuarios() {
  const { apiFetch } = useAuth()

  const [users,    setUsers]    = useState<ManagedUser[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [query,    setQuery]    = useState('')
  const [cargo,    setCargo]    = useState('')
  const [regional, setRegional] = useState('')
  const [editing,  setEditing]  = useState<ManagedUser | null>(null)
  const [toast,    setToast]    = useState<Toast | null>(null)

  // Cargar usuarios
  useEffect(() => {
    apiFetch<ManagedUser[]>('/admin/users/')
      .then(data => setUsers(data))
      .catch(() => setError('No se pudo cargar la lista de usuarios.'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // Filtros
  const filtered = users.filter(u => {
    const name = `${u.first_name} ${u.last_name} ${u.username} ${u.email}`.toLowerCase()
    return (
      (!query    || name.includes(query.toLowerCase())) &&
      (!cargo    || u.cargo    === cargo) &&
      (!regional || u.regional === regional)
    )
  })

  const handleSaved = (updated: ManagedUser) => {
    setUsers(us => us.map(u => u.id === updated.id ? updated : u))
    setEditing(updated)
  }

  return (
    <DashboardLayout>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'ok'
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'ok' ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Modal de edición */}
      {editing && (
        <EditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onToast={setToast}
        />
      )}

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Users2 size={20} className="text-brand-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Gestión de Usuarios</h1>
            <p className="text-xs text-slate-400 mt-0.5">Administración</p>
          </div>
        </div>
        <Link to="/admin/crear-usuario" className="btn-primary flex items-center gap-2 self-start">
          <UserPlus size={15} />
          Nuevo Usuario
        </Link>
      </div>

      {/* Filtros */}
      <div className="card mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Buscador */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, usuario o correo…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="input-field pl-9"
            />
          </div>
          {/* Filtro cargo */}
          <div className="relative">
            <select
              value={cargo}
              onChange={e => setCargo(e.target.value)}
              className="input-field pr-8 appearance-none min-w-44"
            >
              <option value="">Todos los cargos</option>
              {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          {/* Filtro regional */}
          <div className="relative">
            <select
              value={regional}
              onChange={e => setRegional(e.target.value)}
              className="input-field pr-8 appearance-none min-w-36"
            >
              <option value="">Todas las regionales</option>
              {REGIONALES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Estados: cargando / error */}
      {loading && (
        <div className="card flex items-center justify-center py-16 gap-3 text-slate-400">
          <span className="w-6 h-6 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin" />
          Cargando usuarios…
        </div>
      )}
      {!loading && error && (
        <div className="card flex items-center gap-3 py-10 justify-center text-red-500 text-sm">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Tabla */}
      {!loading && !error && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Cargo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Regional</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden xl:table-cell">Correo</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Accesos</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                      No se encontraron usuarios.
                    </td>
                  </tr>
                )}
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Avatar + nombre */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full ${avatarColor(u.id)} flex items-center justify-center shrink-0`}>
                          <span className="text-white text-xs font-bold">{initials(u)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">
                            {u.first_name} {u.last_name}
                          </p>
                          <p className="text-xs text-slate-400 truncate">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    {/* Cargo */}
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      {u.cargo ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${CARGO_COLOR[u.cargo] ?? 'bg-slate-100 text-slate-600'}`}>
                          {u.cargo}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {/* Regional */}
                    <td className="px-4 py-3.5 text-slate-600 hidden lg:table-cell">
                      {u.regional || <span className="text-slate-300">—</span>}
                    </td>
                    {/* Correo */}
                    <td className="px-4 py-3.5 text-slate-500 hidden xl:table-cell truncate max-w-48">
                      {u.email || <span className="text-slate-300">—</span>}
                    </td>
                    {/* Accesos */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                        {u.dashboard_permissions.length}/{ALL_DASHBOARD_IDS.length}
                      </span>
                    </td>
                    {/* Estado */}
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        u.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-slate-400'}`} />
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {/* Editar */}
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => setEditing(u)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        title="Editar usuario"
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer: conteo */}
          {filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
              Mostrando {filtered.length} de {users.length} usuarios
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}
