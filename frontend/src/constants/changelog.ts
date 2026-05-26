export const CURRENT_VERSION = "1.2.3";

export interface ChangelogVersion {
  version: string;
  date: string;
  fixes: string[];
  features: string[];
  /** perm IDs de dashboards nuevos en esta versión */
  newDashboardPerms: string[];
  /** Nombre legible para cada perm nuevo */
  newDashboardNames: Record<string, string>;
}

export const CHANGELOG: ChangelogVersion[] = [
  {
    version: "1.2.3",
    date: "Mayo 2026",
    fixes: [
      "Preventas: filtro de fecha corregido para columnas timestamp — ahora un solo día muestra datos correctamente",
      "Gerente Regional: filtros de regional ahora se bloquean correctamente al perfil del usuario en todos los dashboards (Regionales, Canales/Regional, Supervisores, Unidades Supervisores, Información Rutas, Tendencia Estacional, Preventas)",
      "Dashboard Canales/Regional: rol Gerente Regional incorrectamente tratado como administrador — corregido para bloquear regional y permitir libre selección de canal",
      "Dashboard Regionales: agregado control de acceso por rol — Gerente Regional solo puede ver su regional asignada",
      "Supervisores: lista de nombres ahora muestra formato Nombre Apellido en lugar de NOMBRE APELLIDO (INITCAP en backend)",
      "Rutas: tabla siempre ordenada de mayor a menor cobertura sin importar los filtros activos",
    ],
    features: [
      "Tendencia Estacional: nuevo filtro de supervisor con restricciones por rol (igual que los demás dashboards)",
      "Dashboard Supervisores: Gerente Regional puede ver y filtrar por canal y supervisor dentro de su regional",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.2",
    date: "Mayo 2026",
    fixes: [
      "Preventas: filtro de fecha corregido para columnas timestamp — ahora un solo día muestra datos correctamente",
    ],
    features: [
      "Preventas: columnas H. Inicio, Últ. Movimiento y T. Trabajado ahora muestran la primera y última transacción del día por vendedor y el tiempo total trabajado",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.1",
    date: "Mayo 2026",
    fixes: [
      "Dashboard Supervisores: tabla de liquidaciones muestra el monto completo en Bs sin abreviar (antes mostraba formato xxK)",
    ],
    features: [],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.0",
    date: "Mayo 2026",
    fixes: [
      "Dashboard Supervisores: tabla resumen y gráfico ahora incluyen la categoría «Sin Clasificar»",
      "Períodos sin datos ya no muestran ceros: si el mes/año seleccionado no existe en el DW se salta automáticamente al período más reciente disponible",
    ],
    features: [
      "Nuevo dashboard «Preventas Realizadas»: seguimiento de pedidos con selector de rango de fechas libre (día, semana, mes o período personalizado)",
      "Gráfico de Preventas con drill-down automático: sin filtros muestra por canal, al seleccionar canal muestra por supervisor, al seleccionar supervisor muestra por vendedor",
      "Tabla de vendedores con colores por monto (verde ≥ Bs 1.500, amarillo ≥ Bs 1.000, naranja ≥ Bs 500, rojo < Bs 500) y ordenamiento por monto o efectividad",
      "Vendedores con múltiples rutas en el mismo período se consolidan en una sola fila con rutas concatenadas y suma de clientes de todas sus rutas",
      "Porcentaje de efectividad calculado sobre el total de clientes activos de la ruta (fuente: dim_cliente_dual)",
      "Dashboard Supervisores: toggle Bs / Uds en toda la sección de detalle por vendedor",
      "Dashboard Supervisores: nueva sección «Liquidaciones» con ventas diarias por vendedor en formato de grilla de fechas",
      "Dashboard Información Rutas: rediseño completo con filtros por marca, día de visita, supervisor y búsqueda de ruta",
      "Dashboard Información Rutas: panel de detalle con ventas por semana, desglose por categoría y top SKUs con cobertura de clientes",
      "Dashboard Información Rutas: botón de descarga del detalle de ruta en Excel",
      "Tendencia Estacional agregado al menú lateral y a los permisos de Gerente de Ventas y Gerente Regional",
    ],
    newDashboardPerms: ["preventas-realizadas", "tendencia-estacional", "informacion-rutas"],
    newDashboardNames: {
      "preventas-realizadas": "Preventas Realizadas",
      "tendencia-estacional": "Tendencia Estacional",
      "informacion-rutas": "Información Rutas",
    },
  },
  {
    version: "1.1.4",
    date: "Mayo 2026",
    fixes: [
      "Nombres de canal en tabla y Excel de Proveedores corregidos (ahora muestra WHS, DTS, PROV, SPM en lugar del nombre largo)",
      "Dashboards ya no muestran ceros al inicio de un nuevo mes: se selecciona automáticamente el período con datos más reciente",
    ],
    features: [
      "Nuevo dashboard «Tendencia Estacional» en Evolución Mes: compara ventas del mes actual contra los mismos meses de años anteriores o los últimos 6 meses",
      "Filtros por Regional, Canal, Gestión y Mes con selector de corte de días (mes completo, hasta hoy, o rango personalizado)",
      "Toggle Bs / Uds y modo Estacional / Últimos 6 meses en Tendencia Estacional",
    ],
    newDashboardPerms: ["tendencia-estacional"],
    newDashboardNames: { "tendencia-estacional": "Tendencia Estacional" },
  },
  {
    version: "1.1.3",
    date: "Abril 2026",
    fixes: [
      "Corregida la Pantalla Blanca (WSoD): se agregó ErrorBoundary global para mostrar un mensaje de error en lugar de pantalla en blanco",
      "Exportación Excel: corregido error 500 causado por column_dimensions incompatible con modo write-only de openpyxl",
      "Exportación Excel: corregido problema de GZipMiddleware que eliminaba el Content-Length y corrompía la descarga en rangos grandes",
      "Toast de descarga ya no desaparece al navegar entre dashboards (movido fuera del árbol de rutas)",
    ],
    features: [
      "Nueva sección «Documentos» en el menú: Dashboard Matriz y Descargar Archivos",
      "Exportación de Ventas Efectivas con Combo Armado a Excel con selector de fechas",
      "Notificación persistente durante la descarga: el archivo se genera en segundo plano y se descarga automáticamente al finalizar",
      "Categoría «Sin Clasificar» en Unidades Vendidas y toggle Bs / Uds global",
      "Logos PNG en login y barra de navegación",
      "Favicon del sistema actualizado al ícono Cruzimex (CRZX.ico)",
    ],
    newDashboardPerms: ["descargas"],
    newDashboardNames: { descargas: "Descargar Archivos" },
  },
  {
    version: "1.1.2",
    date: "Abril 2026",
    fixes: ["Clasificación de productos por categoría ahora usa la columna «línea» del DW (más precisa)", "Redirect al cerrar sesión apunta a la ruta correcta en producción"],
    features: [
      "Unidades por Vendedor-SKU: toggle global Bs / Uds afecta toda la página (tabla de vendedores, gráfico y tabla de SKUs)",
      "Unidades por Vendedor-SKU: gráfico de SKUs muestra barra de Avance y barra de Presupuesto",
      "Unidades por Vendedor-SKU: tabla de SKUs ahora muestra Avance, Presupuesto y Cumplimiento",
      "Dashboard Canales / Regional: toggle Bs / Uds en la sección de SKUs",
      "Dashboard Canales / Regional: columna Presupuesto y Cumplimiento en la tabla de SKUs",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.1.0",
    date: "Abril 2026",
    fixes: [
      "Corrección del gráfico «Avance vs Presupuesto» en Unidades por Vendedor-SKU (escala incorrecta entre unidades y Bs)",
      "Acceso correcto para Gerentes Generales y Gerentes de Ventas en el dashboard de Unidades por Vendedor-SKU",
      "Cambio de proveedor en los dashboards ya no mantenía datos del proveedor anterior",
    ],
    features: [
      "Nueva sección Proveedores con 5 dashboards (Pepsico, Softys, DMujer, Apego, COLHER): KPIs, ventas por regional, gráfico por canal y tabla detalle con exportación a Excel",
      "Tabla de Vendedores ahora muestra la columna «Venta Bs» con el total monetario por vendedor",
      "Gráfico de SKUs del vendedor ahora refleja Venta Neta en Bs",
      "Indicador de cumplimiento renombrado a «Cumpl.» para mayor claridad (es % vs presupuesto en Bs, no vs unidades)",
      "Footer del sistema con número de versión",
    ],
    newDashboardPerms: ["pepsico", "softys", "dmujer", "apego", "colher"],
    newDashboardNames: {
      pepsico: "Dashboard Pepsico",
      softys: "Dashboard Softys",
      dmujer: "Dashboard DMujer",
      apego: "Dashboard Apego",
      colher: "Dashboard COLHER",
    },
  },
  {
    version: "1.0.0",
    date: "Marzo 2026",
    fixes: [],
    features: ["Lanzamiento inicial del sistema BI Cruzimex"],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
];
