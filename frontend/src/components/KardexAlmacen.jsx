// Vista de detalle del Kardex de UN almacen, que se abre bajo las tarjetas del
// Dashboard al hacer clic en una. Una fila por codigo (como el kardex fisico):
// su ingreso, el total que salio (TTL / S) y el saldo. Clic en la fila
// despliega cada salida con su N° de guia y fecha.
import { Fragment, useEffect, useRef, useState } from 'react'
import api from '../utils/api'
import { codigoAlmacen, claseCodigoAlmacen } from '../utils/colorAlmacen'

const POR_PAGINA = 200

const fechaCorta = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '')
const num = (v) => Number(v || 0).toLocaleString('es-GT', { maximumFractionDigits: 3 })
const sumaSalidas = (salidas) => (salidas || []).reduce((s, x) => s + (Number(x.cant) || 0), 0)

// Chip del tipo de movimiento: verde ingreso, naranja devolucion, rojo salida.
const TAG = {
  INGRESO:    'bg-green-100 text-green-700 border-green-200',
  DEVOLUCION: 'bg-orange-100 text-orange-700 border-orange-200',
  SALIDA:     'bg-red-100 text-red-700 border-red-200',
}
export const TagTipo = ({ tipo }) => (
  <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TAG[tipo] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
    {tipo}
  </span>
)

// Filas del backend -> una lista con TIPO, TTL/S y SALDO ya calculados.
export const normalizarKardex = (data) => [
  ...(data.ingresos || []).map(f => ({ ...f, tipo: 'INGRESO' })),
  ...(data.devoluciones || []).map(f => ({ ...f, tipo: 'DEVOLUCION' })),
].map(f => {
  const ttl = sumaSalidas(f.salidas)
  return { ...f, codigo: codigoAlmacen(f.item, f.almacen), ttl_s: ttl, saldo: (Number(f.cantidad) || 0) - ttl }
}).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.item).localeCompare(String(b.item), undefined, { numeric: true }))

function Skeleton() {
  return (
    <div className="p-5 space-y-3 animate-pulse">
      <div className="h-9 bg-gray-200 rounded-lg w-1/3" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-6 bg-gray-100 rounded" />
      ))}
    </div>
  )
}

const COLS = ['Codigo', 'Ubicac.', 'Fecha', 'N/I', 'O/C N° Ext.', 'Doc / N°', 'Proveedor', 'Detalle', 'Maquina - Motivo', 'Unid.', 'Tipo', 'Cantidad', 'TTL / S', 'Saldo']

