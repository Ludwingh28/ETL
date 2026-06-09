import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Calendar, ChevronLeft, ChevronRight, Search, Warehouse } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../context/AuthContext";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AlmacenOption {
  codigo: string;
  nombre: string;
  ciudad: string;
}

interface InventarioRow {
  almacen:        string;
  cod_interno:    string;
  producto:       string;
  u_medida:       string;
  stock_buenos:   number;
  stock_danhados: number;
  stock_vencidos: number;
  stock_total:    number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const REGIONALES = [
  { value: "nacional",   label: "Nacional"   },
  { value: "santa_cruz", label: "Santa Cruz" },
  { value: "cochabamba", label: "Cochabamba" },
  { value: "la_paz",     label: "La Paz"     },
];

const MESES_CAL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                   "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_CAL  = ["Lu","Ma","Mi","Ju","Vi","Sa","Do"];
const MESES_SHORT = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toISO = (d: Date) => d.toISOString().slice(0, 10);
const N = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const fmtN = (n: number) => N.format(Math.round(n));

function fmtFechaLarga(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d} ${MESES_SHORT[parseInt(m)]} ${y}`;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Day Picker ───────────────────────────────────────────────────────────────

function DayPicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  const [nav,  setNav]  = useState(() => {
    const d = new Date(value + "T00:00:00");
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const ref   = useRef<HTMLDivElement>(null);
  const today = toISO(new Date());

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function prevM() { setNav(n => n.month === 0 ? { year: n.year - 1, month: 11 } : { ...n, month: n.month - 1 }); }
  function nextM() { setNav(n => n.month === 11 ? { year: n.year + 1, month: 0 }  : { ...n, month: n.month + 1 }); }

  function days() {
    const arr: (string | null)[] = [];
    const first = new Date(nav.year, nav.month, 1).getDay();
    const off = first === 0 ? 6 : first - 1;
    for (let i = 0; i < off; i++) arr.push(null);
    const total = new Date(nav.year, nav.month + 1, 0).getDate();
    for (let d = 1; d <= total; d++) {
      arr.push(`${nav.year}-${String(nav.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return arr;
  }

  function select(day: string) {
    onChange(day);
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Fecha</label>
      <button
        onClick={() => {
          setOpen(o => !o);
          const d = new Date(value + "T00:00:00");
          setNav({ year: d.getFullYear(), month: d.getMonth() });
        }}
        className="flex items-center gap-2 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-44 transition-all"
      >
        <Calendar size={14} className="text-brand-500 shrink-0" />
        <span>{fmtFechaLarga(value)}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-72">
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevM} className="p-1 rounded-lg hover:bg-slate-100">
              <ChevronLeft size={16} className="text-slate-500" />
            </button>
            <span className="text-sm font-semibold text-slate-700">
              {MESES_CAL[nav.month]} {nav.year}
            </span>
            <button onClick={nextM} className="p-1 rounded-lg hover:bg-slate-100">
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DIAS_CAL.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {days().map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const isSel = day === value;
              const isToday = day === today;
              const isFut = day > today;
              return (
                <button
                  key={day}
                  disabled={isFut}
                  onClick={() => select(day)}
                  className={`text-[12px] font-medium h-8 w-full rounded-lg transition-all
                    ${isFut ? "text-slate-300 cursor-not-allowed" : "cursor-pointer"}
                    ${isSel
                      ? "bg-brand-600 text-white font-bold"
                      : isToday
                        ? "border border-brand-400 text-brand-600"
                        : "hover:bg-slate-100 text-slate-700"}`}
                >
                  {day.split("-")[2].replace(/^0/, "")}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardInventarioAlmacen() {
  const { apiFetch } = useAuth();

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [fecha,    setFecha]    = useState(toISO(new Date()));
  const [regional, setRegional] = useState("nacional");
  const [almacen,  setAlmacen]  = useState("");
  const [almacenes, setAlmacenes] = useState<AlmacenOption[]>([]);

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [rows,    setRows]    = useState<InventarioRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);

  // ── Filtro cliente ────────────────────────────────────────────────────────
  const [busqueda, setBusqueda] = useState("");

  // ── Cargar almacenes al cambiar regional ──────────────────────────────────
  useEffect(() => {
    setAlmacen("");
    setAlmacenes([]);
    if (regional === "nacional") return;
    const qs = new URLSearchParams({ regional });
    apiFetch<{ success: boolean; data: AlmacenOption[] }>(
      `/dashboard/almacenes/lista/?${qs}`
    ).then(j => { if (j.success) setAlmacenes(j.data); }).catch(() => undefined);
  }, [regional]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch datos ───────────────────────────────────────────────────────────
  const fetchDatos = useCallback(async () => {
    setLoading(true);
    setBuscado(false);
    try {
      const qs = new URLSearchParams({ fecha, regional });
      if (almacen) qs.set("almacen", almacen);
      const j = await apiFetch<{ success: boolean; data: InventarioRow[] }>(
        `/dashboard/inventario-almacen/datos/?${qs}`
      );
      if (j.success) setRows(j.data);
    } finally {
      setLoading(false);
      setBuscado(true);
    }
  }, [fecha, regional, almacen, apiFetch]);

  // Auto-fetch cuando cambian los filtros
  useEffect(() => { fetchDatos(); }, [fecha, regional, almacen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtro cliente ────────────────────────────────────────────────────────
  const rowsFiltradas = useMemo(() => {
    if (!busqueda.trim()) return rows;
    const q = busqueda.trim().toLowerCase();
    return rows.filter(r =>
      r.producto.toLowerCase().includes(q) ||
      r.cod_interno.toLowerCase().includes(q) ||
      r.almacen.toLowerCase().includes(q)
    );
  }, [rows, busqueda]);

  const selCls = "text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500";

  // ── Totales ───────────────────────────────────────────────────────────────
  const totales = useMemo(() => ({
    buenos:   rowsFiltradas.reduce((s, r) => s + r.stock_buenos,   0),
    danhados: rowsFiltradas.reduce((s, r) => s + r.stock_danhados, 0),
    vencidos: rowsFiltradas.reduce((s, r) => s + r.stock_vencidos, 0),
    total:    rowsFiltradas.reduce((s, r) => s + r.stock_total,    0),
  }), [rowsFiltradas]);

  return (
    <DashboardLayout>
      <div className="space-y-4">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-bold text-slate-800">Inventario por Almacén</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Stock por producto al {fmtFechaLarga(fecha)}
          </p>
        </div>

        {/* ── Filtros ──────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex flex-wrap gap-3 items-end">

            {/* Fecha */}
            <DayPicker value={fecha} onChange={setFecha} />

            {/* Regional */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Regional</label>
              <select value={regional} onChange={e => setRegional(e.target.value)} className={selCls}>
                {REGIONALES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {/* Almacén */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Almacén</label>
              <select value={almacen} onChange={e => setAlmacen(e.target.value)} className={selCls}>
                <option value="">Todos</option>
                {almacenes.map(a => <option key={a.codigo} value={a.codigo}>{a.nombre}</option>)}
              </select>
            </div>

            {/* Buscador */}
            <div className="flex flex-col gap-1 flex-1 min-w-48">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Buscar</label>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Producto o código…"
                  className="w-full pl-7 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

          </div>
        </div>

        {/* ── Tabla ────────────────────────────────────────────────────── */}
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Almacén</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Cód. Interno</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap min-w-56">Producto</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">U. Medida</th>
                  <th className="text-right px-3 py-3 font-semibold text-emerald-600 whitespace-nowrap">Stock Buenos</th>
                  <th className="text-right px-3 py-3 font-semibold text-amber-600 whitespace-nowrap">Stock Dañados</th>
                  <th className="text-right px-3 py-3 font-semibold text-red-500 whitespace-nowrap">Stock Vencidos</th>
                  <th className="text-right px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Stock Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8}><Spinner /></td></tr>
                ) : rowsFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Warehouse size={36} className="text-slate-300" />
                        <p className="text-sm font-medium text-slate-400">
                          {buscado ? "Sin registros de inventario para esta fecha" : "Seleccioná una fecha para ver el inventario"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rowsFiltradas.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">{row.almacen}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-500">{row.cod_interno}</td>
                      <td className="px-3 py-2.5 text-slate-800">{row.producto}</td>
                      <td className="px-3 py-2.5 text-center text-slate-500">{row.u_medida}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{fmtN(row.stock_buenos)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${row.stock_danhados > 0 ? "font-semibold text-amber-600" : "text-slate-300"}`}>
                        {fmtN(row.stock_danhados)}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${row.stock_vencidos > 0 ? "font-semibold text-red-500" : "text-slate-300"}`}>
                        {fmtN(row.stock_vencidos)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-800">{fmtN(row.stock_total)}</td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Fila de totales */}
              {!loading && rowsFiltradas.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
                    <td colSpan={4} className="px-3 py-2.5 text-slate-500">
                      Total — {rowsFiltradas.length} producto{rowsFiltradas.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{fmtN(totales.buenos)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${totales.danhados > 0 ? "text-amber-600" : "text-slate-300"}`}>{fmtN(totales.danhados)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${totales.vencidos > 0 ? "text-red-500" : "text-slate-300"}`}>{fmtN(totales.vencidos)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{fmtN(totales.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
