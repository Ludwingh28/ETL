import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl from 'maplibre-gl'
import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, MapPin, AlertCircle, Layers, ChevronDown, Filter } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ClienteGeo {
  lat:           number
  lng:           number
  nombre:        string
  codigo:        string
  clasificacion: string
}

interface RutaResult {
  ruta:       string
  vendedor:   string
  canal:      string
  supervisor: string
}

interface RutaInfo {
  polygons:      { lat: number; lng: number }[][]
  clientes:      number
  vendedor:      string
  vendedorCorto: string
  dia:           string
  canal:         string
  supervisor:    string
  clientesGeo:   ClienteGeo[]
}

interface RutaPoligono {
  ruta:    string
  vendedor: string
  polygon: { lat: number; lng: number }[]
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const NOW       = new Date()
const CUR_YEAR  = NOW.getFullYear()
const CUR_MONTH = NOW.getMonth() + 1  // 1-12

const ANHOS = Array.from({ length: 2 }, (_, i) => CUR_YEAR - i)

const MESES_LABELS: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
  7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
}

function getMeses(anho: number) {
  const max = anho === CUR_YEAR ? CUR_MONTH : 12
  return Array.from({ length: max }, (_, i) => ({ value: i + 1, label: MESES_LABELS[i + 1] }))
}

const REGIONALES = [
  { value: '',           label: 'Todas las regionales' },
  { value: 'santa_cruz', label: 'Santa Cruz'           },
  { value: 'cochabamba', label: 'Cochabamba'            },
  { value: 'la_paz',     label: 'La Paz'               },
]

const CANALES = [
  { value: '',        label: 'Todos los canales' },
  { value: 'DTS',     label: 'DTS'     },
  { value: 'DTS-NOC', label: 'DTS-NOC' },
  { value: 'WHS',     label: 'WHS'     },
  { value: 'SPM',     label: 'SPM'     },
  { value: 'HORECA',  label: 'HORECA'  },
  { value: 'CORP',    label: 'CORP'    },
  { value: 'PROV',    label: 'PROV'    },
]

// Mapeo de "N-XX" → etiqueta legible
const DIA_LABEL: Record<string, string> = {
  '1-Lu': 'Lunes',
  '2-Ma': 'Martes',
  '3-Mi': 'Miércoles',
  '4-Ju': 'Jueves',
  '5-Vi': 'Viernes',
  '6-Sa': 'Sábado',
  '7-Do': 'Domingo',
}

const SELECT_CLS =
  'text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'

// ─── MapLibre GL ──────────────────────────────────────────────────────────────

const MAP_STYLE      = 'https://tiles.openfreemap.org/styles/liberty'
const DEFAULT_CENTER : [number, number] = [-63.18, -17.78]
const DEFAULT_ZOOM   = 12
const POLY_SOURCE    = 'ruta-source'
const FILL_ID        = 'ruta-fill'
const LINE_ID        = 'ruta-line'
const LABEL_ID       = 'ruta-label'
const CLI_SOURCE     = 'cli-source'
const CLI_LAYER      = 'cli-layer'

interface MapViewProps {
  polygons:      { lat: number; lng: number }[][]
  rutaNombre:    string
  vendedorCorto: string
  clientesGeo:   ClienteGeo[]
  todasRutas:    RutaPoligono[]
}