export default function KardexAlmacen({ almacen, onCerrar }) {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [limite, setLimite] = useState(POR_PAGINA)
  const cache = useRef({})
  const panel = useRef(null)

  useEffect(() => {
    setAbierta(null)
    setLimite(POR_PAGINA)
    setError(null)
    panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (cache.current[almacen]) { setFilas(cache.current[almacen]); return }
    setFilas(null)
    let vigente = true
    api.get('/api/reportes/kardex', { params: { almacen } })
      .then(({ data }) => {
        const lista = normalizarKardex(data)
        cache.current[almacen] = lista
        if (vigente) setFilas(lista)
      })
      .catch(err => vigente && setError(err.response?.data?.error || 'No se pudo cargar el kardex'))
    return () => { vigente = false }
  }, [almacen])

  const visibles = filas || []

  return (
    <div ref={panel} className="bg-white rounded-xl shadow-md border border-blue-100 mb-10 overflow-hidden scroll-mt-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-blue-900 text-white">
        <div>
          <h2 className="text-lg font-bold">Kardex — {almacen}</h2>
          <p className="text-xs text-blue-200">
            {filas ? `${visibles.length.toLocaleString()} codigos` : 'Cargando movimientos...'}
          </p>
        </div>
        <button onClick={onCerrar} className="text-blue-100 hover:text-white text-sm border border-blue-400 rounded-lg px-3 py-1.5">
          Cerrar ✕
        </button>
      </div>

      {error && <div className="m-5 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {!error && !filas && <Skeleton />}

      {filas && (
        <>
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-800 text-white sticky top-0 z-10">
                <tr>{COLS.map(c => <th key={c} className="px-3 py-2 text-left font-semibold">{c}</th>)}</tr>
              </thead>
              <tbody>
                {visibles.slice(0, limite).map((f, i) => {
                  const clave = `${f.almacen}-${f.item}`
                  const tieneSalidas = (f.salidas || []).length > 0
                  const anulada = f.estado_guia === 'ANULADA'
                  return (
                    <Fragment key={clave}>
                      <tr
                        onClick={() => tieneSalidas && setAbierta(abierta === clave ? null : clave)}
                        className={`border-b border-gray-100 ${i % 2 ? 'bg-gray-50' : 'bg-white'} ${tieneSalidas ? 'cursor-pointer hover:bg-blue-50' : ''} ${anulada ? 'text-red-600 line-through' : 'text-gray-700'}`}
                      >
                        <td className="px-3 py-2">
                          <span className={`font-mono font-semibold px-1.5 py-0.5 rounded ${claseCodigoAlmacen(f.almacen)}`}>{f.codigo}</span>
                        </td>
                        <td className="px-3 py-2">{f.ubicac}</td>
                        <td className="px-3 py-2">{fechaCorta(f.fecha)}</td>
                        <td className="px-3 py-2">{f.ni}</td>
                        <td className="px-3 py-2">{f.oc_externa}</td>
                        <td className="px-3 py-2">{[f.doc, f.nro_doc].filter(Boolean).join(' ')}</td>
                        <td className="px-3 py-2 max-w-[180px] truncate" title={f.proveedor || ''}>{f.proveedor}</td>
                        <td className="px-3 py-2 max-w-[260px] truncate" title={f.detalle || ''}>{anulada ? 'ANULADA - ' : ''}{f.detalle}</td>
                        <td className="px-3 py-2 max-w-[160px] truncate" title={f.motivo || ''}>{f.motivo}</td>
                        <td className="px-3 py-2">{f.unid_med}</td>
                        <td className="px-3 py-2"><TagTipo tipo={f.tipo} /></td>
                        <td className="px-3 py-2 text-right">{num(f.cantidad)}</td>
                        <td className="px-3 py-2 text-right text-red-600">
                          {f.ttl_s ? num(f.ttl_s) : '-'}
                          {tieneSalidas && <span className="ml-1 text-gray-400">{abierta === clave ? '▾' : '▸'}</span>}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${f.saldo > 0 ? 'text-blue-800' : 'text-gray-400'}`}>{num(f.saldo)}</td>
                      </tr>
                      {abierta === clave && f.salidas.map((s, j) => (
                        <tr key={`${clave}-s${j}`} className="bg-red-50/40 text-gray-600 border-b border-red-100">
                          <td colSpan={2} />
                          <td className="px-3 py-1.5">{fechaCorta(s.fecha)}</td>
                          <td colSpan={2} className="px-3 py-1.5">Nota de salida</td>
                          <td className="px-3 py-1.5 font-semibold">N° {s.guia}</td>
                          <td colSpan={4} />
                          <td className="px-3 py-1.5"><TagTipo tipo="SALIDA" /></td>
                          <td />
                          <td className="px-3 py-1.5 text-right text-red-600">-{num(s.cant)}</td>
                          <td />
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
                {visibles.length === 0 && (
                  <tr><td colSpan={COLS.length} className="text-center py-10 text-gray-400">Sin movimientos</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {visibles.length > limite && (
            <div className="px-5 py-3 border-t border-gray-100 text-center">
              <button onClick={() => setLimite(l => l + POR_PAGINA)} className="text-sm text-blue-700 hover:underline">
                Mostrar {Math.min(POR_PAGINA, visibles.length - limite)} mas (de {visibles.length.toLocaleString()})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
