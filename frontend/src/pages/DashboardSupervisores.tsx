import { useEffect, useState, useCallback, useMemo, type ChangeEvent } from "react";
import {
  DollarSign, Search, RefreshCw, AlertCircle, UserCheck, Users, ShieldAlert, ArrowUpDown,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface VendedorRow {
  vendedor:       string;
  alimentos:      number; alimentos_ppto: number; alimentos_pct: number | null; alimentos_cant: number;
  apego:          number; apego_ppto:     number; apego_pct:     number | null; apego_cant:     number;
  licores:        number; licores_ppto:   number; licores_pct:   number | null; licores_cant:   number;
  hpc:            number; hpc_ppto:       number; hpc_pct:       number | null; hpc_cant:       number;
  total:          number; total_ppto:     number; total_pct:     number | null; total_cant:     number;
}

interface SupervisoresData {
  regional:     string;
  canal:        string;
  total_avance: number;
  total_ppto:   number;
  total_pct:    number | null;
  fecha_corte:  string | null;
  vendedores:   VendedorRow[];
}

type Regional = "Nacional" | "Santa Cruz" | "Cochabamba" | "La Paz";
type CatKey   = "total" | "alimentos" | "apego" | "licores" | "hpc";

const REGIONALES: Regional[] = ["Nacional", "Santa Cruz", "Cochabamba", "La Paz"];

const REGIONAL_KEY: Record<Regional, string> = {
  Nacional:     "nacional",
  "Santa Cruz": "santa_cruz",
  Cochabamba:   "cochabamba",
  "La Paz":     "la_paz",
};

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

interface Periodo { anho: number; mes_numero: number; }

// ─── Formatos ────────────────────────────────────────────────────────────────

const NUM  = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const CUR  = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 });
const fmtN   = (n: number | null | undefined) => n != null ? NUM.format(Math.round(n)) : "—";
const fmtCur = (n: number | null | undefined) => n != null ? CUR.format(Math.round(n)) : "—";
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

// ─── Config por categoría (para el gráfico) ───────────────────────────────────

interface CatCfg {
  label:       string;
  avanceKey:   keyof VendedorRow;
  pptoKey:     keyof VendedorRow;
  pctKey:      keyof VendedorRow;
  cantKey:     keyof VendedorRow;
  color:       string;
  activeClass: string;
  barColor:    string;
  barColorSel: string;
}

const CAT_CFG: Record<CatKey, CatCfg> = {
  total:     { label: "Total",               avanceKey: "total",     pptoKey: "total_ppto",     pctKey: "total_pct",     cantKey: "total_cant",     color: "text-slate-700", activeClass: "bg-slate-700 text-white",  barColor: "#64748b", barColorSel: "#1e293b" },
  alimentos: { label: "Alimentos",           avanceKey: "alimentos", pptoKey: "alimentos_ppto", pctKey: "alimentos_pct", cantKey: "alimentos_cant", color: "text-green-700", activeClass: "bg-green-600 text-white",  barColor: "#22c55e", barColorSel: "#15803d" },
  apego:     { label: "Apego",               avanceKey: "apego",     pptoKey: "apego_ppto",     pctKey: "apego_pct",     cantKey: "apego_cant",     color: "text-pink-700",  activeClass: "bg-pink-600 text-white",   barColor: "#ec4899", barColorSel: "#be185d" },
  licores:   { label: "Licores",             avanceKey: "licores",   pptoKey: "licores_ppto",   pctKey: "licores_pct",   cantKey: "licores_cant",   color: "text-rose-700",  activeClass: "bg-rose-600 text-white",   barColor: "#f43f5e", barColorSel: "#be123c" },
  hpc:       { label: "Home & Personal Care",avanceKey: "hpc",       pptoKey: "hpc_ppto",       pctKey: "hpc_pct",       cantKey: "hpc_cant",       color: "text-sky-700",   activeClass: "bg-sky-600 text-white",    barColor: "#0ea5e9", barColorSel: "#0369a1" },
};

