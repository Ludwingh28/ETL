import { useEffect, useState, useCallback, useMemo, type ChangeEvent } from "react";
import {
  Search, RefreshCw, AlertCircle, Package,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface VendedorRow {
  vendedor_sk:    number;
  vendedor:       string;
  alimentos:      number; alimentos_cant: number; alimentos_pct: number | null;
  apego:          number; apego_cant:     number; apego_pct:     number | null;
  licores:        number; licores_cant:   number; licores_pct:   number | null;
  hpc:            number; hpc_cant:       number; hpc_pct:       number | null;
  total:          number; total_cant:     number; total_pct:     number | null;
}

interface ApiData {
  regional:    string;
  canal:       string;
  fecha_corte: string | null;
  vendedores:  VendedorRow[];
}

interface SkuRow {
  codigo:     string;
  producto:   string;
  cantidad:   number;
  venta_neta: number;
}

interface SubgrupoRow {
  subgrupo:    string;
  cantidad:    number;
  venta_neta:  number;
  presupuesto: number;
  porcentaje:  number | null;
}

type Regional  = "Nacional" | "Santa Cruz" | "Cochabamba" | "La Paz";
type CatKey    = "alimentos" | "apego" | "licores" | "hpc" | "total";

const REGIONALES: Regional[] = ["Nacional", "Santa Cruz", "Cochabamba", "La Paz"];

const REGIONAL_KEY: Record<Regional, string> = {
  Nacional:     "nacional",
  "Santa Cruz": "santa_cruz",
  Cochabamba:   "cochabamba",
  "La Paz":     "la_paz",
};

const REGIONAL_CONFIG: Record<Regional, { badge: string }> = {
  Nacional:     { badge: "bg-brand-100 text-brand-700 border-brand-200" },
  "Santa Cruz": { badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Cochabamba:   { badge: "bg-violet-100 text-violet-700 border-violet-200" },
  "La Paz":     { badge: "bg-amber-100 text-amber-700 border-amber-200" },
};

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

interface Periodo { anho: number; mes_numero: number; }

interface CatCfg {
  label:       string;
  cantKey:     keyof VendedorRow;
  bsKey:       keyof VendedorRow;
  pctKey:      keyof VendedorRow;
  color:       string;
  activeClass: string;
  barColor:    string;
  barColorSel: string;
}

const CAT_CFG: Record<CatKey, CatCfg> = {
  total:     { label: "Total",                cantKey: "total_cant",     bsKey: "total",     pctKey: "total_pct",     color: "text-slate-700", activeClass: "bg-slate-700 text-white",  barColor: "#3b82f6", barColorSel: "#1d4ed8" },
  alimentos: { label: "Alimentos",            cantKey: "alimentos_cant", bsKey: "alimentos", pctKey: "alimentos_pct", color: "text-green-700", activeClass: "bg-green-600 text-white",  barColor: "#22c55e", barColorSel: "#15803d" },
  apego:     { label: "Apego",                cantKey: "apego_cant",     bsKey: "apego",     pctKey: "apego_pct",     color: "text-pink-700",  activeClass: "bg-pink-600 text-white",   barColor: "#ec4899", barColorSel: "#be185d" },
  licores:   { label: "Licores",              cantKey: "licores_cant",   bsKey: "licores",   pctKey: "licores_pct",   color: "text-rose-700",  activeClass: "bg-rose-600 text-white",   barColor: "#f43f5e", barColorSel: "#be123c" },
  hpc:       { label: "Home & Personal Care", cantKey: "hpc_cant",       bsKey: "hpc",       pctKey: "hpc_pct",       color: "text-sky-700",   activeClass: "bg-sky-600 text-white",    barColor: "#0ea5e9", barColorSel: "#0369a1" },
};

// Cargos que pueden ver y cambiar los filtros de regional/canal
const ADMIN_CARGOS = new Set([
  "Administrador de Sistema",
  "Subadministrador de Sistemas",
  "Gerente General",
  "Gerente de Ventas",
  "Analista de Datos",
]);
const isAdminUser = (cargo?: string, is_staff?: boolean) =>
  is_staff === true || ADMIN_CARGOS.has(cargo ?? "");

// ─── Formatos ─────────────────────────────────────────────────────────────────

const CUR   = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 });
const NUM   = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const fmt    = (n: number) => CUR.format(Math.round(n));
const fmtN   = (n: number | null | undefined) => n != null ? NUM.format(Math.round(n)) : "—";
const fmtAbbr = (n: number) => {
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return NUM.format(n);
};
const fmtPct = (n: number | null | undefined) => n != null ? `${n.toFixed(1)}%` : "—";

