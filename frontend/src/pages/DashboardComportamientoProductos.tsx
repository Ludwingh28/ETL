import {
  useState, useEffect, useCallback, useMemo, useRef, Fragment, type ChangeEvent,
} from "react";
import ExcelJS from "exceljs";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from "recharts";
import { AlertCircle, X, ChevronDown, Search, Download } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import type { AuthContextValue } from "../types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProductoOption {
  codigo: string; nombre: string; marca: string; linea: string; es_licor: boolean
}
interface DatoG1 { dimension: string; bs: number; uds: number; cajas9l: number }
interface DatoG2 { codigo: string; nombre: string; marca: string; bs: number; uds: number; cajas9l: number; es_licor: boolean }
interface FilaTotalTabla { anho: number; mes: number; clientes: number; uds: number; cajas9l: number }
interface FilaCanalTabla { canal: string; anho: number; mes: number; clientes: number; uds: number; cajas9l: number }

type Metrica = "bs" | "uds" | "cajas9l"

// ─── Constantes ───────────────────────────────────────────────────────────────

const REGIONALES = ["Nacional", "Santa Cruz", "Cochabamba", "La Paz"] as const

const ADMIN_CARGOS = new Set([
  "Administrador de Sistema", "Subadministrador de Sistemas",
  "Gerente General", "Gerente de Ventas", "Analista de Datos",
])

const REGIONAL_CONFIG: Record<string, { badge: string }> = {
  Nacional:     { badge: "bg-brand-100 text-brand-700 border-brand-200" },
  "Santa Cruz": { badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Cochabamba:   { badge: "bg-violet-100 text-violet-700 border-violet-200" },
  "La Paz":     { badge: "bg-amber-100 text-amber-700 border-amber-200" },
}

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const MES_SHORT = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
const CAL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12]

const CANAL_PAL = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444",
                   "#06b6d4","#84cc16","#f97316","#ec4899","#6366f1","#14b8a6","#a3e635"]

// ─── Formatos ─────────────────────────────────────────────────────────────────

const fmtBs = (v: number) =>
  `Bs ${v >= 1_000_000 ? (v/1_000_000).toFixed(2)+"M" : v >= 1_000 ? (v/1_000).toFixed(1)+"K" : v.toFixed(0)}`
const fmtFull = (v: number) =>
  new Intl.NumberFormat("es-BO", { minimumFractionDigits: 0 }).format(Math.round(v))
