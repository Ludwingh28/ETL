import { useState } from "react";
import { Download, FileSpreadsheet, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import type { AuthContextValue } from "../types";

const API_BASE =
  import.meta.env.MODE === "production" ? "/sistemabi/api" : "http://localhost:8000/api";

interface DescargaSection {
  key: string;
  titulo: string;
  descripcion: string;
  endpoint: string;
  nombreArchivo: string;
}

const SECCIONES: DescargaSection[] = [
  {
    key: "combo-armado",
    titulo: "Ventas Efectivas con Combo Armado",
    descripcion: "Exporta todas las ventas con productos de tipo COMBO en el rango de fechas seleccionado.",
    endpoint: "exportar/ventas-combo-armado",
    nombreArchivo: "ventas_combo_armado",
  },
];

function SeccionDescarga({ seccion }: { seccion: DescargaSection }) {
  const { token } = useAuth() as AuthContextValue;
  const now = new Date();
  const primerDiaMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const hoy = now.toISOString().slice(0, 10);

  const [fechaDesde, setFechaDesde] = useState(primerDiaMes);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDescargar = async () => {
    setError("");
    if (!fechaDesde || !fechaHasta) { setError("Debes seleccionar ambas fechas."); return; }
    if (fechaDesde > fechaHasta) { setError("La fecha de inicio no puede ser mayor a la fecha fin."); return; }

    setLoading(true);
    const filename = `${seccion.nombreArchivo}_${fechaDesde}_${fechaHasta}.xlsx`;

    window.dispatchEvent(new CustomEvent("dl:start", {
      detail: { name: filename, titulo: seccion.titulo },
    }));

    try {
      const res = await fetch(
        `${API_BASE}/${seccion.endpoint}/?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`,
        { headers: { Authorization: `Token ${token ?? ""}` } }
      );

      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
      if (!res.body) throw new Error("No se pudo leer la respuesta.");

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const blob = new Blob(chunks, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
          <FileSpreadsheet size={20} className="text-brand-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{seccion.titulo}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{seccion.descripcion}</p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => { setFechaDesde(e.target.value); setError(""); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => { setFechaHasta(e.target.value); setError(""); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-xs">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleDescargar}
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
      </div>
    </div>
  );
}

export default function DescargaArchivos() {
  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Descargar Archivos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Selecciona el rango de fechas y descarga el archivo en formato Excel (.xlsx).
          </p>
        </div>
        {SECCIONES.map((s) => (
          <SeccionDescarga key={s.key} seccion={s} />
        ))}
      </div>
    </DashboardLayout>
  );
}
