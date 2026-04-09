import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ADMIN_CARGOS = ['Administrador de Sistema', 'Subadministrador de Sistemas']

function isAdmin(cargo?: string, is_staff?: boolean) {
  return is_staff === true || (!!cargo && ADMIN_CARGOS.includes(cargo))
}

/**
 * Protege rutas de administración.
 * - Sin sesión       → /login
 * - Sin permisos     → /dashboard/nacional
 * - Con permisos     → renderiza children
 */
export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return null                                  // espera validación inicial
  if (!user)   return <Navigate to="/login" replace />      // no autenticado

  if (!isAdmin(user.cargo, user.is_staff))
    return <Navigate to="/dashboard/nacional" replace />    // sin permisos admin

  return <>{children}</>
}