const ADMIN_CARGOS = new Set(["Administrador de Sistema", "Subadministrador de Sistemas"]);
const isAdminUser = (cargo?: string, is_staff?: boolean) =>
  is_staff === true || ADMIN_CARGOS.has(cargo ?? "");

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardSupervisores() {
  const { apiFetch, user } = useAuth();
  const now = new Date();

  const isAdmin  = isAdminUser(user?.cargo, user?.is_staff);
  const isSuperv = !isAdmin && (user?.cargo?.toLowerCase().includes("supervisor") ?? false);

  // Filtros admin
  const [regional,  setRegional]  = useState<Regional>("Santa Cruz");
  const [canal,     setCanal]     = useState<string>("");
  const [canalList, setCanalList] = useState<string[]>([]);
  const [anho,      setAnho]      = useState(now.getFullYear());
  const [mes,       setMes]       = useState(now.getMonth() + 1);

  // UI
  const [catKey,  setCatKey]  = useState<CatKey>("total");   // filtro del gráfico
  const [search,  setSearch]  = useState("");
  const [selVend, setSelVend] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  // Data
  const [data,    setData]    = useState<SupervisoresData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [periodos, setPeriodos] = useState<Periodo[]>([]);

  // ── Fetch periodos ─────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch<{ success: boolean; data: Periodo[] }>("/dashboard/nacional/periodos/")
      .then(r => { if (r.success) setPeriodos(r.data); })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch canales (solo admin, depende de regional/año/mes) ───────────────
  const fetchCanales = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const j = await apiFetch<{ success: boolean; data: Array<{ canal: string }> }>(
        `/dashboard/canales/kpis/?regional=${REGIONAL_KEY[regional]}&anho=${anho}&mes=${mes}`
      );
      if (j.success) {
        setCanalList(j.data.map((c) => c.canal).filter(Boolean));
        setCanal("");
      }
    } catch {
      setCanalList([]);
    }
  }, [isAdmin, apiFetch, regional, anho, mes]);

  useEffect(() => { void fetchCanales(); }, [fetchCanales]);

  // ── Fetch vendedores ───────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelVend(null);
    setSearch("");
    try {
      let url = `/dashboard/supervisores/vendedores/?anho=${anho}&mes=${mes}`;
      if (isAdmin) {
        url += `&regional=${REGIONAL_KEY[regional]}`;
        if (canal) url += `&canal=${encodeURIComponent(canal)}`;
      }
      const j = await apiFetch<{ success: boolean; error?: string } & SupervisoresData>(url);
      if (!j.success) throw new Error(j.error);
      setData(j);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, isAdmin, regional, canal, anho, mes]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // ── Filas ordenadas + filtradas (compartidas entre tabla y gráfico) ────────
  const processedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (data?.vendedores ?? []).filter(
      (v) => !q || v.vendedor.toLowerCase().includes(q)
    );
    // Ordenar por presupuesto de la categoría activa en el gráfico
    const pptoKey = CAT_CFG[catKey].pptoKey;
    return [...rows].sort((a, b) =>
      sortDir === "desc"
        ? (b[pptoKey] as number) - (a[pptoKey] as number)
        : (a[pptoKey] as number) - (b[pptoKey] as number)
    );
  }, [data, search, sortDir, catKey]);

  // ── UI helpers ────────────────────────────────────────────────────────────
  const cfg = CAT_CFG[catKey];

  const fechaCorte = data?.fecha_corte
    ? new Date(data.fecha_corte + "T00:00:00").toLocaleDateString("es-BO", { year: "numeric", month: "2-digit", day: "2-digit" })
    : `${anho}/${String(mes).padStart(2, "0")}/??`;

  const anhos = [...new Set(periodos.map(p => p.anho))].sort((a, b) => b - a);
  const mesesDisponibles = periodos.filter(p => p.anho === anho);

  // ── Sin acceso ────────────────────────────────────────────────────────────
  if (!isAdmin && !isSuperv) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="p-4 bg-red-50 rounded-2xl"><ShieldAlert size={40} className="text-red-400" /></div>
          <p className="text-lg font-semibold text-slate-700">Acceso restringido</p>
          <p className="text-sm text-slate-400">Este dashboard es exclusivo para supervisores y administradores.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* ── Header + filtros ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UserCheck size={20} className="text-brand-600" />
            <h1 className="text-2xl font-bold text-slate-800">Dashboard Supervisores</h1>
          </div>
          <p className="text-slate-500 text-sm">
            Avance por vendedor hasta el&nbsp;
            <span className="font-semibold text-slate-700">{fechaCorte}</span>
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          {isAdmin && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Regional</label>
                <div className="flex gap-1.5 flex-wrap">
                  {REGIONALES.map((r) => (
                    <button key={r} onClick={() => setRegional(r)}
                      className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${
                        regional === r
                          ? "bg-brand-100 text-brand-700 border-brand-200 shadow-sm"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                    >{r}</button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Canal</label>
                <select
                  value={canal}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setCanal(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-35"
                >
                  <option value="">Todos los canales</option>
                  {canalList.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </>
          )}

          {isSuperv && (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-brand-100 text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg font-semibold">{user?.regional}</span>
              {user?.canal && (
                <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg font-semibold">{user.canal}</span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
            <select value={anho} onChange={(e: ChangeEvent<HTMLSelectElement>) => setAnho(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
              {anhos.length > 0 ? anhos.map(a => <option key={a} value={a}>{a}</option>) : [2026, 2025, 2024].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
            <select value={mes} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMes(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
              {mesesDisponibles.length > 0 ? mesesDisponibles.map(p => <option key={p.mes_numero} value={p.mes_numero}>{MESES[p.mes_numero]}</option>) : MESES.slice(1).map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>

          <button onClick={() => void fetchData()} disabled={loading}
            className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          <AlertCircle size={16} className="shrink-0" />{error}
        </div>
      )}

      {/* ── Card Total ──────────────────────────────────────────────────── */}
      <div className="mb-5">
        {loading ? (
          <div className="kpi-card animate-pulse bg-slate-50 h-24" />
        ) : data ? (
          <div className="kpi-card flex flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-brand-50 shrink-0">
                <DollarSign size={18} className="text-brand-600" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-2">
                  Venta Neta Total — {MESES[mes]} {anho}
                  {data.canal && <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">{data.canal}</span>}
                </p>
                <p className="text-2xl font-bold text-slate-800">{fmtCur(data.total_avance)}</p>
                <p className="text-xs text-slate-400 mt-0.5">/ {fmtCur(data.total_ppto)} presupuesto</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {data.total_pct != null && (
                <span className={`text-xl font-bold ${pctColor(data.total_pct)}`}>{data.total_pct.toFixed(1)}%</span>
              )}
              <span className={`text-xs font-semibold flex items-center gap-1 ${(data.total_avance - data.total_ppto) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {(data.total_avance - data.total_ppto) >= 0 ? "▲" : "▼"}
                {fmtCur(Math.abs(Math.round(data.total_avance - data.total_ppto)))}
              </span>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Users size={11} /> {data.vendedores.length} vendedores
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECCIÓN 1 — TABLA (todas las categorías como columnas)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-700">Resumen por Categoría</h2>
            <p className="text-xs text-slate-400 mt-0.5">% avance vs presupuesto · {MESES[mes]} {anho}</p>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            {/* Buscador */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar vendedor…"
                className="text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300 w-44"
              />
            </div>
            {/* Ordenar */}
            <button
              onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
              className="text-xs font-semibold px-3 py-2 rounded-lg border bg-white text-slate-600 border-slate-200 hover:border-brand-400 hover:text-brand-600 transition-all flex items-center gap-1.5"
            >
              <ArrowUpDown size={12} />
              Presupuesto {sortDir === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>

        <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent" style={{ maxHeight: 400 }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
              <tr className="text-slate-400">
                <th className="text-left py-2.5 font-semibold pr-4 min-w-36">Vendedor</th>
                <th className="text-right py-2.5 font-semibold px-3 text-green-600">Alimentos</th>
                <th className="text-right py-2.5 font-semibold px-3 text-pink-600">Apego</th>
                <th className="text-right py-2.5 font-semibold px-3 text-rose-600">Licores</th>
                <th className="text-right py-2.5 font-semibold px-3 text-sky-600">H&PC</th>
                <th className="text-right py-2.5 font-semibold pl-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td colSpan={6} className="py-2.5">
                        <div className="h-4 bg-slate-100 animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                : processedRows.map((v) => {
                    const isSel = v.vendedor === selVend;
                    return (
                      <tr
                        key={v.vendedor}
                        onClick={() => setSelVend((prev) => prev === v.vendedor ? null : v.vendedor)}
                        className={`border-b border-slate-50 cursor-pointer transition-colors ${
                          isSel ? "bg-brand-50 ring-1 ring-inset ring-brand-300" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className={`py-2 pr-4 font-semibold ${isSel ? "text-brand-700" : "text-slate-700"}`}>
                          {v.vendedor}
                        </td>
                        <td className={`py-2 px-3 text-right font-bold ${pctColor(v.alimentos_pct)}`}>{fmtPct(v.alimentos_pct)}</td>
                        <td className={`py-2 px-3 text-right font-bold ${pctColor(v.apego_pct)}`}>{fmtPct(v.apego_pct)}</td>
                        <td className={`py-2 px-3 text-right font-bold ${pctColor(v.licores_pct)}`}>{fmtPct(v.licores_pct)}</td>
                        <td className={`py-2 px-3 text-right font-bold ${pctColor(v.hpc_pct)}`}>{fmtPct(v.hpc_pct)}</td>
                        <td className={`py-2 pl-3 text-right font-bold ${pctColor(v.total_pct)}`}>{fmtPct(v.total_pct)}</td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loading && processedRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-300 gap-2">
              <Users size={26} />
              <p className="text-sm">Sin datos</p>
            </div>
          )}
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          {processedRows.length}{processedRows.length !== (data?.vendedores.length ?? 0) ? `/${data?.vendedores.length}` : ""} vendedores · Clic en una fila para resaltar en el gráfico
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECCIÓN 2 — GRÁFICO + TABLA DETALLE (modelo SKU)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="card">
        {/* Cabecera: título + categoría + ordenar */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-semibold text-slate-700">
              Avance vs Presupuesto — <span className={cfg.color}>{cfg.label}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{MESES[mes]} {anho}</p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Categoría</label>
              <div className="flex gap-1.5 flex-wrap">
                {(Object.keys(CAT_CFG) as CatKey[]).map((k) => {
                  const c = CAT_CFG[k];
                  return (
                    <button key={k} onClick={() => setCatKey(k)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                        catKey === k
                          ? `${c.activeClass} border-transparent shadow-sm`
                          : `${c.color} bg-white border-slate-200 hover:border-slate-300`
                      }`}
                    >{c.label}</button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Ordenar</label>
              <button
                onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-white text-slate-600 border-slate-200 hover:border-brand-400 hover:text-brand-600 transition-all flex items-center gap-1.5"
              >
                <ArrowUpDown size={12} />
                Presupuesto {sortDir === "desc" ? "↓" : "↑"}
              </button>
            </div>
          </div>
        </div>

        {/* Split: gráfico izquierda + tabla derecha */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">

          {/* ── Gráfico (3/5) ───────────────────────────────────────────── */}
          <div className="xl:col-span-3">
            {loading ? (
              <div className="h-64 bg-slate-50 animate-pulse rounded-xl" />
            ) : processedRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-300 gap-2">
                <Users size={28} /><p className="text-sm">Sin datos</p>
              </div>
            ) : (
              <div className="overflow-y-auto rounded-xl border border-slate-100" style={{ maxHeight: 560 }}>
                <div style={{ height: Math.max(processedRows.length * 44 + 24, 120) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={processedRows.map((v) => ({
                        vendedor: v.vendedor,
                        avance:   v[cfg.avanceKey] as number,
                        ppto:     v[cfg.pptoKey]   as number,
                        pct:      v[cfg.pctKey]    as number | null,
                      }))}
                      margin={{ top: 4, right: 72, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtAbbr} />
                      <YAxis
                        dataKey="vendedor"
                        type="category"
                        tick={{ fontSize: 9, fontWeight: 700, fill: "#64748b" }}
                        width={130}
                        tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 19) + "…" : v}
                      />
                      <Tooltip
                        content={(props: any) => {
                          if (!props.active || !props.payload?.length) return null;
                          const d = props.payload[0]?.payload;
                          if (!d) return null;
                          return (
                            <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm max-w-64">
                              <p className="font-bold text-slate-800 mb-2 leading-tight">{d.vendedor}</p>
                              <div className="flex gap-3 flex-wrap">
                                <div>
                                  <p className="text-[10px] text-slate-400">Avance</p>
                                  <p className="font-semibold text-blue-600">{fmtCur(d.avance)}</p>
                                </div>
                                {d.ppto > 0 && (
                                  <div>
                                    <p className="text-[10px] text-slate-400">Presupuesto</p>
                                    <p className="font-semibold text-emerald-600">{fmtCur(d.ppto)}</p>
                                  </div>
                                )}
                                {d.pct != null && (
                                  <div>
                                    <p className="text-[10px] text-slate-400">Cumpl.</p>
                                    <p className={`font-bold ${pctColor(d.pct)}`}>{d.pct.toFixed(1)}%</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }}
                      />
                      {/* Avance — siempre azul */}
                      <Bar dataKey="avance" name="Avance" radius={[0, 3, 3, 0]} barSize={11}
                        label={{ position: "right", fontSize: 9, fill: "#94a3b8", formatter: ((v: number) => fmtAbbr(v)) as any }}>
                        {processedRows.map((v) => (
                          <Cell key={v.vendedor} fill={v.vendedor === selVend ? "#1d4ed8" : "#3b82f6"} />
                        ))}
                      </Bar>
                      {/* Presupuesto — siempre verde */}
                      <Bar dataKey="ppto" name="Presupuesto" radius={[0, 3, 3, 0]} barSize={11}>
                        {processedRows.map((v) => (
                          <Cell key={v.vendedor} fill={v.vendedor === selVend ? "#15803d" : "#22c55e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Leyenda */}
            <div className="flex gap-5 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm inline-block bg-blue-500" />
                Avance
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm inline-block bg-emerald-500" />
                Presupuesto
              </span>
            </div>
          </div>

          {/* ── Tabla detalle (2/5) ──────────────────────────────────────── */}
          <div className="xl:col-span-2">
            {/* Cabecera tabla + buscador */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full inline-block`} style={{ background: cfg.barColor }} />
                {cfg.label} — {processedRows.length} vendedores
              </span>
              {selVend && (
                <button onClick={() => setSelVend(null)} className="text-[10px] text-brand-600 hover:underline">
                  Limpiar
                </button>
              )}
            </div>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar vendedor…"
                className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300"
              />
            </div>
            <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent pr-1" style={{ maxHeight: 560 }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
                  <tr className="text-slate-400">
                    <th className="text-left py-2 font-semibold">Vendedor</th>
                    <th className="text-right py-2 font-semibold">Venta Neta</th>
                    <th className="text-right py-2 font-semibold">Uds.</th>
                    <th className="text-right py-2 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td colSpan={4} className="py-2">
                            <div className="h-4 bg-slate-100 animate-pulse rounded" />
                          </td>
                        </tr>
                      ))
                    : processedRows.map((v) => {
                        const avance = v[cfg.avanceKey] as number;
                        const cant   = v[cfg.cantKey]   as number;
                        const pct    = v[cfg.pctKey]    as number | null;
                        const isSel  = v.vendedor === selVend;
                        return (
                          <tr
                            key={v.vendedor}
                            onClick={() => setSelVend((prev) => prev === v.vendedor ? null : v.vendedor)}
                            className={`border-b border-slate-50 cursor-pointer transition-colors ${
                              isSel ? "bg-brand-50 ring-1 ring-inset ring-brand-300" : "hover:bg-slate-50"
                            }`}
                          >
                            <td className={`py-1.5 font-semibold truncate max-w-28 ${isSel ? "text-brand-700" : "text-slate-700"}`} title={v.vendedor}>
                              {v.vendedor}
                            </td>
                            <td className="py-1.5 text-right text-slate-700 font-semibold">{fmtN(avance)}</td>
                            <td className="py-1.5 text-right text-slate-500">{cant.toLocaleString()}</td>
                            <td className={`py-1.5 text-right font-bold ${pctColor(pct)}`}>{fmtPct(pct)}</td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
