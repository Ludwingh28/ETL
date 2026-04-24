import { useEffect, useState, useCallback, useMemo, type ChangeEvent } from "react";
import { Package, RefreshCw, AlertCircle, Search } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface KpisData {
  total_cantidad:   number;
  total_venta_neta: number;
  total_ppto:       number;
  total_pct:        number | null;
  fecha_corte:      string | null;
}

interface SubgrupoRow {
  subgrupo:        string;
  cantidad:        number;
  venta_neta:      number;
  presupuesto:     number;
  porcentaje:      number | null;
  presupuesto_uds: number;
  porcentaje_uds:  number | null;
}

interface SkuRow {
  codigo:          string;
  producto:        string;
  cantidad:        number;
  venta_neta:      number;
  presupuesto:     number;
  porcentaje:      number | null;
  presupuesto_uds: number;
  porcentaje_uds:  number | null;
}

interface Periodo { anho: number; mes_numero: number; }

type Regional  = "Nacional" | "Santa Cruz" | "Cochabamba" | "La Paz";
type Categoria = "Alimentos" | "Apego" | "Licores" | "Home & Personal Care" | "Sin Clasificar";
type Metrica   = "bs" | "uds";

const REGIONALES: Regional[]  = ["Nacional", "Santa Cruz", "Cochabamba", "La Paz"];
const CATEGORIAS: Categoria[] = ["Alimentos", "Apego", "Licores", "Home & Personal Care", "Sin Clasificar"];

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

const CAT_CONFIG: Record<Categoria, { color: string; bg: string; active: string }> = {
  Alimentos:              { color: "text-green-700", bg: "bg-green-50",  active: "bg-green-500 text-white" },
  Apego:                  { color: "text-pink-700",  bg: "bg-pink-50",   active: "bg-pink-500 text-white"  },
  Licores:                { color: "text-rose-700",  bg: "bg-rose-50",   active: "bg-rose-500 text-white"  },
  "Home & Personal Care": { color: "text-sky-700",   bg: "bg-sky-50",    active: "bg-sky-500 text-white"   },
  "Sin Clasificar":       { color: "text-orange-700", bg: "bg-orange-50", active: "bg-orange-500 text-white" },
};

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ─── Formatos ─────────────────────────────────────────────────────────────────

