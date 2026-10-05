import { useState, useEffect } from "react";
import { Download, FileSpreadsheet, AlertCircle, Filter } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import type { AuthContextValue } from "../types";

const API_BASE =
  import.meta.env.MODE === "production" ? "/sistemabi/api" : "http://localhost:8000/api";

const REGIONALES = [
  { value: "nacional",    label: "Nacional" },
  { value: "santa_cruz",  label: "Santa Cruz" },
  { value: "cochabamba",  label: "Cochabamba" },
  { value: "la_paz",      label: "La Paz" },
];

// ── Card simple (solo rango de fechas) ──────────────────────────────────────

interface SimpleDescarga {
  key: string;
  titulo: string;
  descripcion: string;
  endpoint: string;
}

function SeccionSimple({ sec }: { sec: SimpleDescarga }) {
  const { token } = useAuth() as AuthContextValue;
  const now = new Date();
  const primerDia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const hoy = now.toISOString().slice(0, 10);

  const [desde,   setDesde]   = useState(primerDia);
  const [hasta,   setHasta]   = useState(hoy);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleDescargar = async () => {
    setError("");
    if (!desde || !hasta) { setError("Debes seleccionar ambas fechas."); return; }
    if (desde > hasta)    { setError("La fecha de inicio no puede ser mayor a la fecha fin."); return; }

    setLoading(true);
    const filename = `${sec.endpoint.split("/").pop()}_${desde}_${hasta}.xlsx`;
    window.dispatchEvent(new CustomEvent("dl:start", { detail: { name: filename, titulo: sec.titulo } }));

    try {
      const res = await fetch(
        `${API_BASE}/${sec.endpoint}/?fecha_desde=${desde}&fecha_hasta=${hasta}`,
        { headers: { Authorization: `Token ${token ?? ""}` } },
      );
      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
      if (!res.body) throw new Error("No se pudo leer la respuesta.");

      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const blob = new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      window.dispatchEvent(new CustomEvent("dl:done", { detail: { url, name: filename } }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      setError(msg);
      window.dispatchEvent(new CustomEvent("dl:error"));
    } finally {
      setLoading(false);
    }
  };

  return <CardShell titulo={sec.titulo} descripcion={sec.descripcion} hasFilters={false}>
    <DateRange desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} setError={setError} />
    {error && <ErrorBanner msg={error} />}
    <DownloadBtn loading={loading} onClick={handleDescargar} />
  </CardShell>;
}

// ── Card con filtros (canal + regional) ────────────────────────────────────

function SeccionFiltros() {
  const { token } = useAuth() as AuthContextValue;
  const now = new Date();
  const primerDia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const hoy = now.toISOString().slice(0, 10);

  const [desde,    setDesde]    = useState(primerDia);
  const [hasta,    setHasta]    = useState(hoy);
  const [canal,    setCanal]    = useState("");
  const [regional, setRegional] = useState("nacional");
  const [canales,  setCanales]  = useState<string[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/dashboard/new-nacional/opciones/?regional=nacional&anho=${now.getFullYear()}&mes=${now.getMonth() + 1}`,
      { headers: { Authorization: `Token ${token ?? ""}` } })
      .then(r => r.json())
      .then(j => { if (j.canales) setCanales(j.canales); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDescargar = async () => {
    setError("");
    if (!desde || !hasta) { setError("Debes seleccionar ambas fechas."); return; }
    if (desde > hasta)    { setError("La fecha de inicio no puede ser mayor a la fecha fin."); return; }

    setLoading(true);
    const tag = canal ? `_${canal}_${regional}` : `_${regional}`;
    const filename = `ventas_combo_armado_filtros${tag}_${desde}_${hasta}.xlsx`;
    window.dispatchEvent(new CustomEvent("dl:start", { detail: { name: filename, titulo: "Combo Armado con Filtros" } }));

    try {
      const qs = new URLSearchParams({ fecha_desde: desde, fecha_hasta: hasta, regional });
      if (canal) qs.set("canal", canal);
      const res = await fetch(
        `${API_BASE}/exportar/ventas-combo-armado-filtros/?${qs}`,
        { headers: { Authorization: `Token ${token ?? ""}` } },
      );
      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
      if (!res.body) throw new Error("No se pudo leer la respuesta.");

      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const blob = new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      window.dispatchEvent(new CustomEvent("dl:done", { detail: { url, name: filename } }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      setError(msg);
      window.dispatchEvent(new CustomEvent("dl:error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <CardShell
      titulo="Ventas Combo Armado con Filtros"
      descripcion="Combo armado (precio > 0) filtrado por canal y/o regional."
      hasFilters
    >
      <DateRange desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} setError={setError} />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Canal</label>
          <select
            value={canal}
            onChange={e => setCanal(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Todos los canales</option>
            {canales.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Regional</label>
          <select
            value={regional}
            onChange={e => setRegional(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {REGIONALES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {error && <ErrorBanner msg={error} />}
      <DownloadBtn loading={loading} onClick={handleDescargar} />
    </CardShell>
  );
}

// ── Shared sub-components ───────────────────────────────────────────────────

function CardShell({ titulo, descripcion, hasFilters, children }: {
  titulo: string; descripcion: string; hasFilters: boolean; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
          {hasFilters
            ? <Filter size={20} className="text-brand-600" />
            : <FileSpreadsheet size={20} className="text-brand-600" />}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function DateRange({ desde, hasta, setDesde, setHasta, setError }: {
  desde: string; hasta: string;
  setDesde: (v: string) => void; setHasta: (v: string) => void; setError: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1">
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Desde</label>
        <input type="date" value={desde}
          onChange={e => { setDesde(e.target.value); setError(""); }}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Hasta</label>
        <input type="date" value={hasta}
          onChange={e => { setHasta(e.target.value); setError(""); }}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        />
      </div>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-xs">
      <AlertCircle size={14} className="shrink-0" />
      {msg}
    </div>
  );
}

function DownloadBtn({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors"
    >
      {loading ? (
        <>
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Generando...
        </>
      ) : (
        <>
          <Download size={15} />
          Descargar XLSX
        </>
      )}
    </button>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

const SIMPLES: SimpleDescarga[] = [
  {
    key: "combo-armado",
    titulo: "Ventas Efectivas — Combo Armado",
    descripcion: "Ventas con precio_unitario > 0 en el rango de fechas seleccionado.",
    endpoint: "exportar/ventas-combo-armado",
  },
  {
    key: "combo-desarmado",
    titulo: "Ventas Efectivas — Combo Desarmado",
    descripcion: "Ventas con precio_unitario ≥ 0 (incluye precio cero) en el rango de fechas.",
    endpoint: "exportar/ventas-combo-desarmado",
  },
];

export default function DescargaArchivos() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Descargar Archivos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Selecciona el rango de fechas y descarga el archivo en formato Excel (.xlsx).
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SIMPLES.map(s => <SeccionSimple key={s.key} sec={s} />)}
          <SeccionFiltros />
        </div>
      </div>
    </DashboardLayout>
  );
}
