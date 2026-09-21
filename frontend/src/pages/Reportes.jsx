import { useEffect, useState } from 'react'
import api from '../utils/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { exportarCSV, exportarPDF } from '../utils/exportar'
import { generarKardexExcel } from '../utils/kardexExcel'
import { motivoLabel } from '../utils/motivos'

export default function Reportes() {
  const [resumen, setResumen]         = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [inventario, setInventario]   = useState([])
  const [reimpresiones, setReimpresiones] = useState([])
  const [salidasMotivo, setSalidasMotivo] = useState([])
  const [sinMovimiento, setSinMovimiento] = useState([])
  const [kardex, setKardex]           = useState(null)
  const [bajandoKardex, setBajandoKardex] = useState(false)
  const [desde, setDesde]             = useState('')
  const [hasta, setHasta]             = useState('')
  const [cargando, setCargando]       = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/inventario/resumen'),
      api.get('/api/movimientos'),
      api.get('/api/inventario'),
      api.get('/api/etiquetas/reportes/reimpresiones'),
      api.get('/api/reportes/stock-sin-movimiento'),
    ]).then(([res, mov, inv, reimp, sinMov]) => {
      setResumen(res.data)
      setMovimientos(mov.data)
      setInventario(inv.data)
      setReimpresiones(reimp.data)
      setSinMovimiento(sinMov.data)
    }).catch(err => {
      console.error('No se pudieron cargar los reportes', err)
    }).finally(() => setCargando(false))
  }, [])

  // Salidas por motivo: se recarga sola cuando cambia el rango de fechas.
  useEffect(() => {
    const params = {}
    if (desde) params.desde = desde
    if (hasta) params.hasta = hasta
    api.get('/api/reportes/salidas-por-motivo', { params })
      .then(res => setSalidasMotivo(res.data))
      .catch(err => console.error('No se pudo cargar salidas por motivo', err))
  }, [desde, hasta])

  const totalGeneral = resumen.reduce((s, a) => s + Number(a.total), 0)
  const totalNuevos  = resumen.reduce((s, a) => s + Number(a.nuevos), 0)
  const totalDev     = resumen.reduce((s, a) => s + Number(a.devoluciones), 0)

  const datosGrafica = resumen.map(a => ({
    almacen:      a.almacen,
    Nuevos:       Number(a.nuevos),
    Devoluciones: Number(a.devoluciones),
  }))

  // Filas de "salidas por motivo" con el motivo ya legible, para tabla y export.
  const salidasMotivoFilas = salidasMotivo.map(r => ({
    ...r,
    motivo_label: motivoLabel(r.motivo),
  }))
  const totalUnidadesMotivo = salidasMotivo.reduce((s, r) => s + Number(r.unidades), 0)

  // Grafica: unidades que salieron sumadas por motivo (todos los almacenes juntos).
  const datosGraficaMotivo = Object.values(
    salidasMotivo.reduce((acc, r) => {
      acc[r.motivo] = acc[r.motivo] || { motivo: motivoLabel(r.motivo), Unidades: 0 }
      acc[r.motivo].Unidades += Number(r.unidades)
      return acc
    }, {})
  )

  const sinMovimientoFilas = sinMovimiento.map(r => ({
    ...r,
    ultimo_movimiento_fecha: r.ultimo_movimiento
      ? new Date(r.ultimo_movimiento).toLocaleDateString('es-GT')
      : '—',
  }))

  // Kardex tipo MALSA.xlsx. Consulta pesada (escanea todas las etiquetas), asi
  // que NO se carga con el resto del dashboard: se pide solo al hacer clic en
  // "Descargar Excel" y se cachea para descargas siguientes.
  const descargarKardex = async () => {
    setBajandoKardex(true)
    try {
      const data = kardex || (await api.get('/api/reportes/kardex')).data
      if (!kardex) setKardex(data)
      generarKardexExcel(data.ingresos || [], data.devoluciones || [])
    } catch (err) {
      console.error('No se pudo generar el kardex', err)
    } finally {
      setBajandoKardex(false)
    }
  }

  const kardexIngresos = kardex?.ingresos?.length || 0
  const kardexDevol = kardex?.devoluciones?.length || 0

  if (cargando) return <div className="p-6 text-center text-gray-400">Cargando reportes...</div>

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Reportes</h1>
        <p className="text-gray-500 mt-1">Genera y exporta reportes del sistema</p>
      </div>

      {/* Tarjetas de reporte */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 mb-10">

        {/* Kardex (Excel): una hoja por almacen (MALSA, JOPISA, INDELPAS) */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg text-xl">📑</div>
            <div>
              <h3 className="font-semibold text-gray-800">Kardex (Excel)</h3>
              <p className="text-xs text-gray-400">
                {kardex ? `${kardexIngresos + kardexDevol} codigos en 3 hojas` : 'Se arma al descargar'}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Una pestaña por almacen (MALSA, JOPISA, INDELPAS): una fila por codigo con su ingreso y sus salidas por guia.</p>
          <div className="flex gap-2">
            <button
              onClick={descargarKardex}
              disabled={bajandoKardex}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-2 rounded-lg transition disabled:opacity-50"
            >
              {bajandoKardex ? 'Generando...' : 'Descargar Excel'}
            </button>
          </div>
        </div>

        {/* Reporte resumen */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-100 text-blue-700 p-2 rounded-lg text-xl">📊</div>
            <div>
              <h3 className="font-semibold text-gray-800">Resumen de Almacenes</h3>
              <p className="text-xs text-gray-400">{resumen.length} almacenes</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Total: {totalGeneral.toLocaleString()} items</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(resumen, [
                { titulo: 'Almacen', campo: 'almacen' },
                { titulo: 'Nuevos', campo: 'nuevos' },
                { titulo: 'Devoluciones', campo: 'devoluciones' },
                { titulo: 'Total', campo: 'total' },
              ], 'resumen_almacenes')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition"
            >
              Excel
            </button>
            <button
              onClick={() => exportarPDF(resumen, [
                { titulo: 'Almacen', campo: 'almacen' },
                { titulo: 'Nuevos', campo: 'nuevos' },
                { titulo: 'Devoluciones', campo: 'devoluciones' },
                { titulo: 'Total', campo: 'total' },
              ], 'Resumen de Almacenes', 'resumen_almacenes')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition"
            >
              PDF
            </button>
          </div>
        </div>

        {/* Reporte inventario */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-green-100 text-green-700 p-2 rounded-lg text-xl">📦</div>
            <div>
              <h3 className="font-semibold text-gray-800">Inventario Completo</h3>
              <p className="text-xs text-gray-400">{inventario.length} registros</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Nuevos: {totalNuevos.toLocaleString()} | Dev: {totalDev.toLocaleString()}</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(inventario, [
                { titulo: 'Almacen', campo: 'almacen_nombre' },
                { titulo: 'Tipo', campo: 'tipo' },
                { titulo: 'Cantidad', campo: 'cantidad' },
                { titulo: 'Descripcion', campo: 'descripcion' },
              ], 'inventario_completo')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition"
            >
              Excel
            </button>
            <button
              onClick={() => exportarPDF(inventario, [
                { titulo: 'Almacen', campo: 'almacen_nombre' },
                { titulo: 'Tipo', campo: 'tipo' },
                { titulo: 'Cantidad', campo: 'cantidad' },
                { titulo: 'Descripcion', campo: 'descripcion' },
              ], 'Inventario Completo', 'inventario_completo')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition"
            >
              PDF
            </button>
          </div>
        </div>

        {/* Reporte movimientos */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-orange-100 text-orange-600 p-2 rounded-lg text-xl">🔄</div>
            <div>
              <h3 className="font-semibold text-gray-800">Movimientos</h3>
              <p className="text-xs text-gray-400">{movimientos.length} registros</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Traslados, entradas y salidas</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(movimientos, [
                { titulo: 'Tipo', campo: 'tipo' },
                { titulo: 'Origen', campo: 'origen' },
                { titulo: 'Destino', campo: 'destino' },
                { titulo: 'Cantidad', campo: 'cantidad' },
                { titulo: 'Descripcion', campo: 'descripcion' },
              ], 'movimientos')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition"
            >
              Excel
            </button>
            <button
              onClick={() => exportarPDF(movimientos, [
                { titulo: 'Tipo', campo: 'tipo' },
                { titulo: 'Origen', campo: 'origen' },
                { titulo: 'Destino', campo: 'destino' },
                { titulo: 'Cantidad', campo: 'cantidad' },
              ], 'Reporte de Movimientos', 'movimientos')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition"
            >
              PDF
            </button>
          </div>
        </div>
        {/* Reporte reimpresiones */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-yellow-100 text-yellow-700 p-2 rounded-lg text-xl">🏷️</div>
            <div>
              <h3 className="font-semibold text-gray-800">Reimpresiones de Etiqueta</h3>
              <p className="text-xs text-gray-400">{reimpresiones.length} registros</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Quien y cuando reimprimio cada codigo</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(reimpresiones, [
                { titulo: 'Codigo', campo: 'etiqueta_codigo' },
                { titulo: 'Producto', campo: 'producto_nombre' },
                { titulo: 'Almacen', campo: 'almacen_nombre' },
                { titulo: 'Usuario', campo: 'usuario_nombre' },
                { titulo: 'Fecha', campo: 'fecha' },
              ], 'reimpresiones_etiquetas')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition"
            >
              Excel
            </button>
            <button
              onClick={() => exportarPDF(reimpresiones, [
                { titulo: 'Codigo', campo: 'etiqueta_codigo' },
                { titulo: 'Producto', campo: 'producto_nombre' },
                { titulo: 'Almacen', campo: 'almacen_nombre' },
                { titulo: 'Usuario', campo: 'usuario_nombre' },
              ], 'Reimpresiones de Etiqueta', 'reimpresiones_etiquetas')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition"
            >
              PDF
            </button>
          </div>
        </div>

        {/* Reporte salidas por motivo (Bloque 3) */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-purple-100 text-purple-700 p-2 rounded-lg text-xl">🎯</div>
            <div>
              <h3 className="font-semibold text-gray-800">Salidas por Motivo</h3>
              <p className="text-xs text-gray-400">{salidasMotivo.length} combinaciones motivo/almacen</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">{totalUnidadesMotivo.toLocaleString()} unidades salidas en el rango</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(salidasMotivoFilas, [
                { titulo: 'Motivo', campo: 'motivo_label' },
                { titulo: 'Almacen', campo: 'almacen' },
                { titulo: 'Notas', campo: 'notas' },
                { titulo: 'Unidades', campo: 'unidades' },
              ], 'salidas_por_motivo')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition"
            >
              Excel
            </button>
            <button
              onClick={() => exportarPDF(salidasMotivoFilas, [
                { titulo: 'Motivo', campo: 'motivo_label' },
                { titulo: 'Almacen', campo: 'almacen' },
                { titulo: 'Notas', campo: 'notas' },
                { titulo: 'Unidades', campo: 'unidades' },
              ], 'Salidas por Motivo', 'salidas_por_motivo')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition"
            >
              PDF
            </button>
          </div>
        </div>

        {/* Alerta de stock sin movimiento (Bloque 3) */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-slate-100 text-slate-700 p-2 rounded-lg text-xl">🕸️</div>
            <div>
              <h3 className="font-semibold text-gray-800">Stock sin Movimiento</h3>
              <p className="text-xs text-gray-400">{sinMovimiento.length} codigos, 10+ dias quietos</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Etiquetas en almacen sin ninguna actividad</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(sinMovimientoFilas, [
                { titulo: 'Codigo', campo: 'etiqueta_codigo' },
                { titulo: 'Producto', campo: 'producto_nombre' },
                { titulo: 'Almacen', campo: 'almacen_nombre' },
                { titulo: 'Dias sin movimiento', campo: 'dias_inmovil' },
                { titulo: 'Ultimo movimiento', campo: 'ultimo_movimiento_fecha' },
              ], 'stock_sin_movimiento')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition"
            >
              Excel
            </button>
            <button
              onClick={() => exportarPDF(sinMovimientoFilas, [
                { titulo: 'Codigo', campo: 'etiqueta_codigo' },
                { titulo: 'Producto', campo: 'producto_nombre' },
                { titulo: 'Almacen', campo: 'almacen_nombre' },
                { titulo: 'Dias', campo: 'dias_inmovil' },
                { titulo: 'Ultimo mov.', campo: 'ultimo_movimiento_fecha' },
              ], 'Stock sin Movimiento', 'stock_sin_movimiento')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition"
            >
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Grafica comparativa */}
      <div className="bg-white rounded-xl shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-6">Grafica Comparativa por Almacen</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={datosGrafica} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="almacen" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="Nuevos"       fill="#16a34a" radius={[4,4,0,0]} />
            <Bar dataKey="Devoluciones" fill="#f97316" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Grafica de salidas por motivo */}
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-700">Salidas por Motivo</h2>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-500">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1" />
            <label className="text-gray-500">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1" />
            {(desde || hasta) && (
              <button onClick={() => { setDesde(''); setHasta('') }}
                className="text-blue-600 hover:underline">Limpiar</button>
            )}
          </div>
        </div>
        {datosGraficaMotivo.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">No hay salidas registradas en el rango seleccionado</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={datosGraficaMotivo} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="motivo" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="Unidades" fill="#7c3aed" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Detalle en pantalla (antes solo grafica + export): mismas columnas
                que el Excel/PDF de arriba, motivo/almacen abierto en vez de
                sumado como en la grafica. */}
            <div className="mt-6 rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-white">
                  <tr>
                    <th className="px-4 py-2 text-left">Motivo</th>
                    <th className="px-4 py-2 text-left">Almacen</th>
                    <th className="px-4 py-2 text-right">Notas</th>
                    <th className="px-4 py-2 text-right">Unidades</th>
                  </tr>
                </thead>
                <tbody>
                  {salidasMotivoFilas.map((r, i) => (
                    <tr key={`${r.motivo}-${r.almacen}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 text-gray-700">{r.motivo_label}</td>
                      <td className="px-4 py-2 text-gray-700">{r.almacen}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{r.notas}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">{Number(r.unidades).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-semibold">
                    <td className="px-4 py-2 text-gray-700" colSpan={3}>Total</td>
                    <td className="px-4 py-2 text-right text-gray-800">{totalUnidadesMotivo.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
