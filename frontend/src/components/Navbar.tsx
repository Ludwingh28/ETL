import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  TrendingUp, Users, LogOut, Menu, X,
  BarChart2, User as UserIcon, ChevronDown, Layers, Table2,
  ClipboardList, Activity, Package, MapPin,
  Tag, List, Archive, CalendarX, DollarSign,
  Users2, KeyRound, UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface NavItem {
  to:    string
  icon:  LucideIcon
  label: string
  perm:  string   // dashboard permission ID
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const ADMIN_CARGOS_NAV = ['Administrador de Sistema', 'Subadministrador de Sistemas']

function filterGroups(groups: NavGroup[], perms: string[], isAdmin: boolean): NavGroup[] {
  if (isAdmin) return groups
  return groups
    .map(g => ({ ...g, items: g.items.filter(i => perms.includes(i.perm)) }))
    .filter(g => g.items.length > 0)
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Seguimiento General',
    items: [
      { to: '/dashboard/nacional',     icon: TrendingUp, label: 'Dashboard Nacional',           perm: 'nacional'      },
      { to: '/dashboard/regionales',   icon: Users,      label: 'Dashboard Regionales',         perm: 'regionales'    },
      { to: '/dashboard/canales',      icon: Layers,     label: 'Dashboard Canales / Regional', perm: 'canales'       },
      { to: '/dashboard/supervisores', icon: UserCheck,  label: 'Dashboard Supervisores',       perm: 'supervisores'  },
    ],
  },
  {
    label: 'Seguimiento Día (DUAL+POD)',
    items: [
      { to: '/dashboard/preventas-realizadas', icon: ClipboardList, label: 'Preventas Realizadas', perm: 'preventas-realizadas' },
      { to: '/dashboard/avances-ventas',       icon: Activity,      label: 'Avances de Ventas',    perm: 'avances-ventas'       },
    ],
  },
  {
    label: 'Evolución Mes',
    items: [
      { to: '/dashboard/unidades-vendidas',     icon: Package,   label: 'Unidades Vendidas',              perm: 'unidades-vendidas'     },
      { to: '/dashboard/unidades-supervisores', icon: UserCheck, label: 'Unidades Vendidas Supervisores', perm: 'unidades-supervisores' },
      { to: '/dashboard/informacion-rutas',     icon: MapPin,    label: 'Información Rutas',              perm: 'informacion-rutas'     },
      { to: '/dashboard/ticket-promedio',       icon: Tag,       label: 'Ticket Promedio',                perm: 'ticket-promedio'       },
    ],
  },
  {
    label: 'Varios',
    items: [
      { to: '/dashboard/lista-precios',      icon: List,      label: 'Lista de Precios',       perm: 'lista-precios'      },
      { to: '/dashboard/inventario-almacen', icon: Archive,   label: 'Inventario por Almacén', perm: 'inventario-almacen' },
      { to: '/dashboard/fechas-vencimiento', icon: CalendarX, label: 'Fechas de Vencimiento',  perm: 'fechas-vencimiento' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { to: '/dashboard/margen-bruto', icon: DollarSign, label: 'Margen Bruto', perm: 'margen-bruto' },
    ],
  },
  {
    label: 'Tabla Dinámica',
    items: [
      { to: '/dashboard/matriz', icon: Table2, label: 'Dashboard Matriz', perm: 'matriz' },
    ],
  },
]

// ── Dropdown group (desktop) ─────────────────────────────────────────────────
function DropdownGroup({ group }: { group: NavGroup }) {
  return (
    <div className="relative group">
      {/* Trigger */}
      <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors duration-150">
        {group.label}
        <ChevronDown size={14} className="transition-transform duration-200 group-hover:rotate-180" />
      </button>

      {/* Bridge invisible para no perder hover al pasar al dropdown */}
      <div className="absolute top-full left-0 w-full h-2" />

      {/* Dropdown panel */}
      <div className="
        absolute top-[calc(100%+0.5rem)] left-0 z-50 min-w-45
        bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5
        opacity-0 invisible translate-y-1
        group-hover:opacity-100 group-hover:visible group-hover:translate-y-0
        transition-all duration-200 ease-out
      ">
        {group.items.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `
                flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors
                ${isActive
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }
              `}
            >
              <Icon size={15} className="shrink-0" />
              {item.label}
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}

const ADMIN_CARGOS = ['Administrador de Sistema', 'Subadministrador de Sistemas']

type MenuItem = { to: string; icon: LucideIcon; label: string }

function buildUserMenuItems(isStaff?: boolean, cargo?: string): MenuItem[] {
  const isAdmin = isStaff === true || ADMIN_CARGOS.includes(cargo ?? '')
  return [
    ...(isAdmin ? [{ to: '/admin/gestion-usuarios', icon: Users2, label: 'Gestión de Usuarios' }] : []),
    { to: '/admin/cambiar-contrasena', icon: KeyRound, label: 'Cambiar Contraseña' },
  ]
}

// ── User menu (desktop) ──────────────────────────────────────────────────────
function UserMenu({ onLogout, userMenuItems }: { onLogout: () => void; userMenuItems: MenuItem[] }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center">
          <UserIcon size={13} className="text-white" />
        </div>
        <span className="text-sm font-medium text-slate-200 max-w-30 truncate hidden sm:block">
          {user?.full_name || user?.username}
        </span>
        <ChevronDown size={13} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-52 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5">

          {/* Info del usuario */}
          <div className="px-4 py-2.5 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">{user?.full_name || user?.username}</p>
            <p className="text-xs text-slate-500 mt-0.5">{user?.email || 'Sin email'}</p>
            {(user?.groups?.length ?? 0) > 0 && (
              <p className="text-xs text-brand-600 mt-0.5">{user?.groups.join(', ')}</p>
            )}
          </div>

          {/* Opciones de administración */}
          <div className="py-1 border-b border-slate-100">
            {userMenuItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 w-full px-4 py-2.5 text-sm transition-colors
                  ${isActive
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Icon size={14} className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </div>

          {/* Cerrar sesión */}
          <button
            onClick={onLogout}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

// ── Navbar principal ─────────────────────────────────────────────────────────
export default function Navbar() {
  const { logout, user } = useAuth()
  const navigate         = useNavigate()

  const [mobileOpen, setMobileOpen] = useState(false)

  const userPerms = user?.dashboard_permissions ?? []
  const userIsAdmin = user?.is_staff === true || ADMIN_CARGOS_NAV.includes(user?.cargo ?? '')
  const visibleGroups = filterGroups(NAV_GROUPS, userPerms, userIsAdmin)
  const userMenuItems = buildUserMenuItems(user?.is_staff, user?.cargo)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 h-16 bg-slate-900 border-b border-white/10 shadow-lg">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between px-4 sm:px-6">

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <BarChart2 size={22} className="text-brand-400" />
            <span className="font-bold text-lg text-white tracking-tight">Cruzimex</span>
          </div>

          {/* Nav grupos – desktop (filtrados por permisos) */}
          <nav className="hidden md:flex items-center gap-1">
            {visibleGroups.map(g => <DropdownGroup key={g.label} group={g} />)}
          </nav>

          {/* Derecha: user + hamburguesa mobile */}
          <div className="flex items-center gap-2">
            <div className="hidden md:block">
              <UserMenu onLogout={handleLogout} userMenuItems={userMenuItems} />
            </div>
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="md:hidden p-2 rounded-lg text-slate-300 hover:bg-white/10 transition-colors"
              aria-label="Menú"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Menú mobile ──────────────────────────────────────────────────── */}
      <div className={`
        md:hidden fixed top-16 inset-x-0 z-30 bg-slate-900 border-b border-white/10
        transition-all duration-300 ease-in-out overflow-hidden
        ${mobileOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'}
      `}>
        <div className="px-4 py-3 space-y-1">
          {visibleGroups.map(group => (
            <div key={group.label}>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold px-3 py-1.5">
                {group.label}
              </p>
              {group.items.map(item => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => `
                      flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${isActive
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }
                    `}
                  >
                    <Icon size={16} />
                    {item.label}
                  </NavLink>
                )
              })}
            </div>
          ))}

          {/* Separador + opciones usuario mobile */}
          <div className="border-t border-white/10 pt-3 mt-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold px-3 py-1.5">
              Mi Cuenta
            </p>
            {userMenuItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-white/10 transition-colors mt-1"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
