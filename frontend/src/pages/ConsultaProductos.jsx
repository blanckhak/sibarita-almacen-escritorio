import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { exportarCSV, exportarPDF } from '../utils/exportar'

const colorDestino = {
  ALMACEN:     'bg-blue-100 text-blue-700',
  OFICINA:     'bg-green-100 text-green-700',
  LABORATORIO: 'bg-purple-100 text-purple-700',
}

const colorEstado = {
  EN_ALMACEN: 'bg-blue-100 text-blue-700',
  SALIO:      'bg-orange-100 text-orange-700',
}

export default function ConsultaProductos() {
  const [almacenes, setAlmacenes] = useState([])
  const [productos, setProductos] = useState([])
  const [resultados, setResultados] = useState([])
  const [cargando, setCargando]   = useState(false)
  const [filtros, setFiltros] = useState({ almacen_id: '', producto_id: '', numero_guia: '' })

  useEffect(() => {
    Promise.all([api.get('/api/almacenes'), api.get('/api/productos')])
      .then(([a, p]) => { setAlmacenes(a.data); setProductos(p.data) })
  }, [])

  const buscar = async (f = filtros) => {
    setCargando(true)
    try {
      const params = {}
      if (f.almacen_id) params.almacen_id = f.almacen_id
      if (f.producto_id) params.producto_id = f.producto_id
      if (f.numero_guia) params.numero_guia = f.numero_guia
      const { data } = await api.get('/api/guias/consulta/productos', { params })
      setResultados(data)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { buscar() }, [])

  const actualizarFiltro = (campo, valor) => {
    const nuevos = { ...filtros, [campo]: valor }
    setFiltros(nuevos)
    buscar(nuevos)
  }

  const limpiar = () => {
    const vacios = { almacen_id: '', producto_id: '', numero_guia: '' }
    setFiltros(vacios)
    buscar(vacios)
  }

  const hayFiltros = filtros.almacen_id || filtros.producto_id || filtros.numero_guia

  const columnasExport = [
    { titulo: 'N Guia',     campo: 'numero_guia' },
    { titulo: 'Codigo',     campo: 'etiqueta_codigo' },
    { titulo: 'Producto',   campo: 'producto_nombre' },
    { titulo: 'Categoria',  campo: 'categoria' },
    { titulo: 'Destino',    campo: 'destino' },
    { titulo: 'Estado',     campo: 'etiqueta_estado' },
    { titulo: 'Cantidad',   campo: 'cantidad' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Consulta de Productos</h1>
          <p className="text-gray-500 mt-1">Busca por almacen, producto o numero de guia — de forma independiente o combinada</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportarCSV(resultados, columnasExport, 'consulta_productos')}
            className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            Excel
          </button>
          <button
            onClick={() => exportarPDF(resultados, columnasExport, 'Consulta de Productos', 'consulta_productos')}
            className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 mb-4 flex gap-3 items-center flex-wrap">
        <select
          value={filtros.almacen_id}
          onChange={e => actualizarFiltro('almacen_id', e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los almacenes</option>
          {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select
          value={filtros.producto_id}
          onChange={e => actualizarFiltro('producto_id', e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los productos</option>
          {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <input
          type="text"
          placeholder="N° de guia..."
          value={filtros.numero_guia}
          onChange={e => actualizarFiltro('numero_guia', e.target.value)}
          className="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {hayFiltros && (
          <button onClick={limpiar} className="text-sm text-red-500 hover:text-red-700 px-2">
            Limpiar
          </button>
        )}
        <span className="text-xs text-gray-400 whitespace-nowrap">{resultados.length} resultados</span>
      </div>

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Buscando...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">N° Guia</th>
                <th className="px-6 py-3 text-left">Codigo</th>
                <th className="px-6 py-3 text-left">Producto</th>
                <th className="px-6 py-3 text-left">Categoria</th>
                <th className="px-6 py-3 text-left">Destino / Estado</th>
                <th className="px-6 py-3 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r, i) => (
                <tr key={r.guia_item_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-semibold text-gray-800">{r.numero_guia}</td>
                  <td className="px-6 py-3 font-mono text-gray-700">
                    {r.etiqueta_id
                      ? <Link to={`/etiquetas/${r.etiqueta_id}`} className="text-blue-700 hover:underline">{r.etiqueta_codigo}</Link>
                      : '—'}
                  </td>
                  <td className="px-6 py-3 text-gray-700">{r.producto_nombre}</td>
                  <td className="px-6 py-3 text-gray-500">{r.categoria || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold mr-1.5 ${colorDestino[r.destino]}`}>{r.destino}</span>
                    {r.etiqueta_estado && (
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEstado[r.etiqueta_estado]}`}>{r.etiqueta_estado}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">{r.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {resultados.length === 0 && (
            <p className="text-center text-gray-400 py-8">No se encontraron resultados</p>
          )}
        </div>
      )}
    </div>
  )
}
