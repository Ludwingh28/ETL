export const CURRENT_VERSION = "1.1.2";

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
    version: "1.1.2",
    date: "Abril 2026",
    fixes: [
      "Clasificación de productos por categoría ahora usa la columna «línea» del DW (más precisa)",
      "Redirect al cerrar sesión apunta a la ruta correcta en producción",
    ],
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
      softys:  "Dashboard Softys",
      dmujer:  "Dashboard DMujer",
      apego:   "Dashboard Apego",
      colher:  "Dashboard COLHER",
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
