import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

const BASENAME = import.meta.env.MODE === 'production' ? '/sistemabi' : '/';
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardRoute from "./components/DashboardRoute";
import Login from "./pages/Login";
import DashboardNacional from "./pages/DashboardNacional";
import DashboardRegionales from "./pages/DashboardRegionales";
import DashboardCanalesRegional from "./pages/DashboardCanalesRegional";
import DashboardSupervisores from "./pages/DashboardSupervisores";
import DashboardMatriz from "./pages/DashboardMatriz";
import DashboardEnConstruccion from "./pages/DashboardEnConstruccion";
import DashboardUnidadesVendidas from "./pages/DashboardUnidadesVendidas";
import DashboardUnidadesSupervisores from "./pages/DashboardUnidadesSupervisores";
import DashboardInformacionRutas from "./pages/DashboardInformacionRutas";
import AdminCrearUsuario from "./pages/AdminCrearUsuario";
import AdminGestionUsuarios from "./pages/AdminGestionUsuarios";
import AdminCambiarContrasena from "./pages/AdminCambiarContrasena";
import AdminRoute from "./components/AdminRoute";
import DashboardProveedor from "./pages/DashboardProveedor";
import DescargaArchivos from "./pages/DescargaArchivos";
import DownloadToast from "./components/DownloadToast";

function Protected({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function Dash({ perm, children }: { perm: string; children: React.ReactNode }) {
  return <DashboardRoute perm={perm}>{children}</DashboardRoute>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={BASENAME}>
        <Routes>
          <Route path="/login"      element={<Login />} />
          {/* ── Seguimiento General ─────────────────────────────────────────── */}
          <Route path="/dashboard/nacional"
            element={<Dash perm="nacional"><DashboardNacional /></Dash>}
          />
          <Route path="/dashboard/regionales"
            element={<Dash perm="regionales"><DashboardRegionales /></Dash>}
          />
          <Route path="/dashboard/canales"
            element={<Dash perm="canales"><DashboardCanalesRegional /></Dash>}
          />
          <Route path="/dashboard/supervisores"
            element={<Dash perm="supervisores"><DashboardSupervisores /></Dash>}
          />

          {/* ── Seguimiento Día (DUAL+POD) ──────────────────────────────────── */}
          <Route path="/dashboard/preventas-realizadas"
            element={<Dash perm="preventas-realizadas"><DashboardEnConstruccion titulo="Preventas Realizadas" grupo="Seguimiento Día (DUAL+POD)" /></Dash>}
          />
          <Route path="/dashboard/avances-ventas"
            element={<Dash perm="avances-ventas"><DashboardEnConstruccion titulo="Avances de Ventas" grupo="Seguimiento Día (DUAL+POD)" /></Dash>}
          />

          {/* ── Evolución Mes ───────────────────────────────────────────────── */}
          <Route path="/dashboard/unidades-vendidas"
            element={<Dash perm="unidades-vendidas"><DashboardUnidadesVendidas /></Dash>}
          />
          <Route path="/dashboard/unidades-supervisores"
            element={<Dash perm="unidades-supervisores"><DashboardUnidadesSupervisores /></Dash>}
          />
          <Route path="/dashboard/informacion-rutas"
            element={<Dash perm="informacion-rutas"><DashboardInformacionRutas /></Dash>}
          />
          <Route path="/dashboard/ticket-promedio"
            element={<Dash perm="ticket-promedio"><DashboardEnConstruccion titulo="Ticket Promedio" grupo="Evolución Mes" /></Dash>}
          />

          {/* ── Varios ──────────────────────────────────────────────────────── */}
          <Route path="/dashboard/lista-precios"
            element={<Dash perm="lista-precios"><DashboardEnConstruccion titulo="Lista de Precios" grupo="Varios" /></Dash>}
          />
          <Route path="/dashboard/inventario-almacen"
            element={<Dash perm="inventario-almacen"><DashboardEnConstruccion titulo="Inventario por Almacén" grupo="Varios" /></Dash>}
          />
          <Route path="/dashboard/fechas-vencimiento"
            element={<Dash perm="fechas-vencimiento"><DashboardEnConstruccion titulo="Fechas de Vencimiento" grupo="Varios" /></Dash>}
          />

          {/* ── Finanzas ────────────────────────────────────────────────────── */}
          <Route path="/dashboard/margen-bruto"
            element={<Dash perm="margen-bruto"><DashboardEnConstruccion titulo="Margen Bruto" grupo="Finanzas" /></Dash>}
          />

          {/* ── Tabla Dinámica ──────────────────────────────────────────────── */}
          <Route path="/dashboard/matriz"
            element={<Dash perm="matriz"><DashboardMatriz /></Dash>}
          />

          {/* ── Documentos ──────────────────────────────────────────────────── */}
          <Route path="/documentos/descargas"
            element={<Dash perm="descargas"><DescargaArchivos /></Dash>}
          />

          {/* ── Proveedores ─────────────────────────────────────────────────── */}
          <Route path="/dashboard/pepsico"
            element={<Dash perm="pepsico"><DashboardProveedor perm="pepsico" nombre="Pepsico" /></Dash>}
          />
          <Route path="/dashboard/softys"
            element={<Dash perm="softys"><DashboardProveedor perm="softys" nombre="Softys" /></Dash>}
          />
          <Route path="/dashboard/dmujer"
            element={<Dash perm="dmujer"><DashboardProveedor perm="dmujer" nombre="DMujer" /></Dash>}
          />
          <Route path="/dashboard/apego"
            element={<Dash perm="apego"><DashboardProveedor perm="apego" nombre="Apego" /></Dash>}
          />
          <Route path="/dashboard/colher"
            element={<Dash perm="colher"><DashboardProveedor perm="colher" nombre="COLHER" /></Dash>}
          />

          {/* ── Administración (solo Administradores) ───────────────────────── */}
          <Route path="/admin/gestion-usuarios"
            element={<Protected><AdminRoute><AdminGestionUsuarios /></AdminRoute></Protected>}
          />
          <Route path="/admin/crear-usuario"
            element={<Protected><AdminRoute><AdminCrearUsuario /></AdminRoute></Protected>}
          />
          <Route path="/admin/cambiar-contrasena"
            element={<Protected><AdminCambiarContrasena /></Protected>}
          />

          {/* Redirects por defecto */}
          <Route path="/dashboard" element={<Navigate to="/dashboard/nacional" replace />} />
          <Route path="/"          element={<Navigate to="/dashboard/nacional" replace />} />
          <Route path="*"          element={<Navigate to="/dashboard/nacional" replace />} />
        </Routes>
        <DownloadToast />
      </BrowserRouter>
    </AuthProvider>
  );
}
