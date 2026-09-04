import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'

export default function PosiblesDuplicados() {
  const [grupos, setGrupos]     = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState(null)

  const cargar = async () => {
    setCargando(true)
    setError(null)
    try {
      const { data } = await api.get('/api/productos/posibles-duplicados')
      setGrupos(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar el reporte')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Posibles Duplicados</h1>
          <p className="text-gray-500 mt-1">
            Productos del catalogo cuyo nombre se parece mucho pero el "stock consolidado"
            (producto_canon) no los detecta como el mismo — singular/plural o palabras en
            otro orden. Esto es solo un reporte: no fusiona nada automaticamente.
          </p>
        </div>
        <Link
          to="/productos"
          className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition whitespace-nowrap"
        >
          Ir al Catalogo
        </Link>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm font-medium bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Comparando catalogo...</div>
      ) : grupos.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
          No se encontraron posibles duplicados en el catalogo actual.
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{grupos.length} grupo{grupos.length === 1 ? '' : 's'} encontrado{grupos.length === 1 ? '' : 's'}</p>
          {grupos.map((grupo, i) => (
            <div key={i} className="bg-white rounded-xl shadow overflow-hidden border border-amber-200">
              <div className="bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Posible duplicado — {grupo.length} productos
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-white">
                  <tr>
                    <th className="px-6 py-2 text-left">#</th>
                    <th className="px-6 py-2 text-left">Nombre</th>
                    <th className="px-6 py-2 text-right">Stock total (3 almacenes)</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.map((p, j) => (
                    <tr key={p.id} className={j % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-3 text-gray-400">{p.id}</td>
                      <td className="px-6 py-3 font-semibold text-gray-800">{p.nombre}</td>
                      <td className="px-6 py-3 text-right text-gray-600">{p.stock_total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