function pctColor(pct: number | null | undefined) {
  if (pct == null) return "text-slate-300";
  if (pct >= 100)  return "text-emerald-600";
  if (pct >= 80)   return "text-amber-500";
  return "text-red-500";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardUnidadesSupervisores() {
  const { apiFetch, user } = useAuth();
  const now = new Date();

  const isAdmin  = isAdminUser(user?.cargo, user?.is_staff);
  const isSuperv = !isAdmin && (user?.cargo?.toLowerCase().includes("supervisor") ?? false);

  // Filtros (solo admin los ve)
  const [regional,  setRegional]  = useState<Regional>("Santa Cruz");
  const [canal,     setCanal]     = useState<string>("");
  const [canalList, setCanalList] = useState<string[]>([]);
  const [anho,      setAnho]      = useState(now.getFullYear());
  const [mes,       setMes]       = useState(now.getMonth() + 1);

  // Segmentador categoría
  const [catKey, setCatKey] = useState<CatKey>("alimentos");

  // Selección de vendedor
  const [selVendedor, setSelVendedor] = useState<VendedorRow | null>(null);
  const [vendSearch,  setVendSearch]  = useState("");

  // Selección de SKU (para resaltar en gráfico)
  const [selSkuCode, setSelSkuCode] = useState<string | null>(null);
  const [skuSearch,  setSkuSearch]  = useState("");

  // Subgrupos
  const [selectedSubgrupo, setSelectedSubgrupo] = useState<string | null>(null);
  const [subgrupos,        setSubgrupos]        = useState<SubgrupoRow[]>([]);
  const [loadingSubgrupo,  setLoadingSubgrupo]  = useState(false);

  // Data
  const [data,      setData]      = useState<ApiData | null>(null);
  const [skus,      setSkus]      = useState<SkuRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadingSku,setLoadingSku]= useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // regional/canal efectivos (para la query SKU, supervisores usan lo que devuelve la API)
  const [effectiveRegional, setEffectiveRegional] = useState("santa_cruz");
  const [effectiveCanal,    setEffectiveCanal]    = useState("");

  const [periodos, setPeriodos] = useState<Periodo[]>([]);

  // ── Fetch periodos ─────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch<{ success: boolean; data: Periodo[] }>("/dashboard/nacional/periodos/")
      .then(r => { if (r.success) setPeriodos(r.data); })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Canales ───────────────────────────────────────────────────────────────
  const fetchCanales = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const j = await apiFetch<{ success: boolean; data: Array<{ canal: string }> }>(
        `/dashboard/canales/kpis/?regional=${REGIONAL_KEY[regional]}&anho=${anho}&mes=${mes}`
      );
      if (j.success) { setCanalList(j.data.map((c) => c.canal).filter(Boolean)); setCanal(""); }
    } catch { setCanalList([]); }
  }, [isAdmin, apiFetch, regional, anho, mes]);

  useEffect(() => { void fetchCanales(); }, [fetchCanales]);

  // ── Vendedores ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true); setError(null); setSelVendedor(null); setSkus([]); setVendSearch("");
    try {
      let url = `/dashboard/supervisores/vendedores/?anho=${anho}&mes=${mes}`;
      if (isAdmin) {
        url += `&regional=${REGIONAL_KEY[regional]}`;
        if (canal) url += `&canal=${encodeURIComponent(canal)}`;
      }
      const j = await apiFetch<ApiData & { success: boolean }>(url);
      if (j.success) {
        setData(j);
        setEffectiveRegional(j.regional);
        setEffectiveCanal(j.canal);
      } else {
        setError("Sin acceso o sin datos.");
      }
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [apiFetch, isAdmin, regional, canal, anho, mes]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // ── Subgrupos ─────────────────────────────────────────────────────────────
  const fetchSubgrupos = useCallback(async () => {
    if (!effectiveRegional) return;
    setLoadingSubgrupo(true); setSelectedSubgrupo(null);
    try {
      const catLabel = catKey !== "total" ? CAT_CFG[catKey].label : "";
      let url = `/dashboard/unidades/por-subgrupo/?regional=${effectiveRegional}&anho=${anho}&mes=${mes}`;
      if (effectiveCanal) url += `&canal=${encodeURIComponent(effectiveCanal)}`;
      if (catLabel) url += `&categoria=${encodeURIComponent(catLabel)}`;
      const j = await apiFetch<{ success: boolean; data: SubgrupoRow[] }>(url);
      if (j.success) setSubgrupos(j.data); else setSubgrupos([]);
    } catch { setSubgrupos([]); }
    finally { setLoadingSubgrupo(false); }
  }, [apiFetch, effectiveRegional, effectiveCanal, catKey, anho, mes]);

  useEffect(() => { void fetchSubgrupos(); }, [fetchSubgrupos]);

  // ── SKUs por vendedor ────────────────────────────────────────────────────
  const fetchSkus = useCallback(async () => {
    if (!selVendedor) { setSkus([]); return; }
    setLoadingSku(true); setSelSkuCode(null); setSkuSearch("");
    try {
      let url = `/dashboard/unidades/vendedor-sku/?regional=${effectiveRegional}&anho=${anho}&mes=${mes}`;
      url += `&vendedor_sk=${selVendedor.vendedor_sk}`;
      if (effectiveCanal) url += `&canal=${encodeURIComponent(effectiveCanal)}`;
      if (catKey !== "total") url += `&categoria=${encodeURIComponent(CAT_CFG[catKey].label)}`;
      if (selectedSubgrupo)  url += `&subgrupo=${encodeURIComponent(selectedSubgrupo)}`;
      const j = await apiFetch<{ success: boolean; data: SkuRow[] }>(url);
      if (j.success) setSkus(j.data); else setSkus([]);
    } catch { setSkus([]); }
    finally { setLoadingSku(false); }
  }, [apiFetch, selVendedor, effectiveRegional, effectiveCanal, catKey, selectedSubgrupo, anho, mes]);

  useEffect(() => { void fetchSkus(); }, [fetchSkus]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const cfg = CAT_CFG[catKey];

  const filteredVendedores = useMemo(() => {
    if (!data) return [];
    const q = vendSearch.trim().toLowerCase();
    const rows = [...data.vendedores].sort((a, b) =>
      (b[cfg.cantKey] as number) - (a[cfg.cantKey] as number)
    );
    return q ? rows.filter((r) => r.vendedor.toLowerCase().includes(q)) : rows;
  }, [data, cfg, vendSearch]);

  const filteredSkus = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    return q ? skus.filter((s) => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)) : skus;
  }, [skus, skuSearch]);

  const skuChartData = useMemo(
    () => filteredSkus.map((s) => ({ name: s.producto, codigo: s.codigo, value: s.venta_neta })),
    [filteredSkus]
  );

  const anhos = [...new Set(periodos.map(p => p.anho))].sort((a, b) => b - a);
  const mesesDisponibles = periodos.filter(p => p.anho === anho);

  // Nota: si el cargo no es admin ni supervisor, se trata como supervisor
  // (sin filtros manuales, datos auto-scoped por perfil desde el backend)
  const isKnownRole = isAdmin || isSuperv;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {/* ── Header + Filtros ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Unidades por Vendedor — SKU</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Qué SKU vendió cada vendedor por categoría ·&nbsp;
            <span className="font-semibold text-slate-700">{MESES[mes]} {anho}</span>
            {data?.fecha_corte && <span className="text-slate-400"> · corte {data.fecha_corte}</span>}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Canal</label>
              <select value={canal} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCanal(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
                <option value="">Todos</option>
                {canalList.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
              <select value={anho} onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
                {anhos.length > 0 ? anhos.map(a => <option key={a} value={a}>{a}</option>) : [2026, 2025, 2024].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
              <select value={mes} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(Number(e.target.value))}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
                {mesesDisponibles.length > 0 ? mesesDisponibles.map(p => <option key={p.mes_numero} value={p.mes_numero}>{MESES[p.mes_numero]}</option>) : MESES.slice(1).map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
              </select>
            </div>
            <button onClick={fetchData} disabled={loading}
              className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-30">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Actualizar
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          <AlertCircle size={16} className="shrink-0" />{error}
        </div>
      )}

      {/* ── Categoría + Regional ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mr-1">Categoría</span>
          {(Object.keys(CAT_CFG) as CatKey[]).map((k) => (
            <button key={k} onClick={() => setCatKey(k)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                catKey === k
                  ? CAT_CFG[k].activeClass + " border-transparent shadow-sm"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}>{CAT_CFG[k].label}</button>
          ))}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mr-1">Regional</span>
            {REGIONALES.map((r) => (
              <button key={r} onClick={() => setRegional(r)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                  regional === r ? `${REGIONAL_CONFIG[r].badge} shadow-sm` : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}>{r}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── 60/40: Sub-categorías + Chart 1 ──────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4 mb-4 items-start">

        {/* Izquierda 60%: cards planas de subgrupo */}
        <div className="col-span-5 xl:col-span-3 card">
          <h2 className="font-semibold text-slate-700 text-sm mb-1">Sub-categorías</h2>
          <p className="text-[11px] text-slate-400 mb-3">{cfg.label} · {MESES[mes]} {anho}</p>
          {loadingSubgrupo ? (
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-9 bg-slate-50 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : subgrupos.length === 0 ? (
            <p className="text-slate-400 text-sm">Sin datos para {cfg.label}.</p>
          ) : (
            <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent space-y-1.5 pr-1" style={{ maxHeight: 400 }}>
              {subgrupos.map((sg) => {
                const isSel = selectedSubgrupo === sg.subgrupo;
                const pct   = sg.porcentaje;
                return (
                  <button key={sg.subgrupo}
                    onClick={() => setSelectedSubgrupo(isSel ? null : sg.subgrupo)}
                    className={`w-full flex items-center px-3 py-2 rounded-lg border text-xs transition-all ${
                      isSel
                        ? "bg-brand-50 border-brand-300 ring-1 ring-brand-400"
                        : "bg-white border-slate-200 hover:border-brand-300 hover:bg-slate-50"
                    }`}>
                    <span className={`font-semibold flex-1 text-left truncate ${isSel ? "text-brand-700" : "text-slate-700"}`}
                      title={sg.subgrupo}>{sg.subgrupo}</span>
                    <span className="text-slate-400 shrink-0 ml-3">{fmtN(sg.cantidad)} uds.</span>
                    <span className={`font-bold shrink-0 ml-3 w-14 text-right ${
                      pct == null ? "text-slate-300" : pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-500" : "text-red-500"
                    }`}>{fmtPct(pct)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Derecha 40%: Chart 1 avance vs ppto */}
        <div className="col-span-5 xl:col-span-2 card">
          <h2 className="font-semibold text-slate-700 text-sm mb-1">Avance vs Presupuesto</h2>
          <p className="text-[11px] text-slate-400 mb-4">{cfg.label} · {MESES[mes]} {anho}</p>
          {loadingSubgrupo ? (
            <div className="h-48 bg-slate-50 animate-pulse rounded-xl" />
          ) : subgrupos.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
          ) : (
            <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent rounded-xl border border-slate-100" style={{ maxHeight: 400 }}>
              <div style={{ height: Math.max(180, subgrupos.length * 52) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={subgrupos} margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtAbbr} />
                    <YAxis dataKey="subgrupo" type="category" tick={{ fontSize: 10, fontWeight: 700 }} width={100} />
                    <Tooltip content={(props: any) => {
                      if (!props.active || !props.payload?.length) return null;
                      const row: SubgrupoRow = props.payload[0]?.payload;
                      return (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm max-w-64">
                          <p className="font-bold text-slate-800 mb-1">{row.subgrupo}</p>
                          <div className="flex gap-4 flex-wrap text-xs">
                            <div><p className="text-slate-400">Unidades</p><p className="font-semibold text-blue-600">{fmtN(row.cantidad)}</p></div>
                            <div><p className="text-slate-400">Venta Neta</p><p className="font-semibold text-slate-700">{fmt(row.venta_neta)}</p></div>
                            {row.presupuesto > 0 && <div><p className="text-slate-400">Presupuesto</p><p className="font-semibold text-emerald-600">{fmt(row.presupuesto)}</p></div>}
                            {row.porcentaje != null && <div><p className="text-slate-400">Cumpl.</p><p className={`font-bold ${row.porcentaje >= 100 ? "text-emerald-600" : row.porcentaje >= 80 ? "text-amber-500" : "text-red-500"}`}>{fmtPct(row.porcentaje)}</p></div>}
                          </div>
                        </div>
                      );
                    }} />
                    <Bar dataKey="venta_neta" name="Venta Neta" radius={[0, 3, 3, 0]} barSize={9}
                      label={{ position: "right", fontSize: 9, fill: "#94a3b8", formatter: ((_v: unknown, _e: unknown, idx: number) => fmtPct(subgrupos[idx]?.porcentaje)) as any }}>
                      {subgrupos.map((entry) => (
                        <Cell key={entry.subgrupo} fill={selectedSubgrupo === entry.subgrupo ? cfg.barColorSel : cfg.barColor} />
                      ))}
                    </Bar>
                    <Bar dataKey="presupuesto" name="Presupuesto" radius={[0, 3, 3, 0]} barSize={9}>
                      {subgrupos.map((entry) => (
                        <Cell key={entry.subgrupo} fill={selectedSubgrupo === entry.subgrupo ? "#15803d" : "#22c55e"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabla maestra: vendedores × categorías ───────────────────────── */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-slate-700 text-sm">Tabla de Vendedores</h2>
            <p className="text-[11px] text-slate-400">
              {MESES[mes]} {anho}
              {selectedSubgrupo && <span> · filtrado por <span className="font-semibold text-slate-600">{selectedSubgrupo}</span></span>}
              {selVendedor && <span> · seleccionado: <span className={`font-semibold ${cfg.color}`}>{selVendedor.vendedor}</span></span>}
            </p>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={vendSearch}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setVendSearch(e.target.value)}
              placeholder="Buscar vendedor…"
              className="text-xs pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300 w-44" />
          </div>
        </div>

        {loading ? (
          <div className="space-y-1.5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 bg-slate-50 animate-pulse rounded" />)}</div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent" style={{ maxHeight: 440 }}>
            <table className="w-full text-xs min-w-160">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                <tr className="text-slate-500">
                  <th className="text-left py-2 pr-4 font-semibold w-48">Vendedor</th>
                  <th className="text-right py-2 px-3 font-semibold text-green-700">Alimentos</th>
                  <th className="text-right py-2 px-3 font-semibold text-green-600 text-[10px]">Cumpl.</th>
                  <th className="text-right py-2 px-3 font-semibold text-pink-700">Apego</th>
                  <th className="text-right py-2 px-3 font-semibold text-pink-600 text-[10px]">Cumpl.</th>
                  <th className="text-right py-2 px-3 font-semibold text-rose-700">Licores</th>
                  <th className="text-right py-2 px-3 font-semibold text-rose-600 text-[10px]">Cumpl.</th>
                  <th className="text-right py-2 px-3 font-semibold text-sky-700">HPC</th>
                  <th className="text-right py-2 px-3 font-semibold text-sky-600 text-[10px]">Cumpl.</th>
                  <th className="text-right py-2 pl-3 font-semibold text-slate-700">Total uds.</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Venta Bs</th>
                  <th className="text-right py-2 pl-1 font-semibold text-slate-500 text-[10px]">Cumpl.</th>
                </tr>
              </thead>
              <tbody>
                {filteredVendedores.map((vend) => {
                  const isSel = selVendedor?.vendedor_sk === vend.vendedor_sk;
                  return (
                    <tr key={vend.vendedor_sk}
                      onClick={() => setSelVendedor(isSel ? null : vend)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors ${
                        isSel ? "bg-brand-50 ring-1 ring-inset ring-brand-300" : "hover:bg-slate-50"
                      }`}>
                      <td className={`py-2 pr-4 font-semibold truncate max-w-48 ${isSel ? "text-brand-700" : "text-slate-700"}`}
                        title={vend.vendedor}>{vend.vendedor}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-700">{fmtN(vend.alimentos_cant)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums text-[10px] font-semibold ${pctColor(vend.alimentos_pct)}`}>{fmtPct(vend.alimentos_pct)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-700">{fmtN(vend.apego_cant)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums text-[10px] font-semibold ${pctColor(vend.apego_pct)}`}>{fmtPct(vend.apego_pct)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-700">{fmtN(vend.licores_cant)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums text-[10px] font-semibold ${pctColor(vend.licores_pct)}`}>{fmtPct(vend.licores_pct)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-700">{fmtN(vend.hpc_cant)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums text-[10px] font-semibold ${pctColor(vend.hpc_pct)}`}>{fmtPct(vend.hpc_pct)}</td>
                      <td className={`py-2 pl-3 text-right tabular-nums font-bold ${isSel ? "text-brand-700" : "text-slate-800"}`}>{fmtN(vend.total_cant)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-semibold ${isSel ? "text-brand-700" : "text-slate-700"}`}>{fmt(vend.total)}</td>
                      <td className={`py-2 pl-1 text-right tabular-nums text-[10px] font-bold ${pctColor(vend.total_pct)}`}>{fmtPct(vend.total_pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SKU detail ────────────────────────────────────────────────────── */}
      <div className="card">
        {!selVendedor ? (
          <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Package size={32} className="text-slate-200" />
            <p className="text-sm">Seleccioná un vendedor en la tabla para ver sus SKUs</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-slate-700">
                  SKUs — <span className={cfg.color}>{selVendedor.vendedor}</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {cfg.label}{selectedSubgrupo && ` · ${selectedSubgrupo}`} · {MESES[mes]} {anho} ·&nbsp;
                  <span className="font-semibold text-slate-600">{fmtN(selVendedor[cfg.cantKey] as number)} uds.</span>
                  <span className="mx-1 text-slate-300">·</span>
                  <span className="font-semibold text-slate-600">{fmt(selVendedor[cfg.bsKey] as number)} Bs</span>
                </p>
              </div>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={skuSearch}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setSkuSearch(e.target.value)}
                  placeholder="Buscar SKU…"
                  className="text-xs pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300 w-44" />
              </div>
            </div>

            {loadingSku ? (
              <div className="h-48 bg-slate-50 animate-pulse rounded-xl" />
            ) : filteredSkus.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
                {/* Gráfico SKU */}
                <div className="xl:col-span-3">
                  <div className="overflow-y-auto rounded-xl border border-slate-100" style={{ maxHeight: 460 }}>
                    <div style={{ height: Math.max(filteredSkus.length * 36 + 20, 100) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={skuChartData} margin={{ top: 4, right: 56, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtAbbr} />
                          <YAxis dataKey="codigo" type="category" tick={{ fontSize: 9, fontWeight: 700, fill: "#64748b" }} width={65} />
                          <Tooltip content={(props: any) => {
                            if (!props.active || !props.payload?.length) return null;
                            const row = filteredSkus.find((s) => s.codigo === props.payload[0]?.payload?.codigo);
                            if (!row) return null;
                            return (
                              <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm max-w-72">
                                <p className="font-bold text-slate-800 mb-0.5">{row.codigo}</p>
                                <p className="text-slate-500 text-xs mb-2 leading-tight">{row.producto}</p>
                                <div className="flex gap-4 text-xs">
                                  <div><p className="text-slate-400">Unidades</p><p className="font-semibold text-blue-600">{fmtN(row.cantidad)}</p></div>
                                  <div><p className="text-slate-400">Venta Neta</p><p className="font-semibold text-emerald-600">{fmt(row.venta_neta)}</p></div>
                                </div>
                              </div>
                            );
                          }} />
                          <Bar dataKey="value" name="Venta Neta" radius={[0, 3, 3, 0]} barSize={10}
                            label={{ position: "right", fontSize: 9, fill: "#94a3b8", formatter: ((v: number) => fmtAbbr(v)) as any }}>
                            {skuChartData.map((entry) => (
                              <Cell key={entry.codigo} fill={selSkuCode === entry.codigo ? cfg.barColorSel : cfg.barColor} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Tabla SKU */}
                <div className="xl:col-span-2">
                  <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent pr-1" style={{ maxHeight: 460 }}>
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                        <tr className="text-slate-400">
                          <th className="text-left py-2 font-semibold">SKU</th>
                          <th className="text-right py-2 font-semibold">Uds.</th>
                          <th className="text-right py-2 font-semibold">Venta Neta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSkus.map((s) => {
                          const isSel = selSkuCode === s.codigo;
                          return (
                            <tr key={s.codigo}
                              onClick={() => setSelSkuCode((prev) => prev === s.codigo ? null : s.codigo)}
                              className={`border-b border-slate-50 cursor-pointer transition-colors ${
                                isSel ? "bg-brand-50 ring-1 ring-inset ring-brand-300" : "hover:bg-slate-50"
                              }`}>
                              <td className={`py-1.5 max-w-35 truncate ${isSel ? "text-brand-700 font-semibold" : "text-slate-700"}`}
                                title={s.producto}>{s.producto}</td>
                              <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums">{fmtN(s.cantidad)}</td>
                              <td className="py-1.5 text-right text-slate-500 tabular-nums">{fmt(s.venta_neta)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