const CUR  = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 });
const NUM  = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const fmt    = (n: number | null | undefined) => n != null ? CUR.format(Math.round(n)) : "—";
const fmtN   = (n: number | null | undefined) => n != null ? NUM.format(Math.round(n)) : "—";
const fmtAbbr = (n: number) => {
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return NUM.format(n);
};
const fmtPct = (n: number | null | undefined) => n != null ? `${n.toFixed(1)}%` : "—";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardUnidadesVendidas() {
  const { apiFetch } = useAuth();
  const now = new Date();

  // Filtros
  const [regional,  setRegional]  = useState<Regional>("Santa Cruz");
  const [canal,     setCanal]     = useState<string>("");
  const [canalList, setCanalList] = useState<string[]>([]);
  const [anho,      setAnho]      = useState(now.getFullYear());
  const [mes,       setMes]       = useState(now.getMonth() + 1);

  // Toggle global Bs / Uds
  const [metrica, setMetrica] = useState<Metrica>("bs");

  // Segmentador
  const [categoria,        setCategoria]        = useState<Categoria>("Alimentos");
  const [selectedSubgrupo, setSelectedSubgrupo] = useState<string | null>(null);

  // UI – SKU section
  const [selectedSkuCode, setSelectedSkuCode] = useState<string | null>(null);
  const [skuSearch,       setSkuSearch]       = useState("");
  const [pptoDir,         setPptoDir]         = useState<"desc" | "asc">("desc");

  // Data
  const [kpis,      setKpis]      = useState<KpisData | null>(null);
  const [subgrupos, setSubgrupos] = useState<SubgrupoRow[]>([]);
  const [skus,      setSkus]      = useState<SkuRow[]>([]);

  const [loadingKpis,     setLoadingKpis]     = useState(true);
  const [loadingSubgrupo, setLoadingSubgrupo] = useState(true);
  const [loadingSku,      setLoadingSku]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const [periodos, setPeriodos] = useState<Periodo[]>([]);

  // ── Fetch periodos ─────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch<{ success: boolean; data: Periodo[] }>("/dashboard/nacional/periodos/")
      .then(r => { if (r.success) setPeriodos(r.data); })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch canales ──────────────────────────────────────────────────────────
  const fetchCanales = useCallback(async () => {
    try {
      const j = await apiFetch<{ success: boolean; data: Array<{ canal: string }> }>(
        `/dashboard/canales/kpis/?regional=${REGIONAL_KEY[regional]}&anho=${anho}&mes=${mes}`
      );
      if (j.success) { setCanalList(j.data.map((c) => c.canal).filter(Boolean)); setCanal(""); }
    } catch { setCanalList([]); }
  }, [apiFetch, regional, anho, mes]);

  useEffect(() => { void fetchCanales(); }, [fetchCanales]);

  // ── Base query string ──────────────────────────────────────────────────────
  const baseQS = useMemo(() => {
    let q = `regional=${REGIONAL_KEY[regional]}&anho=${anho}&mes=${mes}`;
    if (canal) q += `&canal=${encodeURIComponent(canal)}`;
    return q;
  }, [regional, canal, anho, mes]);

  // ── Fetch KPIs ─────────────────────────────────────────────────────────────
  const fetchKpis = useCallback(async () => {
    setLoadingKpis(true);
    try {
      const j = await apiFetch<KpisData & { success: boolean }>(
        `/dashboard/unidades/kpis/?${baseQS}&categoria=${encodeURIComponent(categoria)}`
      );
      if (j.success) setKpis(j);
    } catch (e) { setError(String(e)); }
    finally { setLoadingKpis(false); }
  }, [apiFetch, baseQS, categoria]);

  // ── Fetch Subgrupos ────────────────────────────────────────────────────────
  const fetchSubgrupos = useCallback(async () => {
    setLoadingSubgrupo(true);
    setSelectedSubgrupo(null);
    setSkus([]);
    try {
      const j = await apiFetch<{ success: boolean; data: SubgrupoRow[] }>(
        `/dashboard/unidades/por-subgrupo/?${baseQS}&categoria=${encodeURIComponent(categoria)}`
      );
      if (j.success) setSubgrupos(j.data); else setSubgrupos([]);
    } catch { setSubgrupos([]); }
    finally { setLoadingSubgrupo(false); }
  }, [apiFetch, baseQS, categoria]);

  // ── Fetch SKUs ─────────────────────────────────────────────────────────────
  const fetchSkus = useCallback(async () => {
    if (!selectedSubgrupo) { setSkus([]); return; }
    setLoadingSku(true);
    setSelectedSkuCode(null);
    setSkuSearch("");
    try {
      const j = await apiFetch<{ success: boolean; data: SkuRow[] }>(
        `/dashboard/unidades/por-sku/?${baseQS}&categoria=${encodeURIComponent(categoria)}&subgrupo=${encodeURIComponent(selectedSubgrupo)}`
      );
      if (j.success) setSkus(j.data); else setSkus([]);
    } catch { setSkus([]); }
    finally { setLoadingSku(false); }
  }, [apiFetch, baseQS, categoria, selectedSubgrupo]);

  useEffect(() => { void fetchKpis(); },      [fetchKpis]);
  useEffect(() => { void fetchSubgrupos(); }, [fetchSubgrupos]);
  useEffect(() => { void fetchSkus(); },      [fetchSkus]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const sortedSkus = useMemo(() => {
    return [...skus].sort((a, b) =>
      pptoDir === "desc"
        ? (metrica === "uds" ? b.presupuesto_uds - a.presupuesto_uds : b.presupuesto - a.presupuesto)
        : (metrica === "uds" ? a.presupuesto_uds - b.presupuesto_uds : a.presupuesto - b.presupuesto)
    );
  }, [skus, pptoDir, metrica]);

  const filteredSkus = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    return q ? sortedSkus.filter((s) => s.producto.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)) : sortedSkus;
  }, [sortedSkus, skuSearch]);

  useEffect(() => { setSkuSearch(""); setSelectedSkuCode(null); }, [skus]);

  const fechaCorte = kpis?.fecha_corte
    ? new Date(kpis.fecha_corte + "T00:00:00").toLocaleDateString("es-BO", { year: "numeric", month: "2-digit", day: "2-digit" })
    : `${anho}/${String(mes).padStart(2, "0")}/??`;

  const cfg = CAT_CONFIG[categoria];

  const anhos = [...new Set(periodos.map(p => p.anho))].sort((a, b) => b - a);
  const mesesDisponibles = periodos.filter(p => p.anho === anho);

  // Helpers para chart/tabla según métrica
  const skuAvanceKey    = metrica === "uds" ? "cantidad"        : "venta_neta";
  const skuPptoKey      = metrica === "uds" ? "presupuesto_uds" : "presupuesto";
  const skuPctKey       = metrica === "uds" ? "porcentaje_uds"  : "porcentaje";
  const sgAvanceKey     = metrica === "uds" ? "cantidad"        : "venta_neta";
  const sgPptoKey       = metrica === "uds" ? "presupuesto_uds" : "presupuesto";

  const fmtAvance = (n: number | null | undefined) =>
    metrica === "uds" ? `${fmtN(n)} uds.` : fmt(n);
  const fmtPpto = (n: number | null | undefined) =>
    metrica === "uds" ? `${fmtN(n)} uds.` : fmt(n);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {/* ── Header + Filtros ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Unidades Vendidas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Evolución por sub-categoría y SKU hasta el&nbsp;
            <span className="font-semibold text-slate-700">{fechaCorte}</span>
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          {/* Toggle Bs / Uds */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Métrica</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-semibold">
              <button onClick={() => setMetrica("bs")}
                className={`px-3 py-1.5 transition-colors ${metrica === "bs" ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                Bs
              </button>
              <button onClick={() => setMetrica("uds")}
                className={`px-3 py-1.5 transition-colors ${metrica === "uds" ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                Uds
              </button>
            </div>
          </div>

          {/* Regional */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Regional</label>
            <div className="flex gap-1.5 flex-wrap">
              {REGIONALES.map((r) => (
                <button key={r} onClick={() => setRegional(r)}
                  className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${
                    regional === r ? `${REGIONAL_CONFIG[r].badge} shadow-sm` : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Canal */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Canal</label>
            <select value={canal} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCanal(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
              <option value="">Todos</option>
              {canalList.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Gestión */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
            <select value={anho} onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
              {anhos.length > 0 ? anhos.map(a => <option key={a} value={a}>{a}</option>) : [2026, 2025, 2024].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Mes */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
            <select value={mes} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
              {mesesDisponibles.length > 0 ? mesesDisponibles.map(p => <option key={p.mes_numero} value={p.mes_numero}>{MESES[p.mes_numero]}</option>) : MESES.slice(1).map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          <AlertCircle size={16} className="shrink-0" />{error}
        </div>
      )}

      {/* ── KPI strip compacto ────────────────────────────────────────────── */}
      <div className="mb-4">
        {loadingKpis ? (
          <div className="h-12 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        ) : kpis ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 flex flex-row flex-wrap items-center gap-x-8 gap-y-2">
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Unidades</p>
              <p className="text-xl font-bold text-slate-800 leading-tight">{fmtN(kpis.total_cantidad)}</p>
            </div>
            <div className="w-px h-8 bg-slate-100 hidden sm:block" />
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Venta Neta</p>
              <p className="text-xl font-bold text-slate-800">{fmt(kpis.total_venta_neta)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Presupuesto</p>
              <p className="text-xl font-semibold text-slate-600">{fmt(kpis.total_ppto)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Cumpl.</p>
              <p className={`text-xl font-bold ${
                kpis.total_pct == null ? "text-slate-300"
                : kpis.total_pct >= 100 ? "text-emerald-600"
                : kpis.total_pct >= 80  ? "text-amber-500"
                : "text-red-500"
              }`}>{fmtPct(kpis.total_pct)}</p>
            </div>
            {kpis.fecha_corte && (
              <p className="ml-auto text-[10px] text-slate-400">Corte: {kpis.fecha_corte}</p>
            )}
          </div>
        ) : null}
      </div>

      {/* ── 60/40: Cards izquierda + Chart 1 derecha ─────────────────────── */}
      <div className="grid grid-cols-5 gap-4 mb-4 items-start">

        {/* ── Izquierda 60%: Segmentador + Sub-categorías ─────────────────── */}
        <div className="col-span-5 xl:col-span-3 card">
          {/* Categoría */}
          <div className="flex flex-col gap-1 mb-4">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Categoría</label>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIAS.map((cat) => {
                const cc = CAT_CONFIG[cat];
                return (
                  <button key={cat} onClick={() => setCategoria(cat)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                      categoria === cat ? `${cc.active} border-transparent shadow-sm` : `${cc.color} ${cc.bg} border-transparent hover:opacity-80`
                    }`}>
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-categoría cards planas */}
          {loadingSubgrupo ? (
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-9 bg-slate-50 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : subgrupos.length === 0 ? (
            <p className="text-slate-400 text-sm">Sin datos para {categoria}.</p>
          ) : (
            <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent space-y-1.5 pr-1" style={{ maxHeight: 400 }}>
              {subgrupos.map((sg) => {
                const isSelected = selectedSubgrupo === sg.subgrupo;
                const pct = metrica === "uds" ? sg.porcentaje_uds : sg.porcentaje;
                return (
                  <button key={sg.subgrupo}
                    onClick={() => setSelectedSubgrupo(isSelected ? null : sg.subgrupo)}
                    className={`w-full flex items-center px-3 py-2 rounded-lg border text-xs transition-all ${
                      isSelected
                        ? "bg-brand-50 border-brand-300 ring-1 ring-brand-400"
                        : "bg-white border-slate-200 hover:border-brand-300 hover:bg-slate-50"
                    }`}>
                    <span className={`font-semibold flex-1 text-left truncate ${isSelected ? "text-brand-700" : "text-slate-700"}`}
                      title={sg.subgrupo}>{sg.subgrupo}</span>
                    <span className="text-slate-400 shrink-0 ml-3">
                      {metrica === "uds" ? `${fmtN(sg.cantidad)} uds.` : fmt(sg.venta_neta)}
                    </span>
                    <span className={`font-bold shrink-0 ml-3 w-14 text-right ${
                      pct == null ? "text-slate-300" : pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-500" : "text-red-500"
                    }`}>{fmtPct(pct)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Derecha 40%: Chart 1 avance/ppto por sub-categoría ──────────── */}
        <div className="col-span-5 xl:col-span-2 card">
          <h2 className="font-semibold text-slate-700 text-sm mb-1">Avance vs Presupuesto</h2>
          <p className="text-[11px] text-slate-400 mb-4">{categoria} · {MESES[mes]} {anho} · {metrica === "uds" ? "Unidades" : "Bs."}</p>

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
                  const pct = metrica === "uds" ? row.porcentaje_uds : row.porcentaje;
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm max-w-64">
                      <p className="font-bold text-slate-800 mb-1">{row.subgrupo}</p>
                      <div className="flex gap-4 flex-wrap text-xs">
                        <div><p className="text-slate-400">Avance</p><p className="font-semibold text-blue-600">{fmtAvance(row[sgAvanceKey as keyof SubgrupoRow] as number)}</p></div>
                        {(row[sgPptoKey as keyof SubgrupoRow] as number) > 0 && <div><p className="text-slate-400">Presupuesto</p><p className="font-semibold text-emerald-600">{fmtPpto(row[sgPptoKey as keyof SubgrupoRow] as number)}</p></div>}
                        {pct != null && <div><p className="text-slate-400">Cumpl.</p><p className={`font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-500" : "text-red-500"}`}>{fmtPct(pct)}</p></div>}
                      </div>
                    </div>
                  );
                }} />
                <Bar dataKey={sgAvanceKey} name="Avance" radius={[0, 3, 3, 0]} barSize={9}
                  label={{ position: "right", fontSize: 9, fill: "#94a3b8", formatter: ((_v: unknown, _e: unknown, idx: number) => fmtPct(metrica === "uds" ? subgrupos[idx]?.porcentaje_uds : subgrupos[idx]?.porcentaje)) as any }}>
                  {subgrupos.map((entry) => (
                    <Cell key={entry.subgrupo} fill={selectedSubgrupo === entry.subgrupo ? "#1d4ed8" : "#3b82f6"} />
                  ))}
                </Bar>
                <Bar dataKey={sgPptoKey} name="Presupuesto" radius={[0, 3, 3, 0]} barSize={9}>
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

      {/* ── SKUs por Sub-categoría ────────────────────────────────────────── */}
      {selectedSubgrupo && (
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold text-slate-700">
                SKUs — <span className={cfg.color}>{selectedSubgrupo}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{MESES[mes]} {anho} · {metrica === "uds" ? "Unidades" : "Bs."}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Ordenar</label>
              <button onClick={() => setPptoDir((d) => d === "desc" ? "asc" : "desc")}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-white text-slate-600 border-slate-200 hover:border-brand-400 hover:text-brand-600 transition-all flex items-center gap-1.5">
                Presupuesto {pptoDir === "desc" ? "↓" : "↑"}
              </button>
            </div>
          </div>

          {loadingSku ? (
            <div className="h-64 bg-slate-50 animate-pulse rounded-xl" />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
              {/* Gráfico SKU */}
              <div className="xl:col-span-3">
                <div className="overflow-y-auto rounded-xl border border-slate-100" style={{ maxHeight: 560 }}>
                  <div style={{ height: Math.max(filteredSkus.length * 36 + 20, 100) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={filteredSkus} margin={{ top: 4, right: 64, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtAbbr} />
                        <YAxis dataKey="codigo" type="category" tick={{ fontSize: 9, fontWeight: 700, fill: "#64748b" }} width={70} />
                        <Tooltip content={(props: any) => {
                          if (!props.active || !props.payload?.length) return null;
                          const row = filteredSkus.find((s) => s.codigo === props.payload[0]?.payload?.codigo);
                          if (!row) return null;
                          const pct = metrica === "uds" ? row.porcentaje_uds : row.porcentaje;
                          return (
                            <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm max-w-72">
                              <p className="font-bold text-slate-800 mb-0.5">{row.codigo}</p>
                              <p className="text-slate-500 text-xs mb-2 leading-tight">{row.producto}</p>
                              <div className="flex gap-3 flex-wrap">
                                <div><p className="text-[10px] text-slate-400">Avance</p><p className="font-semibold text-blue-600">{fmtAvance(row[skuAvanceKey as keyof SkuRow] as number)}</p></div>
                                {(row[skuPptoKey as keyof SkuRow] as number) > 0 && <div><p className="text-[10px] text-slate-400">Presupuesto</p><p className="font-semibold text-emerald-600">{fmtPpto(row[skuPptoKey as keyof SkuRow] as number)}</p></div>}
                                {pct != null && <div><p className="text-[10px] text-slate-400">Cumpl.</p><p className={`font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-500" : "text-red-500"}`}>{pct.toFixed(1)}%</p></div>}
                              </div>
                            </div>
                          );
                        }} />
                        <Bar dataKey={skuAvanceKey} name="Avance" radius={[0, 3, 3, 0]} barSize={10}
                          label={{ position: "right", fontSize: 9, fill: "#94a3b8", formatter: ((v: number) => fmtAbbr(v)) as any }}>
                          {filteredSkus.map((entry) => (
                            <Cell key={entry.codigo} fill={entry.codigo === selectedSkuCode ? "#1d4ed8" : "#3b82f6"} />
                          ))}
                        </Bar>
                        <Bar dataKey={skuPptoKey} name="Presupuesto" radius={[0, 3, 3, 0]} barSize={10}>
                          {filteredSkus.map((entry) => (
                            <Cell key={entry.codigo} fill={entry.codigo === selectedSkuCode ? "#15803d" : "#22c55e"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Tabla detalle SKU */}
              <div className="xl:col-span-2">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Package size={14} className={cfg.color} />
                    <span className="text-xs font-bold text-slate-600">
                      {selectedSubgrupo} — {filteredSkus.length}{filteredSkus.length !== skus.length ? `/${skus.length}` : ""} SKUs
                    </span>
                  </div>
                </div>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={skuSearch}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setSkuSearch(e.target.value)}
                    placeholder="Buscar producto o código…"
                    className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300" />
                </div>
                <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent pr-1" style={{ maxHeight: 560 }}>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                      <tr className="text-slate-400">
                        <th className="text-left py-2 font-semibold">SKU</th>
                        <th className="text-right py-2 font-semibold">{metrica === "uds" ? "Uds." : "Bs."}</th>
                        <th className="text-right py-2 font-semibold">Ppto.</th>
                        <th className="text-right py-2 font-semibold">Cumpl.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSkus.map((s) => {
                        const isSel = s.codigo === selectedSkuCode;
                        const avance = s[skuAvanceKey as keyof SkuRow] as number;
                        const ppto   = s[skuPptoKey  as keyof SkuRow] as number;
                        const pct    = s[skuPctKey   as keyof SkuRow] as number | null;
                        return (
                          <tr key={s.codigo}
                            onClick={() => setSelectedSkuCode((prev) => prev === s.codigo ? null : s.codigo)}
                            className={`border-b border-slate-50 cursor-pointer transition-colors ${
                              isSel ? "bg-brand-50 ring-1 ring-inset ring-brand-300" : "hover:bg-slate-50"
                            }`}>
                            <td className={`py-1.5 max-w-28 truncate ${isSel ? "text-brand-700 font-semibold" : "text-slate-700"}`} title={s.producto}>
                              <span className={`font-mono text-[10px] block ${isSel ? "text-brand-500" : "text-slate-400"}`}>{s.codigo}</span>
                              {s.producto}
                            </td>
                            <td className={`py-1.5 text-right tabular-nums ${isSel ? "text-brand-700 font-semibold" : "text-slate-600"}`}>
                              {metrica === "uds" ? fmtN(avance) : fmt(avance)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-slate-400">
                              {metrica === "uds" ? fmtN(ppto) : fmt(ppto)}
                            </td>
                            <td className={`py-1.5 text-right font-bold ${
                              pct == null ? "text-slate-300" : pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-500" : "text-red-500"
                            }`}>{fmtPct(pct)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!selectedSubgrupo && !loadingSubgrupo && subgrupos.length > 0 && (
        <div className="card text-center text-slate-400 text-sm py-10 flex items-center justify-center gap-2">
          <RefreshCw size={14} />
          Seleccioná una sub-categoría para ver el detalle por SKU
        </div>
      )}
    </DashboardLayout>
  );
}