function fmtMetrica(v: number, m: Metrica) {
  if (m === "bs")      return fmtBs(v)
  if (m === "cajas9l") return `${fmtFull(v)} cjs`
  return `${fmtFull(v)} uds`
}
function labelMetrica(m: Metrica) {
  return m === "bs" ? "Venta Bs" : m === "uds" ? "Unidades" : "Cajas 9L"
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

const Spinner = () => (
  <div className="h-64 flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
)

function MetricaToggle({ value, onChange, tieneAlgunLicor }: {
  value: Metrica; onChange: (m: Metrica) => void; tieneAlgunLicor: boolean
}) {
  const opts: { k: Metrica; label: string }[] = [
    { k: "bs",  label: "Bs"   },
    { k: "uds", label: "Uds"  },
    ...(tieneAlgunLicor ? [{ k: "cajas9l" as Metrica, label: "Cajas 9L" }] : []),
  ]
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Ver en</label>
      <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
        {opts.map(({ k, label }) => (
          <button key={k} onClick={() => onChange(k)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              value === k ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload, label, metrica }: {
  active?: boolean
  payload?: { value: number; name: string; color: string }[]
  label?: string
  metrica: Metrica
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs min-w-40">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-3 mb-1">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="text-slate-600 truncate">{p.name}</span>
          </span>
          <span className="font-semibold text-slate-800 shrink-0">{fmtMetrica(p.value, metrica)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="border-t border-slate-100 mt-1.5 pt-1.5 flex justify-between font-semibold text-slate-700">
          <span>Total</span><span>{fmtMetrica(total, metrica)}</span>
        </div>
      )}
    </div>
  )
}

// ─── Tablas históricas formato año fiscal ─────────────────────────────────────

function TablasHistoricas({
  tablaTotal, tablaCanal, productoNombre, loading, noSeleccion, esLicor,
}: {
  tablaTotal: FilaTotalTabla[]
  tablaCanal: FilaCanalTabla[]
  productoNombre: string
  loading: boolean
  noSeleccion: boolean
  esLicor: boolean
}) {
  const anhos = useMemo(() => {
    return [...new Set([...tablaTotal, ...tablaCanal].map(r => r.anho))].sort()
  }, [tablaTotal, tablaCanal])

  const canales = useMemo(
    () => [...new Set(tablaCanal.map(r => r.canal))].sort(),
    [tablaCanal]
  )

  type TipoTabla = "clientes" | "uds" | "cajas9l"

  function getTotal(anho: number, mes: number, tipo: TipoTabla): number | null {
    const row = tablaTotal.find(r => r.anho === anho && r.mes === mes)
    if (!row) return null
    if (tipo === "clientes") return row.clientes
    if (tipo === "uds")      return row.uds
    return row.cajas9l
  }

  function getCanalVal(canal: string, anho: number, mes: number, tipo: TipoTabla): number | null {
    const row = tablaCanal.find(r => r.canal === canal && r.anho === anho && r.mes === mes)
    if (!row) return null
    if (tipo === "clientes") return row.clientes
    if (tipo === "uds")      return row.uds
    return row.cajas9l
  }

  function rowSum(anho: number, tipo: TipoTabla, canal?: string): number {
    return CAL_MONTHS.reduce((s, m) => {
      const v = canal ? getCanalVal(canal, anho, m, tipo) : getTotal(anho, m, tipo)
      return s + (v ?? 0)
    }, 0)
  }

  function varPct(curr: number | null, prev: number | null): number | null {
    if (curr === null || prev === null || prev === 0) return null
    return ((curr - prev) / prev) * 100
  }

  function fmtVar(pct: number | null): string {
    if (pct === null) return "—"
    return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%"
  }

  function varCls(pct: number | null): string {
    if (pct === null) return "text-slate-400"
    return pct >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"
  }

  function renderCard(tipo: TipoTabla) {
    const hasTotal = tipo !== "clientes"
    const colSpan = 1 + 12 + (hasTotal ? 1 : 0)
    const isClientes = tipo === "clientes"
    const cardTitle = isClientes ? "Clientes Activos" : tipo === "uds" ? "Ventas Unidades" : "Ventas Cajas 9L"

    return (
      <div className="flex-1 min-w-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">
        <div className={`px-4 py-2 border-b border-slate-100 ${isClientes ? "bg-orange-50" : "bg-blue-50"}`}>
          <h3 className={`text-xs font-bold uppercase tracking-widest ${isClientes ? "text-orange-700" : "text-blue-700"}`}>
            {cardTitle}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-slate-500 font-semibold whitespace-nowrap sticky left-0 bg-slate-50 z-10 min-w-16">Período</th>
                {CAL_MONTHS.map(m => (
                  <th key={m} className="px-1.5 py-2 text-center text-slate-500 font-semibold whitespace-nowrap min-w-10">
                    {MES_SHORT[m]}
                  </th>
                ))}
                {hasTotal && (
                  <th className="px-2 py-2 text-center text-slate-600 font-bold whitespace-nowrap bg-slate-100 min-w-14 border-l border-slate-200">
                    Total
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {/* Producto — encabezado naranja */}
              <tr className="bg-orange-500">
                <td
                  className="px-3 py-1.5 font-bold text-white text-xs truncate sticky left-0 bg-orange-500 z-10"
                  colSpan={colSpan}
                >
                  {productoNombre || "—"}
                </td>
              </tr>
              {anhos.map((anho, ai) => {
                const vals = CAL_MONTHS.map(m => getTotal(anho, m, tipo))
                const tot = rowSum(anho, tipo)
                const prev = ai > 0 ? anhos[ai - 1] : null
                const varVals = prev !== null
                  ? CAL_MONTHS.map(m => varPct(getTotal(anho, m, tipo), getTotal(prev, m, tipo)))
                  : null
                const totVar = prev !== null ? varPct(rowSum(anho, tipo), rowSum(prev, tipo)) : null

                return (
                  <Fragment key={`total-${anho}`}>
                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-1.5 font-semibold text-slate-700 whitespace-nowrap sticky left-0 bg-white z-10">{`FY${String(anho).slice(-2)}`}</td>
                      {vals.map((v, mi) => (
                        <td key={mi} className="px-1.5 py-1.5 text-center text-slate-600 whitespace-nowrap tabular-nums">
                          {v !== null ? fmtFull(v) : "—"}
                        </td>
                      ))}
                      {hasTotal && (
                        <td className="px-2 py-1.5 text-center font-semibold text-slate-800 whitespace-nowrap tabular-nums bg-slate-50 border-l border-slate-200">
                          {fmtFull(tot)}
                        </td>
                      )}
                    </tr>
                    {varVals && (
                      <tr className="bg-slate-50/60">
                        <td className="px-3 py-0.5 text-[10px] text-slate-400 italic whitespace-nowrap sticky left-0 bg-slate-50 z-10">Var</td>
                        {varVals.map((pct, mi) => (
                          <td key={mi} className={`px-1.5 py-0.5 text-center text-[10px] whitespace-nowrap tabular-nums ${varCls(pct)}`}>
                            {fmtVar(pct)}
                          </td>
                        ))}
                        {hasTotal && (
                          <td className={`px-2 py-0.5 text-center text-[10px] tabular-nums bg-slate-100 border-l border-slate-200 ${varCls(totVar)}`}>
                            {fmtVar(totVar)}
                          </td>
                        )}
                      </tr>
                    )}
                  </Fragment>
                )
              })}

              {/* Canales — encabezados azules */}
              {canales.map(canal => (
                <Fragment key={`canal-${canal}`}>
                  <tr className="bg-blue-600">
                    <td
                      className="px-3 py-1.5 font-bold text-white text-xs whitespace-nowrap sticky left-0 bg-blue-600 z-10"
                      colSpan={colSpan}
                    >
                      {canal}
                    </td>
                  </tr>
                  {anhos.map((anho, ai) => {
                    const vals = CAL_MONTHS.map(m => getCanalVal(canal, anho, m, tipo))
                    const tot = rowSum(anho, tipo, canal)
                    const prev = ai > 0 ? anhos[ai - 1] : null
                    const varVals = prev !== null
                      ? CAL_MONTHS.map(m => varPct(getCanalVal(canal, anho, m, tipo), getCanalVal(canal, prev, m, tipo)))
                      : null
                    const totVar = prev !== null
                      ? varPct(rowSum(anho, tipo, canal), rowSum(prev, tipo, canal))
                      : null

                    return (
                      <Fragment key={`${canal}-${anho}`}>
                        <tr className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-3 py-1.5 font-semibold text-slate-700 whitespace-nowrap sticky left-0 bg-white z-10">{`FY${String(anho).slice(-2)}`}</td>
                          {vals.map((v, mi) => (
                            <td key={mi} className="px-1.5 py-1.5 text-center text-slate-600 whitespace-nowrap tabular-nums">
                              {v !== null ? fmtFull(v) : "—"}
                            </td>
                          ))}
                          {hasTotal && (
                            <td className="px-2 py-1.5 text-center font-semibold text-slate-800 whitespace-nowrap tabular-nums bg-slate-50 border-l border-slate-200">
                              {fmtFull(tot)}
                            </td>
                          )}
                        </tr>
                        {varVals && (
                          <tr className="bg-slate-50/60">
                            <td className="px-3 py-0.5 text-[10px] text-slate-400 italic whitespace-nowrap sticky left-0 bg-slate-50 z-10">Var</td>
                            {varVals.map((pct, mi) => (
                              <td key={mi} className={`px-1.5 py-0.5 text-center text-[10px] whitespace-nowrap tabular-nums ${varCls(pct)}`}>
                                {fmtVar(pct)}
                              </td>
                            ))}
                            {hasTotal && (
                              <td className={`px-2 py-0.5 text-center text-[10px] tabular-nums bg-slate-100 border-l border-slate-200 ${varCls(totVar)}`}>
                                {fmtVar(totVar)}
                              </td>
                            )}
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (noSeleccion) {
    return (
      <div className="px-5 py-12 text-center text-slate-400 text-sm">
        Selecciona uno o más productos en el filtro para ver las tablas históricas
      </div>
    )
  }

  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (tablaTotal.length === 0 && tablaCanal.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-slate-400 text-sm">
        Sin datos históricos para este producto
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div>
        <p className="text-xs text-slate-400">Año calendario: Enero → Diciembre · todos los años disponibles</p>
      </div>
      <div className="flex flex-col xl:flex-row gap-4">
        {renderCard("clientes")}
        {renderCard(esLicor ? "cajas9l" : "uds")}
      </div>
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function DashboardComportamientoProductos() {
  const { apiFetch, user } = useAuth() as AuthContextValue
  const isAdmin           = !!(user && (user.is_staff || ADMIN_CARGOS.has(user.cargo ?? "")))
  const isGerenteRegional = !isAdmin && user?.cargo === "Gerente Regional"

  const [regional,  setRegional]  = useState("Nacional")
  const [canal,     setCanal]     = useState("Todos")
  const [canales,   setCanales]   = useState<string[]>([])
  const [anho,      setAnho]      = useState(0)
  const [mes,       setMes]       = useState(0)
  const [periodos,  setPeriodos]  = useState<{ anho: number; mes_numero: number; mes_nombre: string }[]>([])
  const [metrica,   setMetrica]   = useState<Metrica>("bs")

  // Vendedor combobox
  const [vendedorQ,         setVendedorQ]         = useState("")
  const [vendedorComboOpen, setVendedorComboOpen] = useState(false)
  const [vendedorOpts,      setVendedorOpts]      = useState<string[]>([])
  const [vendedorSearch,    setVendedorSearch]    = useState("")
  const vendedorRef = useRef<HTMLDivElement>(null)

  // Marca
  const [marca,     setMarca]     = useState("")
  const [marcaOpts, setMarcaOpts] = useState<string[]>([])

  // Producto multi-select
  const [productosSeleccionados, setProductosSeleccionados] = useState<ProductoOption[]>([])
  const [productoSearch,         setProductoSearch]         = useState("")
  const [productosOpts,          setProductosOpts]          = useState<ProductoOption[]>([])
  const [productoComboOpen,      setProductoComboOpen]      = useState(false)
  const [loadingProductos,       setLoadingProductos]       = useState(false)
  const productoRef = useRef<HTMLDivElement>(null)

  // Selector de producto para tablas históricas
  const [tablaProductoCodigo, setTablaProductoCodigo] = useState("")

  // Datos
  const [dataG1,       setDataG1]       = useState<DatoG1[]>([])
  const [dataG2,       setDataG2]       = useState<DatoG2[]>([])
  const [g1Modo,       setG1Modo]       = useState<"vendedor" | "canal">("canal")
  const [tablaTotal,   setTablaTotal]   = useState<FilaTotalTabla[]>([])
  const [tablaCanal,   setTablaCanal]   = useState<FilaCanalTabla[]>([])
  const [loadingG1,    setLoadingG1]    = useState(false)
  const [loadingG2,    setLoadingG2]    = useState(false)
  const [loadingTabla, setLoadingTabla] = useState(false)
  const tablasCache = useRef(new Map<string, { total: FilaTotalTabla[]; canal: FilaCanalTabla[] }>())
  const [error,        setError]        = useState<string | null>(null)

  const tieneAlgunLicor = useMemo(
    () => productosSeleccionados.some(p => p.es_licor),
    [productosSeleccionados]
  )

  useEffect(() => {
    if (!tieneAlgunLicor) setMetrica(m => m === "cajas9l" ? "bs" : m)
  }, [tieneAlgunLicor])

  useEffect(() => {
    if (!isAdmin) {
      if (user?.regional) setRegional(user.regional)
      if (user?.canal)    setCanal(user.canal)
    }
  }, [isAdmin, user?.regional, user?.canal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiFetch<{ success: boolean; data: string[] }>("/dashboard/canales/lista/")
      .then(r => { if (r.success) setCanales(r.data) })
      .catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    apiFetch<{ success: boolean; data: { anho: number; mes_numero: number; mes_nombre: string }[] }>(
      "/dashboard/nacional/periodos/"
    ).then(r => {
      if (r.success && r.data.length > 0) {
        setPeriodos(r.data)
        const existe = r.data.some(p => p.anho === anho && p.mes_numero === mes)
        if (!existe) { setAnho(r.data[0].anho); setMes(r.data[0].mes_numero) }
      }
    }).catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOpciones = useCallback(async () => {
    const qs = new URLSearchParams({ regional: regional.toLowerCase().replace(/ /g, "_") })
    if (canal && canal !== "Todos") qs.set("canal", canal)
    try {
      const r = await apiFetch<{ success: boolean; vendedores: string[]; marcas: string[] }>(
        `/dashboard/comportamiento-productos/opciones/?${qs}`
      )
      if (r.success) {
        setVendedorOpts(r.vendedores)
        setMarcaOpts(r.marcas)
        if (marca && !r.marcas.includes(marca)) setMarca("")
      }
    } catch { /* silent */ }
  }, [regional, canal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchOpciones() }, [fetchOpciones])

  useEffect(() => {
    setProductosSeleccionados([])
    setProductoSearch("")
    setProductosOpts([])
    setTablaProductoCodigo("")

    if (!marca) return
    // Cargar productos de la marca y auto-seleccionar el primero para la tabla
    const qs = new URLSearchParams({ marca })
    apiFetch<{ success: boolean; data: ProductoOption[] }>(
      `/dashboard/comportamiento-productos/productos/?${qs}`
    ).then(r => {
      if (r.success && r.data.length > 0) {
        setProductosOpts(r.data)
        setProductosSeleccionados([r.data[0]])
      }
    }).catch(() => undefined)
  }, [marca]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProductos = useCallback(async () => {
    if (!marca && productoSearch.length < 2) { setProductosOpts([]); return }
    setLoadingProductos(true)
    const qs = new URLSearchParams()
    if (marca)          qs.set("marca", marca)
    if (productoSearch) qs.set("q", productoSearch)
    try {
      const r = await apiFetch<{ success: boolean; data: ProductoOption[] }>(
        `/dashboard/comportamiento-productos/productos/?${qs}`
      )
      if (r.success) setProductosOpts(r.data)
    } catch { setProductosOpts([]) }
    finally { setLoadingProductos(false) }
  }, [marca, productoSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!productoComboOpen) return
    void fetchProductos()
  }, [productoComboOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!productoComboOpen) return
    const t = setTimeout(() => void fetchProductos(), 300)
    return () => clearTimeout(t)
  }, [productoSearch]) // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (vendedorRef.current && !vendedorRef.current.contains(e.target as Node))
        setVendedorComboOpen(false)
      if (productoRef.current && !productoRef.current.contains(e.target as Node))
        setProductoComboOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => {
    const codigos = productosSeleccionados.map(p => p.codigo)
    for (const k of tablasCache.current.keys()) {
      if (!codigos.includes(k)) tablasCache.current.delete(k)
    }
    if (codigos.length === 0) {
      setTablaProductoCodigo("")
    } else if (!codigos.includes(tablaProductoCodigo)) {
      setTablaProductoCodigo(codigos[0])
    }
  }, [productosSeleccionados]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchG1 = useCallback(async () => {
    if (!marca && productosSeleccionados.length === 0) { setDataG1([]); return }
    setLoadingG1(true); setError(null)
    const qs = new URLSearchParams({
      regional: regional.toLowerCase().replace(/ /g, "_"),
      anho: String(anho), mes: String(mes),
    })
    if (canal && canal !== "Todos") qs.set("canal", canal)
    if (vendedorQ) qs.set("vendedor", vendedorQ)
    const codigos = productosSeleccionados.map(p => p.codigo).join(",")
    if (codigos) qs.set("codigos", codigos)
    if (marca)   qs.set("marca", marca)
    try {
      const r = await apiFetch<{ success: boolean; data: DatoG1[]; modo: "vendedor" | "canal" }>(
        `/dashboard/comportamiento-productos/grafico1/?${qs}`
      )
      if (r.success) { setDataG1(r.data ?? []); setG1Modo(r.modo ?? "canal") }
    } catch (e) { setError(e instanceof Error ? e.message : "Error al cargar datos") }
    finally { setLoadingG1(false) }
  }, [regional, canal, vendedorQ, anho, mes, productosSeleccionados, marca]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchG2 = useCallback(async () => {
    if (!marca && productosSeleccionados.length === 0) { setDataG2([]); return }
    setLoadingG2(true)
    const qs = new URLSearchParams({
      regional: regional.toLowerCase().replace(/ /g, "_"),
      anho: String(anho), mes: String(mes),
    })
    if (canal && canal !== "Todos") qs.set("canal", canal)
    if (vendedorQ) qs.set("vendedor", vendedorQ)
    const codigos = productosSeleccionados.map(p => p.codigo).join(",")
    if (codigos) qs.set("codigos", codigos)
    if (marca)   qs.set("marca", marca)
    try {
      const r = await apiFetch<{ success: boolean; data: DatoG2[] }>(
        `/dashboard/comportamiento-productos/grafico2/?${qs}`
      )
      if (r.success) setDataG2(r.data ?? [])
    } catch { setDataG2([]) }
    finally { setLoadingG2(false) }
  }, [regional, canal, vendedorQ, anho, mes, productosSeleccionados, marca]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchG1(); void fetchG2() }, [fetchG1, fetchG2])

  const fetchTabla = useCallback(async () => {
    if (!tablaProductoCodigo) { setTablaTotal([]); setTablaCanal([]); return }
    setLoadingTabla(true)
    const qs = new URLSearchParams({
      codigo:   tablaProductoCodigo,
      regional: regional.toLowerCase().replace(/ /g, "_"),
    })
    if (canal && canal !== "Todos") qs.set("canal", canal)
    if (vendedorQ)                  qs.set("vendedor", vendedorQ)
    try {
      const r = await apiFetch<{
        success: boolean; por_anho_mes: FilaTotalTabla[]; por_canal_anho_mes: FilaCanalTabla[]
      }>(`/dashboard/comportamiento-productos/tabla/?${qs}`)
      if (r.success) {
        setTablaTotal(r.por_anho_mes ?? [])
        setTablaCanal(r.por_canal_anho_mes ?? [])
        tablasCache.current.set(tablaProductoCodigo, { total: r.por_anho_mes ?? [], canal: r.por_canal_anho_mes ?? [] })
      }
    } catch { setTablaTotal([]); setTablaCanal([]) }
    finally { setLoadingTabla(false) }
  }, [tablaProductoCodigo, regional, canal, vendedorQ]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchTabla() }, [fetchTabla])

  // Pre-fetch datos históricos de todos los SKUs seleccionados en background
  useEffect(() => {
    for (const prod of productosSeleccionados) {
      if (tablasCache.current.has(prod.codigo)) continue
      const qs = new URLSearchParams({ codigo: prod.codigo, regional: regional.toLowerCase().replace(/ /g, "_") })
      if (canal && canal !== "Todos") qs.set("canal", canal)
      if (vendedorQ) qs.set("vendedor", vendedorQ)
      apiFetch<{ success: boolean; por_anho_mes: FilaTotalTabla[]; por_canal_anho_mes: FilaCanalTabla[] }>(
        `/dashboard/comportamiento-productos/tabla/?${qs}`
      ).then(r => {
        if (r.success) tablasCache.current.set(prod.codigo, { total: r.por_anho_mes ?? [], canal: r.por_canal_anho_mes ?? [] })
      }).catch(() => {})
    }
  }, [productosSeleccionados, regional, canal, vendedorQ]) // eslint-disable-line react-hooks/exhaustive-deps

  async function downloadXLSX() {
    const CAL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12]
    const MES_SHORT_LOCAL = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

    // ExcelJS uses ARGB (alpha + RGB, 8 hex chars)
    const ARGB_ORANGE = "FFF97316"
    const ARGB_BLUE   = "FF2563EB"
    const ARGB_WHITE  = "FFFFFFFF"
    const ARGB_SLATE  = "FFF8FAFC"
    const ARGB_GREEN  = "FF16A34A"
    const ARGB_RED    = "FFDC2626"
    const ARGB_GREY   = "FF94A3B8"
    const ARGB_DARK   = "FF1E293B"

    function varArgb(pct: number | null) {
      if (pct === null) return ARGB_GREY
      return pct > 0 ? ARGB_GREEN : ARGB_RED
    }
    function fmtVarStr(pct: number | null): string {
      if (pct === null) return "—"
      return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`
    }
    function varPctLocal(curr: number | null, prev: number | null): number | null {
      if (curr === null || prev === null || prev === 0) return null
      return ((curr - prev) / prev) * 100
    }
    function getVal(totalData: FilaTotalTabla[], anhoVal: number, mesVal: number, tipo: "clientes"|"uds"|"cajas9l"): number | null {
      const row = totalData.find(r => r.anho === anhoVal && r.mes === mesVal)
      if (!row) return null
      return tipo === "clientes" ? row.clientes : tipo === "uds" ? row.uds : row.cajas9l
    }
    function getCVal(canalRows: FilaCanalTabla[], canalVal: string, anhoVal: number, mesVal: number, tipo: "clientes"|"uds"|"cajas9l"): number | null {
      const row = canalRows.find(r => r.canal === canalVal && r.anho === anhoVal && r.mes === mesVal)
      if (!row) return null
      return tipo === "clientes" ? row.clientes : tipo === "uds" ? row.uds : row.cajas9l
    }
    function rowSumLocal(data: FilaTotalTabla[], anhoVal: number, tipo: "clientes"|"uds"|"cajas9l"): number {
      return CAL_MONTHS.reduce((s, m) => s + (getVal(data, anhoVal, m, tipo) ?? 0), 0)
    }
    function rowSumCanal(canalRows: FilaCanalTabla[], canalVal: string, anhoVal: number, tipo: "clientes"|"uds"|"cajas9l"): number {
      return CAL_MONTHS.reduce((s, m) => s + (getCVal(canalRows, canalVal, anhoVal, m, tipo) ?? 0), 0)
    }

    function bgFill(argb: string): ExcelJS.Fill {
      return { type: "pattern", pattern: "solid", fgColor: { argb } }
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = "Cruzimex ETL"

    for (const prod of productosSeleccionados) {
      const cached = tablasCache.current.get(prod.codigo)
      if (!cached) continue
      const { total, canal: canalData } = cached
      const anhosList = [...new Set(total.map(r => r.anho))].sort() as number[]
      const canalesList = [...new Set(canalData.map(r => r.canal))].sort() as string[]
      const tipoVenta: "uds"|"cajas9l" = prod.es_licor ? "cajas9l" : "uds"
      const seccionVentaLabel = prod.es_licor ? "VENTAS CAJAS 9L" : "VENTAS UNIDADES"

      const sheetName = prod.nombre.replace(/[\\/:*?[\]]/g, "").slice(0, 31)
      const ws = wb.addWorksheet(sheetName)
      ws.columns = [
        { width: 22 },
        ...CAL_MONTHS.map(() => ({ width: 10 })),
        { width: 10 },
      ]

      // totalCols = 1 (period) + 12 (months) + 1 (total if applicable)
      const TOTAL_COLS_WITH_TOT = 14
      const TOTAL_COLS_NO_TOT   = 13

      function styleHeaderRow(row: ExcelJS.Row, argbBg: string, totalCols: number) {
        ws.mergeCells(row.number, 1, row.number, totalCols)
        const cell = row.getCell(1)
        cell.font      = { bold: true, size: 11, color: { argb: ARGB_WHITE } }
        cell.fill      = bgFill(argbBg)
        cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 }
        row.height     = 18
      }

      function addSection(tipo: "clientes"|"uds"|"cajas9l") {
        const hasTotal    = tipo !== "clientes"
        const totalCols   = hasTotal ? TOTAL_COLS_WITH_TOT : TOTAL_COLS_NO_TOT
        const sectionLabel = tipo === "clientes" ? "CLIENTES ACTIVOS" : seccionVentaLabel

        // ── Section header (orange, merged across all cols) ────────────────
        const hRow = ws.addRow([sectionLabel])
        styleHeaderRow(hRow, ARGB_ORANGE, totalCols)

        // ── Month column headers (slate bg, centered) ──────────────────────
        const mhRow = ws.addRow([
          "Período", ...CAL_MONTHS.map(m => MES_SHORT_LOCAL[m]),
          ...(hasTotal ? ["Total"] : []),
        ])
        mhRow.eachCell((cell, colIdx) => {
          cell.font      = { bold: true, color: { argb: ARGB_DARK } }
          cell.fill      = bgFill(ARGB_SLATE)
          cell.alignment = { horizontal: colIdx === 1 ? "left" : "center", vertical: "middle" }
        })
        mhRow.height = 16

        // ── Data rows (totals) ─────────────────────────────────────────────
        for (let ai = 0; ai < anhosList.length; ai++) {
          const yr   = anhosList[ai]
          const vals = CAL_MONTHS.map(m => getVal(total, yr, m, tipo))
          const tot  = rowSumLocal(total, yr, tipo)

          const dataRow = ws.addRow([
            `FY${String(yr).slice(-2)}`,
            ...vals.map(v => v ?? "—"),
            ...(hasTotal ? [tot] : []),
          ])
          dataRow.getCell(1).font = { bold: true, color: { argb: ARGB_DARK } }
          vals.forEach((v, i) => {
            const cell = dataRow.getCell(i + 2)
            if (v !== null) {
              cell.numFmt    = "#,##0"
              cell.alignment = { horizontal: "right", vertical: "middle" }
            } else {
              cell.alignment = { horizontal: "center", vertical: "middle" }
            }
          })
          if (hasTotal) {
            const totCell      = dataRow.getCell(CAL_MONTHS.length + 2)
            totCell.font       = { bold: true, color: { argb: ARGB_DARK } }
            totCell.fill       = bgFill(ARGB_SLATE)
            totCell.numFmt     = "#,##0"
            totCell.alignment  = { horizontal: "right", vertical: "middle" }
          }

          if (ai > 0) {
            const prevYr  = anhosList[ai - 1]
            const varRow  = ws.addRow([
              "Var",
              ...CAL_MONTHS.map(m => fmtVarStr(varPctLocal(getVal(total, yr, m, tipo), getVal(total, prevYr, m, tipo)))),
              ...(hasTotal ? [fmtVarStr(varPctLocal(rowSumLocal(total, yr, tipo), rowSumLocal(total, prevYr, tipo)))] : []),
            ])
            varRow.getCell(1).font = { italic: true, color: { argb: ARGB_GREY } }
            CAL_MONTHS.forEach((m, i) => {
              const pct  = varPctLocal(getVal(total, yr, m, tipo), getVal(total, prevYr, m, tipo))
              const cell = varRow.getCell(i + 2)
              cell.font      = { italic: true, color: { argb: varArgb(pct) } }
              cell.alignment = { horizontal: "center", vertical: "middle" }
            })
            if (hasTotal) {
              const pctTot    = varPctLocal(rowSumLocal(total, yr, tipo), rowSumLocal(total, prevYr, tipo))
              const totVarCell = varRow.getCell(CAL_MONTHS.length + 2)
              totVarCell.font      = { bold: true, italic: true, color: { argb: varArgb(pctTot) } }
              totVarCell.fill      = bgFill(ARGB_SLATE)
              totVarCell.alignment = { horizontal: "center", vertical: "middle" }
            }
          }
        }

        // ── Canal sub-sections ─────────────────────────────────────────────
        for (const c of canalesList) {
          const cHRow = ws.addRow([c])
          styleHeaderRow(cHRow, ARGB_BLUE, totalCols)

          for (let ai = 0; ai < anhosList.length; ai++) {
            const yr   = anhosList[ai]
            const vals = CAL_MONTHS.map(m => getCVal(canalData, c, yr, m, tipo))
            const tot  = rowSumCanal(canalData, c, yr, tipo)

            const dataRow = ws.addRow([
              `FY${String(yr).slice(-2)}`,
              ...vals.map(v => v ?? "—"),
              ...(hasTotal ? [tot] : []),
            ])
            dataRow.getCell(1).font = { bold: true, color: { argb: ARGB_DARK } }
            vals.forEach((v, i) => {
              const cell = dataRow.getCell(i + 2)
              if (v !== null) {
                cell.numFmt    = "#,##0"
                cell.alignment = { horizontal: "right", vertical: "middle" }
              } else {
                cell.alignment = { horizontal: "center", vertical: "middle" }
              }
            })
            if (hasTotal) {
              const totCell     = dataRow.getCell(CAL_MONTHS.length + 2)
              totCell.font      = { bold: true, color: { argb: ARGB_DARK } }
              totCell.fill      = bgFill(ARGB_SLATE)
              totCell.numFmt    = "#,##0"
              totCell.alignment = { horizontal: "right", vertical: "middle" }
            }

            if (ai > 0) {
              const prevYr = anhosList[ai - 1]
              const varRow = ws.addRow([
                "Var",
                ...CAL_MONTHS.map(m => fmtVarStr(varPctLocal(getCVal(canalData, c, yr, m, tipo), getCVal(canalData, c, prevYr, m, tipo)))),
                ...(hasTotal ? [fmtVarStr(varPctLocal(rowSumCanal(canalData, c, yr, tipo), rowSumCanal(canalData, c, prevYr, tipo)))] : []),
              ])
              varRow.getCell(1).font = { italic: true, color: { argb: ARGB_GREY } }
              CAL_MONTHS.forEach((m, i) => {
                const pct  = varPctLocal(getCVal(canalData, c, yr, m, tipo), getCVal(canalData, c, prevYr, m, tipo))
                const cell = varRow.getCell(i + 2)
                cell.font      = { italic: true, color: { argb: varArgb(pct) } }
                cell.alignment = { horizontal: "center", vertical: "middle" }
              })
              if (hasTotal) {
                const pctTot     = varPctLocal(rowSumCanal(canalData, c, yr, tipo), rowSumCanal(canalData, c, prevYr, tipo))
                const totVarCell = varRow.getCell(CAL_MONTHS.length + 2)
                totVarCell.font      = { bold: true, italic: true, color: { argb: varArgb(pctTot) } }
                totVarCell.fill      = bgFill(ARGB_SLATE)
                totVarCell.alignment = { horizontal: "center", vertical: "middle" }
              }
            }
          }
        }

        ws.addRow([]) // spacer between sections
      }

      addSection("clientes")
      addSection(tipoVenta)
    }

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `comportamiento_productos_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const g1Data = useMemo(() =>
    dataG1.map(d => ({
      ...d,
      _label: d.dimension.length > 14 ? d.dimension.slice(0, 14) + "…" : d.dimension,
    })),
    [dataG1]
  )
  const g2Data = useMemo(() =>
    dataG2.map(d => ({
      ...d,
      _label: d.nombre.length > 16 ? d.nombre.slice(0, 16) + "…" : d.nombre,
    })),
    [dataG2]
  )

  const vendedorOptsFiltrados = useMemo(
    () => vendedorOpts.filter(v => !vendedorSearch || v.toLowerCase().includes(vendedorSearch.toLowerCase())),
    [vendedorOpts, vendedorSearch]
  )

  function toggleProducto(p: ProductoOption) {
    setProductosSeleccionados(prev => {
      const exists = prev.find(x => x.codigo === p.codigo)
      return exists ? prev.filter(x => x.codigo !== p.codigo) : [...prev, p]
    })
  }

  const anhos        = [...new Set(periodos.map(p => p.anho))].sort((a, b) => b - a)
  const mesesDelAnho = periodos.filter(p => p.anho === anho)
  const selectCls    = "text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 cursor-pointer"
  const hayFiltro    = !!(marca || productosSeleccionados.length > 0)

  const tablaProductoNombre = productosSeleccionados.find(p => p.codigo === tablaProductoCodigo)?.nombre ?? ""
  const tablaProductoEsLicor = productosSeleccionados.find(p => p.codigo === tablaProductoCodigo)?.es_licor ?? false

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Comportamiento Productos</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {MESES[mes]} {anho}
            {marca ? ` · ${marca}` : ""}
          </p>
        </div>

        {/* ── Filtros ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="flex flex-wrap items-end gap-4">

            {/* Regional */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Regional</label>
              {isAdmin ? (
                <select value={regional} onChange={(e: ChangeEvent<HTMLSelectElement>) => setRegional(e.target.value)} className={selectCls}>
                  {REGIONALES.map(r => <option key={r}>{r}</option>)}
                </select>
              ) : (
                <span className={`text-sm font-semibold px-3 py-2 rounded-lg border ${REGIONAL_CONFIG[regional]?.badge ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                  {regional}
                </span>
              )}
            </div>

            {/* Canal */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Canal</label>
              {(isAdmin || isGerenteRegional) ? (
                <select value={canal} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCanal(e.target.value)} className={selectCls}>
                  <option value="Todos">Todos</option>
                  {canales.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <span className="text-sm font-semibold px-3 py-2 rounded-lg border bg-slate-100 text-slate-600 border-slate-200">
                  {canal && canal !== "Todos" ? canal : "Todos"}
                </span>
              )}
            </div>

            {/* Vendedor combobox */}
            <div className="flex flex-col gap-1" ref={vendedorRef}>
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Vendedor</label>
              <div className="relative">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm cursor-pointer min-w-44 transition-colors ${
                    vendedorComboOpen ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() => { setVendedorComboOpen(o => !o); setVendedorSearch("") }}
                >
                  <span className="flex-1 truncate text-slate-700">{vendedorQ || "Todos"}</span>
                  {vendedorQ ? (
                    <button className="text-slate-400 hover:text-slate-600"
                      onMouseDown={e => { e.stopPropagation(); setVendedorQ(""); setVendedorComboOpen(false) }}>
                      <X size={14} />
                    </button>
                  ) : (
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${vendedorComboOpen ? "rotate-180" : ""}`} />
                  )}
                </div>
                {vendedorComboOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 w-64 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1.5">
                        <Search size={13} className="text-slate-400 shrink-0" />
                        <input autoFocus type="text" placeholder="Buscar vendedor…" value={vendedorSearch}
                          onChange={e => setVendedorSearch(e.target.value)}
                          className="flex-1 outline-none bg-transparent text-xs text-slate-700 placeholder-slate-400" />
                      </div>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 text-slate-500 italic"
                        onMouseDown={() => { setVendedorQ(""); setVendedorComboOpen(false) }}>
                        Todos
                      </button>
                      {vendedorOptsFiltrados.map(v => (
                        <button key={v}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${
                            vendedorQ === v ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-700"
                          }`}
                          onMouseDown={() => { setVendedorQ(v); setVendedorComboOpen(false) }}>{v}
                        </button>
                      ))}
                      {vendedorOptsFiltrados.length === 0 && (
                        <p className="text-xs text-slate-400 px-4 py-3">Sin resultados</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Gestión */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
              <select value={anho} onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))} className={selectCls}>
                {anhos.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Mes */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
              <select value={mes} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(Number(e.target.value))} className={selectCls}>
                {mesesDelAnho.map(p => (
                  <option key={p.mes_numero} value={p.mes_numero}>{MESES[p.mes_numero]}</option>
                ))}
              </select>
            </div>

            {/* Marca */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Marca</label>
              <select value={marca} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMarca(e.target.value)} className={selectCls}>
                <option value="">Todas</option>
                {marcaOpts.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Producto multi-select combobox */}
            <div className="flex flex-col gap-1 flex-1 min-w-64" ref={productoRef}>
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                Producto
                {productosSeleccionados.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded-full text-[9px] font-bold">
                    {productosSeleccionados.length}
                  </span>
                )}
              </label>
              <div className="relative">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm cursor-text transition-colors ${
                    productoComboOpen ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() => setProductoComboOpen(true)}
                >
                  <Search size={14} className="text-slate-400 shrink-0" />
                  <input type="text"
                    placeholder={productosSeleccionados.length ? `${productosSeleccionados.length} seleccionado(s)` : "Buscar producto…"}
                    value={productoSearch}
                    onChange={e => { setProductoSearch(e.target.value); setProductoComboOpen(true) }}
                    onFocus={() => setProductoComboOpen(true)}
                    className="flex-1 outline-none bg-transparent text-slate-700 placeholder-slate-400 text-sm min-w-0" />
                  {productosSeleccionados.length > 0 && (
                    <button className="text-slate-400 hover:text-slate-600 shrink-0"
                      onMouseDown={e => { e.stopPropagation(); setProductosSeleccionados([]); setProductoSearch("") }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                {productoComboOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 w-full min-w-80 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    {productosSeleccionados.length > 0 && (
                      <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {productosSeleccionados.map(p => (
                          <span key={p.codigo} className="flex items-center gap-1 bg-brand-100 text-brand-700 text-xs px-2 py-1 rounded-full font-medium">
                            {p.nombre.length > 22 ? p.nombre.slice(0, 22) + "…" : p.nombre}
                            <button className="hover:text-brand-900"
                              onMouseDown={e => { e.stopPropagation(); toggleProducto(p) }}>
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="max-h-56 overflow-y-auto">
                      {loadingProductos ? (
                        <div className="py-4 flex justify-center">
                          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : productosOpts.length === 0 ? (
                        <p className="text-xs text-slate-400 px-4 py-3">
                          {marca || productoSearch.length >= 2 ? "Sin resultados" : "Selecciona una marca o escribe para buscar"}
                        </p>
                      ) : productosOpts.map(p => {
                          const sel = !!productosSeleccionados.find(x => x.codigo === p.codigo)
                          return (
                            <button key={p.codigo}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-start gap-2.5 ${sel ? "bg-brand-50" : "hover:bg-slate-50"}`}
                              onMouseDown={e => { e.preventDefault(); toggleProducto(p) }}>
                              <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-brand-600 border-brand-600" : "border-slate-300"}`}>
                                {sel && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                              </span>
                              <span className="min-w-0">
                                <span className={`block text-xs font-medium ${sel ? "text-brand-700" : "text-slate-700"}`}>{p.nombre}</span>
                                <span className="block text-[10px] text-slate-400">{p.codigo} · {p.marca}{p.es_licor ? " · Licor" : ""}</span>
                              </span>
                            </button>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Toggle Bs / Uds / Cajas 9L */}
            <MetricaToggle value={metrica} onChange={setMetrica} tieneAlgunLicor={tieneAlgunLicor} />

          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </div>
        )}

        {/* ── Gráfico 1 ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-800">
              {g1Modo === "vendedor"
                ? `${MESES[mes]} — ventas por vendedor`
                : `${MESES[mes]} — ventas por canal`}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {regional}{canal !== "Todos" ? ` · ${canal}` : ""} · {labelMetrica(metrica)}
            </p>
          </div>
          {!hayFiltro ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm text-center px-6">
              Selecciona una marca o producto para ver datos
            </div>
          ) : loadingG1 ? <Spinner /> : g1Data.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Sin datos para el período</div>
          ) : (
            <ResponsiveContainer width="100%" height={300} minWidth={0}>
              <BarChart data={g1Data} barCategoryGap="25%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="_label" tick={{ fontSize: 11 }} interval={0} angle={g1Data.length > 6 ? -35 : 0} textAnchor={g1Data.length > 6 ? "end" : "middle"} height={g1Data.length > 6 ? 60 : 30} />
                <YAxis tickFormatter={v => fmtMetrica(v, metrica)} tick={{ fontSize: 11 }} width={85} />
                <Tooltip content={<CustomTooltip metrica={metrica} />}
                  formatter={(v) => [fmtMetrica(Number(v), metrica), labelMetrica(metrica)]}
                  labelFormatter={(_: unknown, payload: readonly { payload?: DatoG1 & { _label: string } }[]) =>
                    payload?.[0]?.payload?.dimension ?? ""
                  } />
                <Bar dataKey={metrica} name={labelMetrica(metrica)} radius={[4, 4, 0, 0]}>
                  {g1Data.map((_, i) => <Cell key={i} fill={CANAL_PAL[i % CANAL_PAL.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Gráfico 2 ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-800">Ventas por producto</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {marca || "Sin marca seleccionada"} · {MESES[mes]} {anho} · {labelMetrica(metrica)}
            </p>
          </div>
          {!hayFiltro ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm text-center px-6">
              Selecciona una marca o producto para ver datos
            </div>
          ) : loadingG2 ? <Spinner /> : g2Data.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Sin datos para el período</div>
          ) : (
            <ResponsiveContainer width="100%" height={300} minWidth={0}>
              <BarChart data={g2Data} barCategoryGap="25%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="_label" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={65} />
                <YAxis tickFormatter={v => fmtMetrica(v, metrica)} tick={{ fontSize: 11 }} width={85} />
                <Tooltip content={<CustomTooltip metrica={metrica} />}
                  formatter={(v) => [fmtMetrica(Number(v), metrica), labelMetrica(metrica)]}
                  labelFormatter={(_: unknown, payload: readonly { payload?: DatoG2 & { _label: string } }[]) =>
                    payload?.[0]?.payload?.nombre ?? ""
                  } />
                <Bar dataKey={metrica} name={labelMetrica(metrica)} radius={[4, 4, 0, 0]}>
                  {g2Data.map((_, i) => <Cell key={i} fill={CANAL_PAL[i % CANAL_PAL.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Tablas históricas — siempre visibles debajo de los gráficos ──── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Header + tabs selector de producto */}
          <div className="px-5 pt-5 pb-0 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Historial por Producto</h2>
              {productosSeleccionados.length > 0 && (
                <button
                  onClick={() => void downloadXLSX()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                >
                  <Download size={13} />
                  Descargar XLSX
                </button>
              )}
            </div>
            {productosSeleccionados.length > 0 ? (
              <div className="flex gap-0.5 overflow-x-auto">
                {productosSeleccionados.map(p => (
                  <button key={p.codigo} onClick={() => setTablaProductoCodigo(p.codigo)}
                    className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors shrink-0 ${
                      tablaProductoCodigo === p.codigo
                        ? "border-brand-600 text-brand-700 bg-brand-50"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    }`}>
                    {p.nombre.length > 30 ? p.nombre.slice(0, 30) + "…" : p.nombre}
                    {p.es_licor && <span className="ml-1.5 text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">Lic</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="pb-4 text-xs text-slate-400">
                Selecciona productos en el filtro para ver el historial
              </div>
            )}
          </div>

          <TablasHistoricas
            tablaTotal={tablaTotal}
            tablaCanal={tablaCanal}
            productoNombre={tablaProductoNombre}
            loading={loadingTabla}
            noSeleccion={productosSeleccionados.length === 0}
            esLicor={tablaProductoEsLicor}
          />

        </div>

      </div>
    </DashboardLayout>
  )
}
