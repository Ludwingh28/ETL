import { useState, useMemo } from "react";
import { MapPin, AlertCircle } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceArea, ReferenceLine,
} from "recharts";
import DashboardLayout from "../components/DashboardLayout";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RutaRow {
  ruta:            string;
  vendedor:        string;
  clientes:        number;
  pct_cobertura:   number;
  pct_kesimo:      number;
  pct_crecimiento: number;
}

interface SemanaDetalle {
  semana:   number;
  pedidos:  number;
  bs:       number;
  bs_ruta:  number;
}

interface RutaDetalle {
  k2:      number;
  k5:      number;
  kp:      number;
  semanas: SemanaDetalle[];
}

type Regional = "Nacional" | "Santa Cruz" | "Cochabamba" | "La Paz";

// ─── Constantes ───────────────────────────────────────────────────────────────

const DIAS    = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES   = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const REGIONALES: Regional[] = ["Nacional", "Santa Cruz", "Cochabamba", "La Paz"];
const CANALES = ["Todos", "DTS", "WHS", "HORECA", "SPM", "CORP", "PROV"];

const REGIONAL_CONFIG: Record<Regional, { badge: string }> = {
  Nacional:     { badge: "bg-brand-100 text-brand-700 border-brand-200" },
  "Santa Cruz": { badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Cochabamba:   { badge: "bg-violet-100 text-violet-700 border-violet-200" },
  "La Paz":     { badge: "bg-amber-100 text-amber-700 border-amber-200" },
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_RUTAS: RutaRow[] = [
  { ruta: "R-001", vendedor: "Carlos Mamani",   clientes: 45, pct_cobertura: 87.5, pct_kesimo:  92.3, pct_crecimiento:  5.2 },
  { ruta: "R-002", vendedor: "Juan Flores",     clientes: 38, pct_cobertura: 73.2, pct_kesimo:  78.9, pct_crecimiento: -2.1 },
  { ruta: "R-003", vendedor: "Ana Quispe",      clientes: 52, pct_cobertura: 94.1, pct_kesimo: 105.7, pct_crecimiento:  8.4 },
  { ruta: "R-004", vendedor: "Pedro Vargas",    clientes: 41, pct_cobertura: 65.8, pct_kesimo:  68.4, pct_crecimiento: -5.3 },
  { ruta: "R-005", vendedor: "María López",     clientes: 47, pct_cobertura: 89.3, pct_kesimo:  97.2, pct_crecimiento:  3.8 },
  { ruta: "R-006", vendedor: "Roberto Chura",   clientes: 35, pct_cobertura: 71.4, pct_kesimo:  74.6, pct_crecimiento:  1.2 },
  { ruta: "R-007", vendedor: "Laura Condori",   clientes: 58, pct_cobertura: 96.5, pct_kesimo: 112.3, pct_crecimiento: 11.7 },
  { ruta: "R-008", vendedor: "Diego Salinas",   clientes: 43, pct_cobertura: 79.1, pct_kesimo:  83.5, pct_crecimiento:  2.9 },
  { ruta: "R-009", vendedor: "Sofía Ticona",    clientes: 50, pct_cobertura: 91.0, pct_kesimo:  99.8, pct_crecimiento:  6.1 },
  { ruta: "R-010", vendedor: "Miguel Zenteno",  clientes: 33, pct_cobertura: 60.6, pct_kesimo:  63.2, pct_crecimiento: -8.7 },
];

const MOCK_DETALLE: Record<string, RutaDetalle> = {
  "R-001": { k2: 18500, k5: 7500, kp: 13000, semanas: [
    { semana: 1, pedidos: 38, bs: 12500, bs_ruta: 12500 },
    { semana: 2, pedidos: 42, bs: 14200, bs_ruta: 14200 },
    { semana: 3, pedidos: 40, bs: 13800, bs_ruta: 13800 },
    { semana: 4, pedidos: 45, bs: 15600, bs_ruta: 15600 },
  ]},
  "R-002": { k2: 18500, k5: 7500, kp: 13000, semanas: [
    { semana: 1, pedidos: 30, bs:  9800, bs_ruta:  9800 },
    { semana: 2, pedidos: 28, bs:  8900, bs_ruta:  8900 },
    { semana: 3, pedidos: 32, bs: 10200, bs_ruta: 10200 },
    { semana: 4, pedidos: 27, bs:  7600, bs_ruta:  7600 },
  ]},
  "R-003": { k2: 18500, k5: 7500, kp: 13000, semanas: [
    { semana: 1, pedidos: 48, bs: 16800, bs_ruta: 16800 },
    { semana: 2, pedidos: 50, bs: 17500, bs_ruta: 17500 },
    { semana: 3, pedidos: 47, bs: 16200, bs_ruta: 16200 },
    { semana: 4, pedidos: 52, bs: 19100, bs_ruta: 19100 },
  ]},
  "R-004": { k2: 18500, k5: 7500, kp: 13000, semanas: [
    { semana: 1, pedidos: 29, bs:  7200, bs_ruta:  7200 },
    { semana: 2, pedidos: 31, bs:  8100, bs_ruta:  8100 },
    { semana: 3, pedidos: 27, bs:  6800, bs_ruta:  6800 },
    { semana: 4, pedidos: 28, bs:  7500, bs_ruta:  7500 },
  ]},
  "R-005": { k2: 18500, k5: 7500, kp: 13000, semanas: [
    { semana: 1, pedidos: 41, bs: 14300, bs_ruta: 14300 },
    { semana: 2, pedidos: 43, bs: 15100, bs_ruta: 15100 },
    { semana: 3, pedidos: 40, bs: 13900, bs_ruta: 13900 },
    { semana: 4, pedidos: 44, bs: 15800, bs_ruta: 15800 },
  ]},
  "R-006": { k2: 18500, k5: 7500, kp: 13000, semanas: [
    { semana: 1, pedidos: 28, bs:  9200, bs_ruta:  9200 },
    { semana: 2, pedidos: 30, bs:  9800, bs_ruta:  9800 },
    { semana: 3, pedidos: 27, bs:  8700, bs_ruta:  8700 },
    { semana: 4, pedidos: 29, bs:  9500, bs_ruta:  9500 },
  ]},
  "R-007": { k2: 18500, k5: 7500, kp: 13000, semanas: [
    { semana: 1, pedidos: 53, bs: 18200, bs_ruta: 18200 },
    { semana: 2, pedidos: 55, bs: 19400, bs_ruta: 19400 },
    { semana: 3, pedidos: 51, bs: 17600, bs_ruta: 17600 },
    { semana: 4, pedidos: 57, bs: 20100, bs_ruta: 20100 },
  ]},
  "R-008": { k2: 18500, k5: 7500, kp: 13000, semanas: [
    { semana: 1, pedidos: 36, bs: 11800, bs_ruta: 11800 },
    { semana: 2, pedidos: 38, bs: 12400, bs_ruta: 12400 },
    { semana: 3, pedidos: 35, bs: 11200, bs_ruta: 11200 },
    { semana: 4, pedidos: 39, bs: 13100, bs_ruta: 13100 },
  ]},
  "R-009": { k2: 18500, k5: 7500, kp: 13000, semanas: [
    { semana: 1, pedidos: 44, bs: 15200, bs_ruta: 15200 },
    { semana: 2, pedidos: 46, bs: 16000, bs_ruta: 16000 },
    { semana: 3, pedidos: 43, bs: 14800, bs_ruta: 14800 },
    { semana: 4, pedidos: 48, bs: 17300, bs_ruta: 17300 },
  ]},
  "R-010": { k2: 18500, k5: 7500, kp: 13000, semanas: [
    { semana: 1, pedidos: 22, bs:  5800, bs_ruta:  5800 },
    { semana: 2, pedidos: 25, bs:  6500, bs_ruta:  6500 },
    { semana: 3, pedidos: 21, bs:  5400, bs_ruta:  5400 },
    { semana: 4, pedidos: 23, bs:  6100, bs_ruta:  6100 },
  ]},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = new Date();
function defaultDia(): number {
  const d = now.getDay(); // 0=Dom 1=Lun ... 6=Sab
  if (d === 0) return 5; // Domingo → Sábado (índice 5)
  return d - 1;          // Lun=0 ... Sab=5
}

const NUM = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const CUR = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 });
const fmtN   = (n: number) => NUM.format(n);
const fmt    = (n: number) => CUR.format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtAbbr = (n: number) => {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return NUM.format(n);
};

function pctColor(n: number) {
  if (n >= 100) return "text-emerald-600";
  if (n >= 80)  return "text-amber-500";
  return "text-red-500";
}
function growColor(n: number) {
  if (n > 0)  return "text-emerald-600";
  if (n < 0)  return "text-red-500";
  return "text-slate-400";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardInformacionRutas() {
  const [anho,     setAnho]     = useState(now.getFullYear());
  const [mes,      setMes]      = useState(now.getMonth() + 1);
  const [dia,      setDia]      = useState(defaultDia());
  const [canal,    setCanal]    = useState("Todos");
  const [regional, setRegional] = useState<Regional>("Santa Cruz");

  const [selectedRuta, setSelectedRuta] = useState<RutaRow | null>(null);

  const detalle: RutaDetalle | null = selectedRuta
    ? (MOCK_DETALLE[selectedRuta.ruta] ?? null)
    : null;

  const chartData = useMemo(() =>
    detalle?.semanas.map(s => ({ name: `Sem ${s.semana}`, bs_ruta: s.bs_ruta })) ?? [],
    [detalle]
  );

  return (
    <DashboardLayout>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Información Rutas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Cobertura y késimo por ruta ·&nbsp;
            <span className="font-semibold text-slate-700">{DIAS[dia]}, {MESES[mes]} {anho}</span>
          </p>
        </div>

        {/* Filtros arriba derecha */}
        <div className="flex items-end gap-3 flex-wrap">
          {/* Gestión */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Gestión</label>
            <select value={anho} onChange={e => setAnho(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
              {[2026, 2025, 2024].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Mes */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Mes</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
              {MESES.slice(1).map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>

          {/* Día */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Día</label>
            <select value={dia} onChange={e => setDia(Number(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
              {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>

          {/* Canal */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Canal</label>
            <select value={canal} onChange={e => setCanal(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
              {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Regional */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mr-1">Regional</span>
        {REGIONALES.map(r => (
          <button key={r} onClick={() => setRegional(r)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              regional === r ? `${REGIONAL_CONFIG[r].badge} shadow-sm` : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}>{r}</button>
        ))}
      </div>

      {/* ── Tabla de rutas ────────────────────────────────────────────────── */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-4">
          <MapPin size={15} className="text-brand-500" />
          <h2 className="font-semibold text-slate-700 text-sm">Rutas — {regional} · {DIAS[dia]}</h2>
          <span className="ml-auto text-[11px] text-slate-400">Hacé clic en una ruta para ver el detalle</span>
        </div>

        <div className="overflow-x-auto overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent" style={{ maxHeight: 440 }}>
          <table className="w-full text-xs min-w-160">
            <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f1f5f9]">
              <tr className="text-slate-500">
                <th className="text-left py-2 pr-4 font-semibold">Ruta</th>
                <th className="text-left py-2 pr-4 font-semibold">Vendedor</th>
                <th className="text-right py-2 px-3 font-semibold">Clientes</th>
                <th className="text-right py-2 px-3 font-semibold">% Cobertura</th>
                <th className="text-right py-2 px-3 font-semibold">% Késimo</th>
                <th className="text-right py-2 pl-3 font-semibold">% Crecimiento</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_RUTAS.map(row => {
                const isSel = selectedRuta?.ruta === row.ruta;
                return (
                  <tr key={row.ruta}
                    onClick={() => setSelectedRuta(isSel ? null : row)}
                    className={`border-b border-slate-50 cursor-pointer transition-colors ${
                      isSel ? "bg-brand-50 ring-1 ring-inset ring-brand-300" : "hover:bg-slate-50"
                    }`}>
                    <td className={`py-2 pr-4 font-mono font-bold text-[11px] ${isSel ? "text-brand-600" : "text-slate-500"}`}>{row.ruta}</td>
                    <td className={`py-2 pr-4 font-semibold ${isSel ? "text-brand-700" : "text-slate-700"}`}>{row.vendedor}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700">{fmtN(row.clientes)}</td>
                    <td className={`py-2 px-3 text-right tabular-nums font-semibold ${pctColor(row.pct_cobertura)}`}>{fmtPct(row.pct_cobertura)}</td>
                    <td className={`py-2 px-3 text-right tabular-nums font-semibold ${pctColor(row.pct_kesimo)}`}>{fmtPct(row.pct_kesimo)}</td>
                    <td className={`py-2 pl-3 text-right tabular-nums font-bold ${growColor(row.pct_crecimiento)}`}>
                      {row.pct_crecimiento > 0 ? "+" : ""}{fmtPct(row.pct_crecimiento)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detalle de ruta ───────────────────────────────────────────────── */}
      {selectedRuta && detalle ? (
        <div className="card">
          {/* Título */}
          <div className="mb-5">
            <h2 className="font-semibold text-slate-700">
              Detalle — <span className="text-brand-600">{selectedRuta.ruta}</span>
              <span className="text-slate-400 font-normal"> · {selectedRuta.vendedor}</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{MESES[mes]} {anho} · Tendencia semanal vs zona segura</p>
          </div>

          {/* Gráfico tendencia */}
          <div className="mb-3" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 600, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAbbr} width={52} />
                <Tooltip
                  formatter={(val: number) => [fmt(val), "Ruta"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                />

                {/* Zona segura (K5 → K2) */}
                <ReferenceArea y1={detalle.k5} y2={detalle.k2} fill="#22c55e" fillOpacity={0.08} />

                {/* Línea K2 (techo) */}
                <ReferenceLine y={detalle.k2} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="5 3"
                  label={{ value: "K2", position: "right", fill: "#16a34a", fontSize: 10, fontWeight: 700 }} />

                {/* Línea K5 (piso) */}
                <ReferenceLine y={detalle.k5} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 3"
                  label={{ value: "K5", position: "right", fill: "#dc2626", fontSize: 10, fontWeight: 700 }} />

                {/* Línea KP (késimo promedio) */}
                <ReferenceLine y={detalle.kp} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2"
                  label={{ value: "KP", position: "right", fill: "#d97706", fontSize: 10, fontWeight: 700 }} />

                {/* Línea de la ruta */}
                <Line
                  type="monotone" dataKey="bs_ruta" stroke="#3b82f6" strokeWidth={2.5}
                  dot={{ r: 5, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 7 }}
                  name="Ruta"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Labels K2 / K5 / KP */}
          <div className="flex flex-wrap gap-5 text-xs mb-5 pb-4 border-b border-slate-100">
            <span className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" />
              <span className="text-slate-500">K2 (techo):</span>
              <span className="font-bold text-emerald-600">{fmt(detalle.k2)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-red-500 inline-block rounded" />
              <span className="text-slate-500">K5 (piso):</span>
              <span className="font-bold text-red-500">{fmt(detalle.k5)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-amber-400 inline-block rounded" />
              <span className="text-slate-500">KP (promedio):</span>
              <span className="font-bold text-amber-600">{fmt(detalle.kp)}</span>
            </span>
            <span className="flex items-center gap-2 ml-auto">
              <AlertCircle size={11} className={
                detalle.semanas.some(s => s.bs_ruta < detalle.k5)
                  ? "text-red-500" : "text-emerald-500"
              } />
              <span className={`font-semibold text-[11px] ${
                detalle.semanas.some(s => s.bs_ruta < detalle.k5)
                  ? "text-red-500" : "text-emerald-600"
              }`}>
                {detalle.semanas.some(s => s.bs_ruta < detalle.k5)
                  ? "Por debajo de la zona segura en alguna semana"
                  : "Dentro o por encima de la zona segura"}
              </span>
            </span>
          </div>

          {/* Tabla semanas */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-80">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left py-2 pr-6 font-semibold w-16"></th>
                  {detalle.semanas.map(s => (
                    <th key={s.semana} className="text-right py-2 px-4 font-semibold text-slate-600">Sem {s.semana}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-6 font-bold text-slate-500 text-[11px] uppercase tracking-wide">Nro. Pedidos</td>
                  {detalle.semanas.map(s => (
                    <td key={s.semana} className="py-2 px-4 text-right font-semibold text-slate-800 tabular-nums">{fmtN(s.pedidos)}</td>
                  ))}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-6 font-bold text-slate-500 text-[11px] uppercase tracking-wide">Cantidad Bs.</td>
                  {detalle.semanas.map(s => (
                    <td key={s.semana} className={`py-2 px-4 text-right font-bold tabular-nums ${
                      s.bs_ruta >= detalle.k2 ? "text-emerald-600"
                      : s.bs_ruta >= detalle.k5 ? "text-slate-800"
                      : "text-red-500"
                    }`}>{fmt(s.bs)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card text-center text-slate-400 text-sm py-10 flex items-center justify-center gap-2">
          <MapPin size={14} />
          Seleccioná una ruta para ver su tendencia semanal
        </div>
      )}
    </DashboardLayout>
  );
}