function MapView({ polygons, rutaNombre, vendedorCorto, clientesGeo, todasRutas }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const popupRef     = useRef<maplibregl.Popup | null>(null)

  // Inicializar mapa una vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container:          containerRef.current,
      style:              MAP_STYLE,
      center:             DEFAULT_CENTER,
      zoom:               DEFAULT_ZOOM,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      // Polígonos de rutas
      map.addSource(POLY_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: FILL_ID, type: 'fill', source: POLY_SOURCE,
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.18 } })
      map.addLayer({ id: LINE_ID, type: 'line', source: POLY_SOURCE,
        paint: { 'line-color': '#2563eb', 'line-width': 2 } })
      map.addLayer({
        id: LABEL_ID, type: 'symbol', source: POLY_SOURCE,
        layout: {
          'text-field':    ['concat', ['get', 'nombre'], '\n', ['get', 'vendedor']],
          'text-size':     11,
          'text-font':     ['Noto Sans Bold', 'Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-anchor':   'center',
          'text-optional': true,
        },
        paint: { 'text-color': '#1e293b', 'text-halo-color': '#fff', 'text-halo-width': 2 },
      })

      // Puntos de clientes
      map.addSource(CLI_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: CLI_LAYER, type: 'circle', source: CLI_SOURCE,
        paint: {
          'circle-radius':       5,
          'circle-color':        '#ef4444',
          'circle-opacity':      0.85,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
        },
      })

      // Popup al hacer click en un cliente
      map.on('click', CLI_LAYER, (e) => {
        const feat = e.features?.[0]
        if (!feat) return
        const { nombre, codigo, clasificacion } = feat.properties as {
          nombre: string; codigo: string; clasificacion: string
        }
        if (popupRef.current) popupRef.current.remove()
        popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:system-ui,sans-serif;padding:2px 0">
              <div style="font-weight:700;font-size:13px;color:#1e293b;margin-bottom:6px;line-height:1.3">${nombre || '(sin nombre)'}</div>
              <div style="font-size:11px;color:#64748b;margin-bottom:3px">
                <span style="font-weight:600">Código:</span> ${codigo || '—'}
              </div>
              <div style="font-size:11px;color:#64748b">
                <span style="font-weight:600">Clasificación:</span>
                <span style="display:inline-block;margin-left:4px;padding:1px 6px;border-radius:9999px;background:#f1f5f9;color:#475569;font-weight:600">${clasificacion || '—'}</span>
              </div>
            </div>
          `)
          .addTo(map)
      })

      // Cursor pointer al hovear
      map.on('mouseenter', CLI_LAYER, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', CLI_LAYER, () => { map.getCanvas().style.cursor = '' })
    })

    mapRef.current = map
    return () => {
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Actualizar polígonos y puntos de clientes juntos
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function apply() {
      if (!map) return

      // — Polígonos —
      const polySrc = map.getSource(POLY_SOURCE) as maplibregl.GeoJSONSource | undefined
      if (polySrc) {
        const allCoords: [number, number][] = []
        const features = todasRutas.length > 0
          ? todasRutas
              .filter(r => r.polygon.length >= 3)
              .map(r => {
                const coords = r.polygon.map(p => [p.lng, p.lat] as [number, number])
                coords.push(coords[0])
                allCoords.push(...coords)
                return {
                  type:       'Feature'  as const,
                  properties: { nombre: r.ruta, vendedor: r.vendedor },
                  geometry:   { type: 'Polygon' as const, coordinates: [coords] },
                }
              })
          : polygons
              .filter(pts => pts.length >= 3)
              .map((pts, i) => {
                const coords = pts.map(p => [p.lng, p.lat] as [number, number])
                coords.push(coords[0])
                allCoords.push(...coords)
                return {
                  type:       'Feature' as const,
                  properties: { nombre: i === 0 ? rutaNombre : '', vendedor: i === 0 ? vendedorCorto : '' },
                  geometry:   { type: 'Polygon' as const, coordinates: [coords] },
                }
              })
        polySrc.setData({ type: 'FeatureCollection', features })
        if (allCoords.length > 0) {
          const bounds = allCoords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(allCoords[0], allCoords[0])
          )
          map.fitBounds(bounds, { padding: 56, maxZoom: todasRutas.length > 1 ? 13 : 16 })
        }
      }

      // — Clientes —
      const cliSrc = map.getSource(CLI_SOURCE) as maplibregl.GeoJSONSource | undefined
      if (cliSrc) {
        cliSrc.setData({
          type: 'FeatureCollection',
          features: clientesGeo.map(c => ({
            type:       'Feature'  as const,
            properties: { nombre: c.nombre, codigo: c.codigo, clasificacion: c.clasificacion },
            geometry:   { type: 'Point' as const, coordinates: [c.lng, c.lat] as [number, number] },
          })),
        })
      }

      // Cerrar popup anterior si los datos cambian
      popupRef.current?.remove()
    }

    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygons, rutaNombre, vendedorCorto, todasRutas, clientesGeo])

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ sm }: { sm?: boolean }) {
  const s = sm ? 'w-4 h-4 border-2' : 'w-7 h-7 border-4'
  return <div className={`${s} border-brand-500 border-t-transparent rounded-full animate-spin`} />
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardDistribucionRutas() {
  const { apiFetch } = useAuth()

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [anho,         setAnho]         = useState(CUR_YEAR)
  const [mes,          setMes]          = useState(CUR_MONTH)
  const [regional,     setRegional]     = useState('')
  const [canal,        setCanal]        = useState('')
  const [dia,          setDia]          = useState('')
  const [supervisor,   setSupervisor]   = useState('')
  const [supervisores, setSupervisores] = useState<string[]>([])
  const [diasDisp,     setDiasDisp]     = useState<string[]>([])
  const [loadingSups,  setLoadingSups]  = useState(false)

  // ── Búsqueda de ruta ──────────────────────────────────────────────────────
  const [searchQ,       setSearchQ]       = useState('')
  const [vendedorQ,     setVendedorQ]     = useState('')
  const [rutaResults,   setRutaResults]   = useState<RutaResult[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [selectedRuta,  setSelectedRuta]  = useState<string | null>(null)
  const [comboOpen,     setComboOpen]     = useState(false)
  const comboRef = useRef<HTMLDivElement>(null)

  // ── Combobox vendedor ─────────────────────────────────────────────────────
  const [vendedorComboOpen,   setVendedorComboOpen]   = useState(false)
  const [vendedorSearchQ,     setVendedorSearchQ]     = useState('')
  const [vendedorOptions,     setVendedorOptions]     = useState<string[]>([])
  const [loadingVendedores,   setLoadingVendedores]   = useState(false)
  const vendedorComboRef = useRef<HTMLDivElement>(null)

  // ── Info ruta individual ──────────────────────────────────────────────────
  const [rutaInfo,    setRutaInfo]    = useState<RutaInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [infoError,   setInfoError]   = useState<string | null>(null)

  // ── Modo "ver todas" ──────────────────────────────────────────────────────
  const [verTodas,          setVerTodas]          = useState(false)
  const [todasRutas,        setTodasRutas]        = useState<RutaPoligono[]>([])
  const [todasClientesGeo,  setTodasClientesGeo]  = useState<ClienteGeo[]>([])
  const [loadingTodas,      setLoadingTodas]      = useState(false)
  const [todasError,        setTodasError]        = useState<string | null>(null)

  // ── Filtro de clasificación de cliente ───────────────────────────────────
  const [clasificacionFilter, setClasificacionFilter] = useState('')

  // ── Cerrar combos al click fuera ─────────────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node))
        setComboOpen(false)
      if (vendedorComboRef.current && !vendedorComboRef.current.contains(e.target as Node))
        setVendedorComboOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // ── Cargar supervisores y días cuando cambia canal o regional ────────────
  useEffect(() => {
    setSupervisor('')
    setSupervisores([])
    setLoadingSups(true)
    void (async () => {
      try {
        const p = new URLSearchParams()
        if (canal)    p.set('canal',    canal)
        if (regional) p.set('regional', regional)
        const j = await apiFetch<{ success: boolean; supervisores: string[]; dias: string[] }>(
          `/dashboard/distribucion-rutas/opciones/?${p}`
        )
        if (j.success) {
          setSupervisores(j.supervisores)
          setDiasDisp(j.dias ?? [])
        }
      } catch {
        // silencioso
      } finally {
        setLoadingSups(false)
      }
    })()
  }, [canal, regional, apiFetch])


  // ── Opciones de vendedor para combobox ───────────────────────────────────
  useEffect(() => {
    if (!vendedorComboOpen) return
    const hasCtxFilter = !!(canal || regional || supervisor || dia)
    // Require at least 2 chars if no context filter; otherwise fetch freely
    if (!hasCtxFilter && vendedorSearchQ.length < 2) {
      setVendedorOptions([]); setLoadingVendedores(false); return
    }
    setLoadingVendedores(true)
    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams()
        if (regional)                p.set('regional',   regional)
        if (canal)                   p.set('canal',      canal)
        if (supervisor)              p.set('supervisor', supervisor)
        if (dia)                     p.set('dia',        dia)
        if (vendedorSearchQ.length)  p.set('vendedor',   vendedorSearchQ)
        const j = await apiFetch<{ success: boolean; data: RutaResult[] }>(
          `/dashboard/distribucion-rutas/buscar/?${p}`
        )
        if (j.success) {
          const unique = [...new Set(j.data.map(r => r.vendedor).filter(Boolean))]
          setVendedorOptions(unique)
        }
      } catch {
        setVendedorOptions([])
      } finally {
        setLoadingVendedores(false)
      }
    }, 200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedorComboOpen, vendedorSearchQ, regional, canal, supervisor, dia, apiFetch])

  // ── Buscar rutas (modo individual) ────────────────────────────────────────
  useEffect(() => {
    if (verTodas) return
    const hasFilter = !!(regional || canal || supervisor || dia
                         || searchQ.length >= 2 || vendedorQ.length >= 2)
    if (!hasFilter) { setRutaResults([]); setLoadingSearch(false); return }
    setLoadingSearch(true)

    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams()
        if (regional)               p.set('regional',  regional)
        if (canal)                  p.set('canal',     canal)
        if (supervisor)             p.set('supervisor',supervisor)
        if (dia)                    p.set('dia',       dia)
        if (vendedorQ.length >= 2)  p.set('vendedor',  vendedorQ)
        if (searchQ.length >= 2)    p.set('q',         searchQ)
        const j = await apiFetch<{ success: boolean; data: RutaResult[] }>(
          `/dashboard/distribucion-rutas/buscar/?${p}`
        )
        if (j.success) setRutaResults(j.data)
      } catch {
        setRutaResults([])
      } finally {
        setLoadingSearch(false)
      }
    }, 200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regional, canal, supervisor, dia, searchQ, vendedorQ, verTodas, apiFetch])

  // ── Cargar info de ruta individual ────────────────────────────────────────
  useEffect(() => {
    if (!selectedRuta) { setRutaInfo(null); setInfoError(null); return }
    setLoadingInfo(true); setInfoError(null)
    void (async () => {
      try {
        const j = await apiFetch<{ success: boolean; error?: string } & RutaInfo>(
          `/dashboard/distribucion-rutas/info/?ruta=${encodeURIComponent(selectedRuta)}`
        )
        if (j.success) {
          setRutaInfo({
            polygons:      j.polygons,
            clientes:      j.clientes,
            vendedor:      j.vendedor,
            vendedorCorto: j.vendedorCorto,
            dia:           j.dia,
            canal:         j.canal,
            supervisor:    j.supervisor,
            clientesGeo:   j.clientesGeo ?? [],
          })
        } else {
          setInfoError(j.error ?? 'Error al cargar la ruta')
        }
      } catch (e) {
        setInfoError(String(e))
      } finally {
        setLoadingInfo(false)
      }
    })()
  }, [selectedRuta, apiFetch])

  // ── Cargar todos los polígonos ────────────────────────────────────────────
  useEffect(() => {
    if (!verTodas) { setTodasRutas([]); setTodasClientesGeo([]); return }
    const hasFiltro = !!(canal || supervisor || regional)
    if (!hasFiltro) { setTodasRutas([]); return }

    setLoadingTodas(true); setTodasError(null)
    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams()
        if (regional)   p.set('regional',   regional)
        if (canal)      p.set('canal',      canal)
        if (supervisor) p.set('supervisor', supervisor)
        if (dia)        p.set('dia',        dia)
        if (vendedorQ)  p.set('vendedor',   vendedorQ)
        const j = await apiFetch<{ success: boolean; error?: string; rutas: RutaPoligono[]; clientesGeo: { lat: number; lng: number }[] }>(
          `/dashboard/distribucion-rutas/todos-poligonos/?${p}`
        )
        if (j.success) {
          setTodasRutas(j.rutas)
          setTodasClientesGeo(j.clientesGeo ?? [])
        } else setTodasError(j.error ?? 'Error al cargar polígonos')
      } catch (e) {
        setTodasError(String(e))
      } finally {
        setLoadingTodas(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [verTodas, regional, canal, supervisor, dia, vendedorQ, apiFetch])

  function selectRuta(r: RutaResult) {
    setSelectedRuta(r.ruta); setSearchQ(r.ruta); setComboOpen(false)
  }

  function clearVendedor() {
    setVendedorQ(''); setVendedorSearchQ(''); setVendedorOptions([])
    setSelectedRuta(null); setSearchQ('')
  }

  function clearRuta() {
    setSelectedRuta(null); setSearchQ('')
    setRutaResults([]); setRutaInfo(null); setInfoError(null)
  }

  function handleVerTodas(v: boolean) {
    setVerTodas(v)
    if (v) clearRuta()
    else setTodasRutas([])
  }

  function resetFilters() {
    setSelectedRuta(null); setSearchQ('')
  }

  const polygons           = rutaInfo?.polygons ?? []
  const hasFiltroParaTodas = !!(canal || supervisor || regional || vendedorQ)

  // Clasificaciones únicas del conjunto actual de clientes
  const clasificaciones = useMemo(() => {
    const raw = verTodas ? todasClientesGeo : (rutaInfo?.clientesGeo ?? [])
    return [...new Set(raw.map(c => c.clasificacion).filter(Boolean))].sort()
  }, [verTodas, todasClientesGeo, rutaInfo])

  // Clientes filtrados por clasificación (se pasan al mapa)
  const clientesGeoFiltrados = useMemo(() => {
    const raw = verTodas ? todasClientesGeo : (rutaInfo?.clientesGeo ?? [])
    return clasificacionFilter ? raw.filter(c => c.clasificacion === clasificacionFilter) : raw
  }, [verTodas, todasClientesGeo, rutaInfo, clasificacionFilter])
  const hasPolygon   = polygons.some(p => p.length >= 3) || todasRutas.some(r => r.polygon.length >= 3)

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-bold text-slate-800">Distribución de Rutas</h1>
          <p className="text-xs text-slate-400 mt-0.5">Polígono de cobertura y estadísticas por ruta</p>
        </div>

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gestión</label>
              <select
                value={anho}
                onChange={e => { setAnho(+e.target.value); setMes(1); resetFilters() }}
                className={SELECT_CLS}
              >
                {ANHOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mes</label>
              <select
                value={mes}
                onChange={e => { setMes(+e.target.value); resetFilters() }}
                className={SELECT_CLS}
              >
                {getMeses(anho).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Regional</label>
              <select
                value={regional}
                onChange={e => { setRegional(e.target.value); resetFilters() }}
                className={SELECT_CLS}
              >
                {REGIONALES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Canal</label>
              <select
                value={canal}
                onChange={e => { setCanal(e.target.value); resetFilters() }}
                className={SELECT_CLS}
              >
                {CANALES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Día</label>
              <select
                value={dia}
                onChange={e => { setDia(e.target.value); resetFilters() }}
                className={SELECT_CLS}
              >
                <option value="">Todos los días</option>
                {diasDisp.map(d => (
                  <option key={d} value={d}>{DIA_LABEL[d] ?? d}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Supervisor
                {loadingSups && <span className="ml-1 text-[10px] font-normal text-slate-300">cargando…</span>}
              </label>
              <select
                value={supervisor}
                onChange={e => { setSupervisor(e.target.value); resetFilters() }}
                className={SELECT_CLS}
                disabled={loadingSups}
              >
                <option value="">Todos los supervisores</option>
                {supervisores.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

          </div>

        </div>

        {/* ── Buscador de ruta (solo en modo individual) ──────────────────── */}
        {!verTodas && (
          <div className="card">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Seleccionar ruta</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* Combobox vendedor */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vendedor</label>
                <div className="relative" ref={vendedorComboRef}>

                  {/* Trigger */}
                  <button
                    type="button"
                    onClick={() => setVendedorComboOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                  >
                    <span className={vendedorQ ? 'text-slate-800 font-medium truncate' : 'text-slate-400'}>
                      {vendedorQ || 'Seleccionar vendedor…'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {vendedorQ && (
                        <span
                          role="button"
                          onClick={e => { e.stopPropagation(); clearVendedor() }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={13} />
                        </span>
                      )}
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${vendedorComboOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Panel desplegable */}
                  {vendedorComboOpen && (
                    <div className="absolute z-50 mt-1 w-full min-w-70 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">

                      {/* Búsqueda interna */}
                      <div className="p-2 border-b border-slate-100">
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            autoFocus
                            type="text"
                            value={vendedorSearchQ}
                            onChange={e => setVendedorSearchQ(e.target.value)}
                            placeholder="Buscar vendedor…"
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                      </div>

                      {/* Resultados */}
                      {loadingVendedores ? (
                        <div className="flex items-center justify-center gap-2 py-5 text-sm text-slate-400">
                          <Spinner sm /> Buscando…
                        </div>
                      ) : vendedorOptions.length === 0 ? (
                        <div className="py-5 text-center text-sm text-slate-400">
                          {(canal || regional || supervisor || dia) || vendedorSearchQ.length >= 2
                            ? 'Sin vendedores encontrados'
                            : 'Seleccioná un filtro o escribí 2 caracteres'}
                        </div>
                      ) : (
                        <ul className="max-h-56 overflow-y-auto">
                          {vendedorOptions.map(v => (
                            <li
                              key={v}
                              onMouseDown={() => {
                                setVendedorQ(v)
                                setVendedorSearchQ('')
                                setVendedorOptions([])
                                setVendedorComboOpen(false)
                                setSelectedRuta(null)
                                setSearchQ('')
                              }}
                              className={`px-3 py-2.5 cursor-pointer text-sm transition-colors
                                ${vendedorQ === v ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'}`}
                            >
                              {v}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Combobox ruta */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ruta</label>
                <div className="relative" ref={comboRef}>

                  {/* Trigger */}
                  <button
                    type="button"
                    onClick={() => setComboOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                  >
                    <span className={selectedRuta ? 'text-slate-800 font-medium truncate' : 'text-slate-400'}>
                      {selectedRuta ?? 'Seleccionar ruta…'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedRuta && (
                        <span
                          role="button"
                          onClick={e => { e.stopPropagation(); clearRuta() }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={13} />
                        </span>
                      )}
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${comboOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Panel desplegable */}
                  {comboOpen && (
                    <div className="absolute z-50 mt-1 w-full min-w-[320px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">

                      {/* Búsqueda interna */}
                      <div className="p-2 border-b border-slate-100">
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            autoFocus
                            type="text"
                            value={searchQ}
                            onChange={e => { setSearchQ(e.target.value); setSelectedRuta(null) }}
                            placeholder="Buscar ruta…"
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                      </div>

                      {/* Resultados */}
                      {loadingSearch ? (
                        <div className="flex items-center justify-center gap-2 py-5 text-sm text-slate-400">
                          <Spinner sm /> Buscando…
                        </div>
                      ) : rutaResults.length === 0 ? (
                        <div className="py-5 text-center text-sm text-slate-400">
                          {(regional || canal || supervisor || dia || searchQ.length >= 2 || vendedorQ.length >= 2)
                            ? 'Sin rutas para los filtros aplicados'
                            : 'Aplicá un filtro o escribí para buscar'}
                        </div>
                      ) : (
                        <>
                          <ul className="max-h-64 overflow-y-auto">
                            {rutaResults.map(r => (
                              <li
                                key={r.ruta}
                                onMouseDown={() => { selectRuta(r); setComboOpen(false) }}
                                className={`flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer transition-colors
                                  ${selectedRuta === r.ruta ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                              >
                                <div className="min-w-0">
                                  <p className={`text-sm font-semibold truncate ${selectedRuta === r.ruta ? 'text-brand-700' : 'text-slate-700'}`}>
                                    {r.ruta}
                                  </p>
                                  {r.vendedor && <p className="text-xs text-slate-400 truncate">{r.vendedor}</p>}
                                </div>
                                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                                  {r.canal}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {rutaResults.length >= 60 && (
                            <div className="px-3 py-2 text-xs text-slate-400 bg-slate-50 border-t border-slate-100 text-center">
                              Mostrando los primeros 60 — refiná los filtros para ver más
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Toggle ver todas + filtro clasificación ─────────────────────── */}
        <div className="card space-y-3">

          {/* Fila 1 – checkbox */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={verTodas}
                onChange={e => handleVerTodas(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 accent-brand-600"
              />
              <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Layers size={14} className="text-slate-400" />
                Ver todas las rutas del filtro seleccionado
              </span>
            </label>
            {verTodas && !hasFiltroParaTodas && (
              <span className="text-xs text-amber-500">Seleccioná al menos canal, supervisor, vendedor o regional</span>
            )}
            {loadingTodas && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Spinner sm /> Cargando polígonos…
              </span>
            )}
            {verTodas && !loadingTodas && todasRutas.length > 0 && (
              <span className="text-xs text-slate-500 font-medium">
                {todasRutas.length} ruta{todasRutas.length !== 1 ? 's' : ''} encontradas
              </span>
            )}
            {todasError && (
              <span className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle size={12} /> {todasError}
              </span>
            )}
          </div>

          {/* Fila 2 – filtro clasificación (aparece cuando hay clientes cargados) */}
          {clasificaciones.length > 0 && (
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Filter size={12} /> Clasificación de cliente
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setClasificacionFilter('')}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    !clasificacionFilter
                      ? 'bg-brand-600 border-brand-600 text-white font-semibold'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Todos ({verTodas ? todasClientesGeo.length : (rutaInfo?.clientesGeo ?? []).length})
                </button>
                {clasificaciones.map(cls => {
                  const count = (verTodas ? todasClientesGeo : (rutaInfo?.clientesGeo ?? []))
                    .filter(c => c.clasificacion === cls).length
                  return (
                    <button
                      key={cls}
                      onClick={() => setClasificacionFilter(cls === clasificacionFilter ? '' : cls)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        clasificacionFilter === cls
                          ? 'bg-brand-600 border-brand-600 text-white font-semibold'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {cls} ({count})
                    </button>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* ── Cards de info (ruta individual) ─────────────────────────────── */}
        {selectedRuta && !loadingInfo && rutaInfo && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Clientes en ruta</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{rutaInfo.clientes}</p>
              <p className="text-xs text-slate-400 mt-0.5">clientes activos</p>
            </div>
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vendedor</p>
              <p className="text-base font-bold text-slate-800 mt-1 leading-tight">{rutaInfo.vendedor || '—'}</p>
              <p className="text-xs text-slate-400 mt-0.5">asignado a la ruta</p>
            </div>
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Canal</p>
              <p className="text-xl font-bold text-slate-800 mt-1">{rutaInfo.canal || '—'}</p>
              <p className="text-xs text-slate-400 mt-0.5">canal de distribución</p>
            </div>
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Día de trabajo</p>
              <p className="text-xl font-bold text-slate-800 mt-1 capitalize">{(rutaInfo.dia || '—').toLowerCase()}</p>
              <p className="text-xs text-slate-400 mt-0.5">supervisor: {rutaInfo.supervisor || '—'}</p>
            </div>
          </div>
        )}

        {selectedRuta && loadingInfo && (
          <div className="card flex items-center justify-center py-8 gap-3">
            <Spinner />
            <span className="text-sm text-slate-400">Cargando ruta…</span>
          </div>
        )}

        {infoError && (
          <div className="card flex items-center gap-2 py-4 text-sm text-red-500">
            <AlertCircle size={16} className="shrink-0" />
            {infoError}
          </div>
        )}

        {/* ── Mapa ────────────────────────────────────────────────────────── */}
        <div className="card p-0 overflow-hidden relative" style={{ height: 560 }}>
          {!hasPolygon && !loadingInfo && !loadingTodas && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none bg-slate-50/80 rounded-2xl">
              <MapPin size={28} className="text-slate-300" />
              <p className="text-sm text-slate-400">
                {verTodas
                  ? hasFiltroParaTodas
                    ? 'Sin polígonos disponibles para los filtros seleccionados'
                    : 'Seleccioná canal, supervisor o regional para ver todas las rutas'
                  : selectedRuta
                    ? 'Sin polígono disponible para esta ruta'
                    : 'Seleccioná una ruta para ver su polígono'}
              </p>
            </div>
          )}
          <MapView
            polygons={polygons}
            rutaNombre={selectedRuta ?? ''}
            vendedorCorto={rutaInfo?.vendedorCorto ?? ''}
            clientesGeo={clientesGeoFiltrados}
            todasRutas={verTodas ? todasRutas : []}
          />
        </div>

      </div>
    </DashboardLayout>
  )
}
