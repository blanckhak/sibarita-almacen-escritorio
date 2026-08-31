import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'

const money = (n) => Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CompraDiariaDetalle() {
  const { id } = useParams()
  const [compra, setCompra]     = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    api.get(`/api/compras-diarias/${id}`)
      .then(res => { setCompra(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }, [id])

  if (cargando) return <div className="p-6 text-center py-12 text-gray-400">Cargando compra...</div>
  if (!compra) return <div className="p-6 text-center py-12 text-gray-400">Compra diaria no encontrada</div>

  const importe = (d) => Number(d.cantidad) * Number(d.monto_unitario)
  const total = compra.detalle.reduce((s, d) => s + importe(d), 0)

  return (
    <div className="p-6">
      <div className="print:hidden">
        <Link to="/compras-diarias" className="text-sm text-blue-700 hover:underline">&larr; Volver a compras diarias</Link>

        <div className="flex items-center justify-between mt-2 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Compra Diaria N.° {compra.numero_compra}</h1>
            <p className="text-gray-500 mt-1">
              {compra.oficina} · {new Date(compra.fecha).toLocaleDateString('es-GT')}
              {compra.proveedor ? ` · ${compra.proveedor}` : ''}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
          >
            Imprimir
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Solicitud asociada</div>
            <div className="text-gray-800">
              {compra.numero_solicitud
                ? <Link to={`/solicitudes-materiales/${compra.solicitud_id}`} className="text-blue-700 hover:underline">N.° {compra.numero_solicitud}</Link>
                : '—'}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Registrado por</div>
            <div className="text-gray-800">{compra.usuario_nombre || '—'}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Monto total</div>
            <div className="text-gray-800 font-semibold">{money(total)}</div>
          </div>
        </div>

        {compra.observaciones && (
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 mb-6 text-sm">
            <div className="text-gray-400 text-xs font-medium mb-1">Observaciones</div>
            <div className="text-gray-800">{compra.observaciones}</div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">Descripcion</th>
                <th className="px-6 py-3 text-right">Cantidad</th>
                <th className="px-6 py-3 text-right">Monto unitario</th>
                <th className="px-6 py-3 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {compra.detalle.map((d, i) => (
                <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 text-gray-700">{d.descripcion}</td>
                  <td className="px-6 py-3 text-right">{Number(d.cantidad)}</td>
                  <td className="px-6 py-3 text-right">{money(d.monto_unitario)}</td>
                  <td className="px-6 py-3 text-right">{money(importe(d))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-semibold text-gray-800">
                <td className="px-6 py-3 text-right" colSpan={3}>Total</td>
                <td className="px-6 py-3 text-right">{money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Vista de impresion: hoja simple "Registro de Compras Diarias" con el
          encabezado de la empresa, sin bordes de talonario (no hay formato
          fisico pre-impreso para este modulo). */}
      <div className="hidden print:block border-2 border-gray-800 rounded">
        <div className="flex items-start justify-between px-4 pt-3">
          <div>
            <div className="font-bold text-lg text-gray-800">MANUFACTURA DE ALIMENTOS S.A.</div>
            <div className="font-semibold text-sm text-gray-700 uppercase tracking-wide">Registro de Compras Diarias</div>
          </div>
          <div className="border border-gray-800 text-center text-sm">
            <div className="bg-gray-100 px-3 py-0.5 border-b border-gray-800 font-semibold">Fecha</div>
            <div className="px-3 py-1">{new Date(compra.fecha).toLocaleDateString('es-GT')}</div>
          </div>
        </div>
        <div className="text-right px-4 text-sm text-red-600 font-bold">N.° {compra.numero_compra}</div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-sm">
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Oficina</b> {compra.oficina}</div>
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Proveedor</b> {compra.proveedor || '—'}</div>
          <div className="border-b border-gray-200 pb-1 col-span-2"><b className="text-gray-500 text-xs uppercase mr-1">Solicitud asociada</b> {compra.numero_solicitud ? `N.° ${compra.numero_solicitud}` : '—'}</div>
        </div>

        <table className="w-full text-xs mx-4" style={{ width: 'calc(100% - 2rem)', margin: '0.5rem auto' }}>
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-1">Descripcion</th>
              <th className="text-right py-1">Cantidad</th>
              <th className="text-right py-1">Monto unit.</th>
              <th className="text-right py-1">Importe</th>
            </tr>
          </thead>
          <tbody>
            {compra.detalle.map(d => (
              <tr key={d.id} className="border-b border-gray-200">
                <td className="py-1">{d.descripcion}</td>
                <td className="py-1 text-right">{Number(d.cantidad)}</td>
                <td className="py-1 text-right">{money(d.monto_unitario)}</td>
                <td className="py-1 text-right">{money(importe(d))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right font-bold py-1">Total</td>
              <td className="text-right font-bold py-1">{money(total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="px-4 py-2 text-xs">
          <b className="text-gray-500 uppercase mr-1">Observaciones</b> {compra.observaciones || ''}
        </div>

        <div className="flex justify-between px-4 py-6 text-xs text-gray-500 text-center">
          <div className="border-t border-gray-800 pt-1 w-[45%]">Registrado por</div>
          <div className="border-t border-gray-800 pt-1 w-[45%]">V.° B.° Compras</div>
        </div>
        <div className="flex justify-between items-end px-4 pb-2 pt-1 text-[10px] text-gray-400 border-t border-gray-300">
          <span>FT-GE-17 ED.-01</span>
          <span className="text-right">c.c. Compras, Contabilidad</span>
        </div>
      </div>
    </div>
  )
}
