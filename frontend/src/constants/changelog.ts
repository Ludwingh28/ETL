export const CURRENT_VERSION = "1.2.9.4";

export interface ChangelogVersion {
  version: string;
  date: string;
  fixes: string[];
  features: string[];
  newDashboardPerms: string[];
  newDashboardNames: Record<string, string>;
}

// Descripciones simplificadas para usuarios finales.
// El detalle técnico completo está en CHANGELOG.md en la raíz del proyecto.
export const CHANGELOG: ChangelogVersion[] = [
  {
    version: "1.2.9.4",
    date: "Septiembre 2026",
    fixes: [
      "Dashboard Vendedor — la card de Unidades Vendidas ya no mostraba el presupuesto total del vendedor al filtrar por ruta; ahora muestra las unidades de la ruta vs el total vendido por el vendedor y su % de participación, igual que la card de Ventas Bs.",
      "Ventas Nacional — el gráfico Evolutivo ahora respeta los filtros de categoría, proveedor, sub-categoría, marca y producto al calcular las barras de ventas",
      "Ventas Nacional — el presupuesto mensual en el eje X del Evolutivo ya no sumaba versiones históricas; ahora usa solo la versión vigente de cada mes",
      "Ventas Nacional — las etiquetas del gráfico de dona de canales ya no se superponen en segmentos pequeños; los segmentos menores al 5% se muestran en una leyenda compacta debajo",
      "Dashboard Vendedor — los dropdowns de filtros ya no quedaban tapados por las filas fijas de la tabla al anclar el panel de filtros",
      "Dashboard Vendedor — la cantidad de clientes en cartera al filtrar por ruta ahora coincide con el número mostrado en el listbox de rutas",
    ],
    features: [
      "Dashboard Vendedor — nuevo gráfico de dona 'Participación por Ruta' en las cards de KPI: muestra qué rutas concentran más ventas del vendedor, con leyenda de nombres y porcentajes; las rutas actualmente filtradas se resaltan",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.9.3",
    date: "Septiembre 2026",
    fixes: [
      "Dashboard Softys — el porcentaje de cumplimiento ya no mostraba 'Infinity%' cuando el presupuesto era cero",
      "Dashboard Softys — la línea roja de proyección en el gráfico de tendencia por SKU ya no aparece en meses anteriores (solo se muestra en el mes actual)",
      "Dashboard Softys — en meses pasados, la leyenda 'Proyección' ya no aparece en los gráficos de tendencia",
      "Dashboard Softys — al cambiar de mes o año, el filtro regional de la tabla 'Presupuesto por SKU' ahora vuelve automáticamente a 'NACIONAL'",
      "Dashboard Proveedor — las cifras de ventas ahora muestran el monto neto facturado correcto (antes se usaba el precio bruto del producto)",
      "General — correcciones internas de seguridad y estabilidad en varios endpoints",
    ],
    features: [
      "Dashboard Softys — nueva tabla 'Presupuesto por SKU': muestra el presupuesto en Bs. y unidades por producto, filtrable por regional (Nacional, Santa Cruz, Cochabamba, La Paz)",
      "Dashboard Softys — cards de canal ahora muestran el porcentaje real de cobertura (clientes visitados vs universo de clientes del territorio)",
      "Dashboard Softys — exportación Excel: incluye una nueva hoja 'Presupuesto' con el detalle por producto, regional y canal",
      "Dashboard Proveedor (Softys) — nuevas cards de KPI de presupuesto: Bs. presupuestados, unidades presupuestadas y % de cumplimiento",
      "Dashboard Proveedor (Softys) — exportación Excel: nueva hoja 'Presupuesto' con detalle completo por SKU",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.9.2",
    date: "Septiembre 2026",
    fixes: [
      "Dashboard Softys — los nombres de categorías (Pañales, Papel Higiénico, Pañuelos, etc.) se mostraban con caracteres incorrectos en el comparativo histórico; corregido",
      "Dashboard Softys — en pantallas pequeñas, las tarjetas de canal ya no se desbordan ni se ven apretadas",
    ],
    features: [
      "Dashboard Softys — el dashboard ahora abre siempre en la vista Nacional",
      "Dashboard Softys — la sección de SKUs ocupa el ancho completo de la pantalla",
      "Dashboard Softys — gráfico de tendencia por SKU rediseñado: barras de avance acumulado y línea de presupuesto, igual que el gráfico principal de tendencia",
      "Ventas Nacional — sección de canales con gráfico de dona: muestra cuánto peso tiene cada canal en el presupuesto total y su cumplimiento al pasar el cursor",
      "Ventas Nacional — tabla de clientes: nuevo toggle Bs / Unidades y botón para ordenar de mayor a menor o viceversa",
      "Ventas Nacional — gráfico de Tendencia: nuevo modo 'Evolutivo' que muestra las ventas de los últimos 6 meses en barras, con la evolución real y una proyección del cierre del mes actual",
      "Dashboard Vendedor — la card de Unidades Vendidas ahora muestra el % de cumplimiento vs presupuesto y el gap en unidades",
      "Dashboard Vendedor — tabla de clientes: nuevo selector de fecha para ver solo los clientes que compraron en un día específico; toggle Bs / Unidades y orden de mayor a menor o viceversa",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.9.1",
    date: "Agosto 2026",
    fixes: [
      "Administración — al crear un usuario Vendedor, las opciones de canal ahora se cargan correctamente según los datos reales del sistema",
      "Administración — al vincular un vendedor del sistema, la regional se asigna con el nombre correcto (ej. Santa Cruz, Cochabamba)",
      "Administración — al cambiar el tipo de usuario, los campos de canal y regional se limpian automáticamente",
      "Dashboard Vendedor — el selector de vendedor ya no aparece vacío al entrar en un mes nuevo",
    ],
    features: [
      "Administración — crear usuario Vendedor es más simple: un solo buscador muestra el vendedor con su canal y regional listos; el botón 'Cambiar' permite corregir la selección",
      "Administración — nueva opción para eliminar usuarios con confirmación de seguridad",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.9.0",
    date: "Agosto 2026",
    fixes: [
      "Dashboard Vendedor — la tabla de clientes ya no desplaza el panel de SKUs fuera de la pantalla",
      "Dashboard Vendedor — el panel de filtros ya no se superpone al menú de navegación en pantallas pequeñas",
      "Dashboard Vendedor — la cartera de clientes ya no cambia al filtrar por marca o categoría",
      "Dashboard Vendedor — supervisores, gerentes y analistas ahora pueden seleccionar cualquier vendedor correctamente",
    ],
    features: [
      "Dashboard Vendedor — tabla de clientes rediseñada: cada columna es un día de compra; clic en una fecha muestra los SKUs vendidos ese día",
      "Dashboard Vendedor — el panel de filtros se puede anclar en pantalla al hacer scroll",
      "Dashboard Vendedor — KPI 'Clientes Activos' muestra el porcentaje de cobertura de cartera",
      "Dashboard Vendedor — KPI de comparación contra el mes anterior con variación porcentual",
      "Dashboard Vendedor — al filtrar por ruta, las ventas y clientes se muestran solo para esa ruta",
    ],
    newDashboardPerms: ["vendedores-personal"],
    newDashboardNames: { "vendedores-personal": "Dashboard Vendedor" },
  },
  {
    version: "1.2.8.6",
    date: "Agosto 2026",
    fixes: [
      "Gráficos de tendencia — la proyección ahora refleja el ritmo de ventas real, sin distorsión por días sin actividad",
      "Dashboard Nacional — al seleccionar un SKU, la tabla de vendedores muestra a todos incluyendo quienes no vendieron ese producto",
    ],
    features: [
      "Dashboard Nacional — nueva vista de vendedores desglosada por categoría de producto",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.8.5",
    date: "Agosto 2026",
    fixes: [
      "Ventas Nacional — los filtros de Canal, Sub-categoría, Proveedor, Marca y Productos ahora muestran 'Cargando…' mientras se obtienen las opciones",
      "Ventas Nacional — al hacer clic en un vendedor, la tabla de clientes filtra correctamente",
    ],
    features: [
      "Ventas Nacional — clic en un vendedor filtra automáticamente la tabla de clientes; un badge indica el vendedor activo",
      "Ventas Nacional — el panel de filtros permanece visible al hacer scroll",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.8.4",
    date: "Julio 2026",
    fixes: [
      "Ventas Nacional — las tablas de vendedores y clientes ya no se extienden indefinidamente; tienen scroll interno con encabezado fijo",
    ],
    features: [
      "Ventas Nacional — buscador de SKUs por cliente con contador de resultados; se reinicia al seleccionar otro cliente",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.8.3",
    date: "Julio 2026",
    fixes: [
      "Ventas Nacional — el filtro de Proveedor ahora muestra proveedores correctamente (antes mostraba los mismos valores que Marca)",
    ],
    features: [
      "Ventas Nacional — tabla de SKUs: nueva opción de ordenar por ventas en Bs",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.8.2",
    date: "Julio 2026",
    fixes: [
      "Ventas Nacional — el filtro de canal ya no se resetea al cambiar entre regionales",
      "Ventas Nacional — el comparativo de marca/producto ya no queda cargando indefinidamente",
      "Ventas Nacional — el presupuesto en KPIs y gráfico de Tendencia ahora respeta los filtros de marca y producto activos",
    ],
    features: [
      "Ventas Nacional — nuevo filtro 'Productos' como último nivel de la cascada de filtros",
      "Ventas Nacional — mini-cards de canal con avance, cumplimiento y clientes; toggle Bs / Unidades",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.8",
    date: "Julio 2026",
    fixes: [
      "Reportes — el botón 'Continuar' ahora siempre es visible sin necesidad de hacer scroll",
      "Unidades Vendidas — las sub-categorías se cargan correctamente al entrar al dashboard",
      "Login — usuarios sin acceso al dashboard principal ya no entran en un ciclo de error al iniciar sesión",
      "Sistema — la página ya no ofrece traducción automática (causaba errores de pantalla blanca en Chrome)",
    ],
    features: [
      "Información Rutas — filtro 'Clase' reemplaza a 'Marca' para una clasificación más precisa",
      "Unidades Vendidas — nueva categoría 'Total' que agrupa todas las líneas; es la vista por defecto",
      "Comportamiento Productos — nuevo filtro de Proveedor antes del filtro de Marca",
      "Dashboard Softys — el filtro de subcategoría ahora aplica correctamente; nueva subcategoría 'Servilletas'",
      "Ventas Nacional — los filtros de categoría, proveedor, marca y canal aplican también a los KPIs y gráfico de Tendencia",
      "Navegación — los accesos a los dashboards anteriores (legacy) se agruparon en una sección separada del menú de usuario",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.7",
    date: "Julio 2026",
    fixes: [
      "Información Rutas — el buscador de rutas ahora funciona correctamente",
      "Información Rutas — el conteo de clientes ya no aparece multiplicado",
      "Dashboard Supervisores — la lista de vendedores ya no muestra duplicados",
      "Reportes — la captura de pantalla ahora se genera correctamente",
    ],
    features: [
      "Gestión de Usuarios — columna 'Última sesión' con indicador 'Online' en tiempo real",
      "Sistema de Reportes — botón en todos los dashboards para reportar errores o solicitar mejoras; incluye captura automática de pantalla",
      "Sistema de Reportes — página de administración de tickets con filtros por tipo, estado y prioridad",
      "Dashboard Softys — KPI 'Cobertura' muestra los clientes reales con compras Softys en el período",
      "Dashboard Softys — tabla de SKUs: nueva columna 'Cob.' con clientes por SKU",
      "Unidades Supervisores — filtro de proveedor en sub-categorías; contador de SKUs por vendedor; ordenamiento por Bs o cumplimiento",
      "Comportamiento Productos — opción 'Todos los SKUs' para ver el consolidado de la marca sin seleccionar un producto específico",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.6",
    date: "Junio 2026",
    fixes: [
      "Dashboard Softys — corregidos varios errores de carga en KPIs y filtros para usuarios Proveedor",
      "Dashboard Softys — tabla comparativa de clientes ahora muestra hasta 500 resultados",
    ],
    features: [
      "Dashboard Softys — rediseño completo con dos modos: 'SKUs por Canal' y 'Clientes × Vendedor'",
      "Dashboard Softys — buscador de vendedor con sugerencias; tabla de clientes semanal con detalle de SKUs",
      "Dashboard Softys — vista Comparativo Meses: tabla de clientes con columna por mes (3, 6 o 12 meses)",
      "Dashboard Softys — sub-opciones de Pañales: Babysec y Packeton por separado",
      "Dashboard Softys — filtros de período directamente al lado del selector de vista",
      "Dashboard Softys — exportación a Excel de ventas del mes seleccionado",
    ],
    newDashboardPerms: ["softys-nuevo"],
    newDashboardNames: { "softys-nuevo": "Dashboard Softys" },
  },
  {
    version: "1.2.5",
    date: "Junio 2026",
    fixes: [
      "Seguridad — actualizaciones de librerías y mejoras de seguridad en autenticación, cookies y control de acceso",
      "Comportamiento Productos — las tablas ahora se generan correctamente al seleccionar un producto",
      "Ficha de SKU — los almacenes de La Paz ahora aparecen en el filtro",
      "Menú mobile — ya es posible hacer scroll y acceder a perfil y cerrar sesión",
      "Proveedores — las ventas de DMujer ya no quedan excluidas del dashboard",
    ],
    features: [
      "Nuevo dashboard 'Comportamiento de Productos': historial de ventas con filtros de marca, regional y canal",
      "Nuevo dashboard 'Lista de Precios': tabla con precios, márgenes y estados por producto",
      "Ficha de SKU — gráfico de inventario muestra días de cobertura; nuevo filtro de marca; filtro de almacén dinámico por regional",
      "Comportamiento Productos — exportación Excel con todos los SKUs seleccionados, un tab por SKU",
    ],
    newDashboardPerms: ["ficha-sku", "distribucion-rutas", "comportamiento-productos", "lista-precios"],
    newDashboardNames: {
      "ficha-sku": "Ficha de SKU",
      "distribucion-rutas": "Distribución de Rutas",
      "comportamiento-productos": "Comportamiento de Productos",
      "lista-precios": "Lista de Precios",
    },
  },
  {
    version: "1.2.4",
    date: "Mayo 2026",
    fixes: [
      "Preventas — la lista de vendedores ahora muestra solo los registrados en el sistema",
      "Preventas / Información Rutas — los montos se muestran con decimales reales",
    ],
    features: [
      "Dashboard Supervisores — fila de totales diarios al pie de la tabla de liquidaciones",
      "Dashboard Matriz — datos reales desde el sistema en lugar de datos de ejemplo",
      "Información Rutas — tendencia semanal dinámica; tabla de clientes con detalle de SKUs por cliente",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.3",
    date: "Mayo 2026",
    fixes: [
      "Gerente Regional — los filtros de regional ahora se bloquean correctamente al perfil del usuario en todos los dashboards",
      "Supervisores — los nombres de vendedor ahora aparecen en formato normal (no en MAYÚSCULAS)",
    ],
    features: [
      "Tendencia Estacional — nuevo filtro de supervisor",
      "Dashboard Supervisores — Gerente Regional puede filtrar por canal y supervisor dentro de su regional",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.2",
    date: "Mayo 2026",
    features: [
      "Preventas — columnas de hora de inicio, último movimiento y tiempo trabajado por vendedor",
    ],
    fixes: [],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.1",
    date: "Mayo 2026",
    fixes: ["Dashboard Supervisores — los montos en la tabla de liquidaciones se muestran completos en Bs, sin abreviar"],
    features: [],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.2.0",
    date: "Mayo 2026",
    fixes: [
      "Dashboard Supervisores — la categoría 'Sin Clasificar' ya aparece en tabla y gráfico",
      "Global — al entrar en un mes nuevo sin datos, el sistema salta automáticamente al período más reciente disponible",
    ],
    features: [
      "Nuevo dashboard 'Preventas Realizadas': seguimiento de pedidos con selector de fechas libre y gráfico con drill-down por canal, supervisor y vendedor",
      "Dashboard Supervisores — toggle Bs / Unidades en el detalle por vendedor; nueva sección 'Liquidaciones' con ventas diarias en grilla de fechas",
      "Información Rutas — rediseño completo con más filtros, panel de detalle y exportación Excel",
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
      "Proveedores — nombres de canal corregidos en tabla y Excel (WHS, DTS, PROV, SPM)",
      "Global — los dashboards ya no muestran ceros al inicio de un mes nuevo",
    ],
    features: [
      "Nuevo dashboard 'Tendencia Estacional': compara ventas del mes actual contra meses anteriores o los últimos 6 meses; filtros por regional, canal y toggle Bs / Unidades",
    ],
    newDashboardPerms: ["tendencia-estacional"],
    newDashboardNames: { "tendencia-estacional": "Tendencia Estacional" },
  },
  {
    version: "1.1.3",
    date: "Abril 2026",
    fixes: [
      "Global — ya no aparece pantalla en blanco al ocurrir un error; se muestra un mensaje claro",
      "Descarga Excel — corregidos errores que corrompían el archivo al descargar rangos grandes",
    ],
    features: [
      "Nueva sección 'Documentos': Dashboard Matriz y Descargar Archivos",
      "Exportación de Ventas Efectivas con Combo Armado a Excel",
      "Notificación en pantalla mientras el archivo se genera en segundo plano",
      "Logos y favicon actualizados",
    ],
    newDashboardPerms: ["descargas"],
    newDashboardNames: { descargas: "Descargar Archivos" },
  },
  {
    version: "1.1.2",
    date: "Abril 2026",
    fixes: [],
    features: [
      "Unidades Vendedor-SKU — toggle Bs / Unidades global; gráfico y tabla con avance y presupuesto",
      "Dashboard Canales/Regional — toggle Bs / Unidades en SKUs con columnas de presupuesto y cumplimiento",
    ],
    newDashboardPerms: [],
    newDashboardNames: {},
  },
  {
    version: "1.1.0",
    date: "Abril 2026",
    fixes: [
      "Unidades Vendedor-SKU — gráfico de avance vs presupuesto con escala correcta",
      "Cambio de proveedor ya no mantiene los datos del proveedor anterior en pantalla",
    ],
    features: [
      "Nueva sección 'Proveedores': dashboards para Pepsico, Softys, DMujer, Apego y COLHER con KPIs, gráficos y exportación Excel",
      "Número de versión visible en el pie de página",
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
