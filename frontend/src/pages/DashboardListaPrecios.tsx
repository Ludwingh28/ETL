import { useState, useMemo, useEffect } from "react";
import { Search, Tag, TrendingUp, TrendingDown } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import { setActiveFilters } from "../utils/filterStore";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProductoPrecio {
  cod_interno:   string;
  cod_barra:     string;
  categoria:     string;
  subcategoria:  string;
  marca:         string;
  estado:        "ACTIVO" | "LIQUIDACION";
  origen:        "LOCAL" | "IMPORTADO";
  producto:      string;
  costo:         number;
  pvp:           number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ANHOS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const CANALES = [
  { value: "",        label: "Todos los canales" },
  { value: "DTS",     label: "DTS"     },
  { value: "DTS-NOC", label: "DTS-NOC" },
  { value: "WHS",     label: "WHS"     },
  { value: "SPM",     label: "SPM"     },
  { value: "HORECA",  label: "HORECA"  },
  { value: "CORP",    label: "CORP"    },
  { value: "PROV",    label: "PROV"    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BS  = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtBs  = (n: number) => `${BS.format(n)}`;
const fmtPct = (n: number) => `${PCT.format(n)}%`;

function margen(costo: number, pvp: number) {
  const bs  = pvp - costo;
  const pct = costo > 0 ? (bs / costo) * 100 : 0;
  return { bs, pct };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: "ACTIVO" | "LIQUIDACION" }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold
      ${estado === "ACTIVO"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-amber-100 text-amber-700"}`}>
      {estado}
    </span>
  );
}

function OrigenBadge({ origen }: { origen: "LOCAL" | "IMPORTADO" }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold
      ${origen === "LOCAL"
        ? "bg-blue-100 text-blue-700"
        : "bg-purple-100 text-purple-700"}`}>
      {origen}
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardListaPrecios() {
  // ── Filtros principales ───────────────────────────────────────────────────
  const [anho,  setAnho]  = useState(new Date().getFullYear());
  const [mes,   setMes]   = useState(new Date().getMonth() + 1);
  const [canal, setCanal] = useState("");

  // ── Filtros de tabla (cliente) ────────────────────────────────────────────
  const [busqueda,       setBusqueda]       = useState("");
  const [filtroEstado,   setFiltroEstado]   = useState<"" | "ACTIVO" | "LIQUIDACION">("");
  const [filtroOrigen,   setFiltroOrigen]   = useState<"" | "LOCAL" | "IMPORTADO">("");
  const [filtroCategoria, setFiltroCategoria] = useState("");

  useEffect(() => {
    setActiveFilters({ anho, mes, canal, busqueda, filtroEstado, filtroOrigen, filtroCategoria });
  }, [anho, mes, canal, busqueda, filtroEstado, filtroOrigen, filtroCategoria]);

  // ── Datos (vacíos hasta que se conecte el backend) ────────────────────────
  const datos: ProductoPrecio[] = [];

  // ── Filtrado cliente ──────────────────────────────────────────────────────
  const datosFiltrados = useMemo(() => {
    let rows = datos;
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      rows = rows.filter(r =>
        r.producto.toLowerCase().includes(q)     ||
        r.cod_interno.toLowerCase().includes(q)  ||
        r.cod_barra.includes(q)                  ||
        r.marca.toLowerCase().includes(q)
      );
    }
    if (filtroEstado)    rows = rows.filter(r => r.estado === filtroEstado);
    if (filtroOrigen)    rows = rows.filter(r => r.origen === filtroOrigen);
    if (filtroCategoria) rows = rows.filter(r => r.categoria === filtroCategoria);
    return rows;
  }, [datos, busqueda, filtroEstado, filtroOrigen, filtroCategoria]);

  const categorias = useMemo(() => [...new Set(datos.map(r => r.categoria))].sort(), [datos]);

  const selCls = "text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <DashboardLayout>
      <div className="space-y-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-bold text-slate-800">Lista de Precios</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Costos, PVP y márgenes por producto · {MESES[mes]} {anho}
          </p>
        </div>

        {/* ── Filtros principales ─────────────────────────────────────────── */}
        <div className="card">
          <div className="flex flex-wrap gap-3 items-end">

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Gestión</label>
              <select value={anho} onChange={e => setAnho(+e.target.value)} className={selCls}>
                {ANHOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mes</label>
              <select value={mes} onChange={e => setMes(+e.target.value)} className={selCls}>
                {MESES.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Canal</label>
              <select value={canal} onChange={e => setCanal(e.target.value)} className={selCls}>
                {CANALES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

          </div>
        </div>

        {/* ── Filtros de tabla ────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex flex-wrap gap-3 items-end">

            {/* Búsqueda texto */}
            <div className="flex flex-col gap-1 flex-1 min-w-48">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Buscar</label>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Producto, código, marca…"
                  className="w-full pl-7 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Categoría */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Categoría</label>
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className={selCls}>
                <option value="">Todas</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Estado */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Estado</label>
              <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as typeof filtroEstado)} className={selCls}>
                <option value="">Todos</option>
                <option value="ACTIVO">ACTIVO</option>
                <option value="LIQUIDACION">LIQUIDACION</option>
              </select>
            </div>

            {/* Origen */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Origen</label>
              <select value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value as typeof filtroOrigen)} className={selCls}>
                <option value="">Todos</option>
                <option value="LOCAL">LOCAL</option>
                <option value="IMPORTADO">IMPORTADO</option>
              </select>
            </div>

          </div>
        </div>

        {/* ── Tabla ───────────────────────────────────────────────────────── */}
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Cod. Interno</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Cod. Barra</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Categoría</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">SubCategoría</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Marca</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Estado</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Origen</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-500 whitespace-nowrap min-w-52">Producto</th>
                  <th className="text-right px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Costo (Bs)</th>
                  <th className="text-right px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">PVP (Bs)</th>
                  <th className="text-right px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Margen Bs</th>
                  <th className="text-right px-3 py-3 font-semibold text-slate-500 whitespace-nowrap">Margen %</th>
                </tr>
              </thead>
              <tbody>
                {datosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-300">
                        <Tag size={36} />
                        <p className="text-sm font-medium text-slate-400">Sin datos disponibles</p>
                        <p className="text-xs text-slate-300">Los precios se cargarán cuando el backend esté listo</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  datosFiltrados.map((row, i) => {
                    const { bs, pct } = margen(row.costo, row.pvp);
                    const positivo = bs >= 0;
                    return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-slate-600">{row.cod_interno}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-500">{row.cod_barra}</td>
                        <td className="px-3 py-2.5 text-slate-600">{row.categoria}</td>
                        <td className="px-3 py-2.5 text-slate-500">{row.subcategoria}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-700">{row.marca}</td>
                        <td className="px-3 py-2.5"><EstadoBadge estado={row.estado} /></td>
                        <td className="px-3 py-2.5"><OrigenBadge origen={row.origen} /></td>
                        <td className="px-3 py-2.5 font-medium text-slate-800 min-w-52">{row.producto}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmtBs(row.costo)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800">{fmtBs(row.pvp)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${positivo ? "text-emerald-600" : "text-red-500"}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {positivo ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {fmtBs(bs)}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${positivo ? "text-emerald-600" : "text-red-500"}`}>
                          {fmtPct(pct)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer con contador */}
          {datosFiltrados.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
              {datosFiltrados.length} producto{datosFiltrados.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
