import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { usePeriodo } from '../context/PeriodoContext'
import PeriodoFiltro from '../components/PeriodoFiltro'
import { puedeVerPeriodos } from '../utils/permisos'
import { extraerProveedoresConocidos } from '../utils/proveedores'
import { hoyLocal as hoy } from '../utils/fecha'
import { TIPOS_DOCUMENTO, tipoDocumentoLabel } from '../utils/tiposDocumento'
import { fmtCantidad, sumarCantidades } from '../utils/fmt'

const LINEA_VACIA = () => ({ producto_id: '', producto_nombre: '', nuevo: false, tipo: 'PRODUCTO', cantidad: '', destino: 'ALMACEN', destino_detalle: '', unidad_medida_id: '', recogido: true, metrica: 'ENTERO', partidas: [], persona_retira: '', retira_obs: '', id_agrupador: '', observaciones: '', servicio_modo: 'EXTERNO' })
// Destinos que generan su propia Nota de Salida automatica al guardar la guia
// (si ya lo recogieron) o al marcarlos retirados despues (Bloque 6).
const DESTINOS_SALIDA_AUTO = ['COMPRAS_DIARIAS']
const PARTIDA_VACIA = () => ({ cantidad: '', referencia: '' })
const sumaPartidas = (partidas) => sumarCantidades((partidas || []).map(p => p.cantidad))

export default function Guias() {
  const { usuario } = useAuth()
  const { periodoSel } = usePeriodo()
  const [guias, setGuias]         = useState([])
  const [almacenes, setAlmacenes] = useState([])
  const [productos, setProductos] = useState([])
  const [unidades, setUnidades]   = useState([])
  const [inventario, setInventario] = useState([])
  const [cargando, setCargando]   = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje]     = useState(null)
  const [form, setForm] = useState({ numero_guia: '', tipo_documento: 'GUIA', almacen_id: '', fecha: hoy(), proveedor: '', numero_oc: '', direccion: '', guia_remision: '', factura: '', observaciones: '', items: [LINEA_VACIA()] })
  const [proveedorOtro, setProveedorOtro] = useState(false)
  const [mostrarCerradas, setMostrarCerradas] = useState(false)

  const puedeRegistrar = ['admin', 'almacen', 'almacenero'].includes(usuario?.rol)
  const proveedoresConocidos = useMemo(() => extraerProveedoresConocidos(guias), [guias])
  // Por defecto solo se ven las guias CARGADA (las que todavia se estan
  // trabajando); las CERRADA y ANULADA quedan disponibles con el toggle de
  // abajo en vez de desaparecer de la pantalla.
  const guiasVisibles = useMemo(
    () => mostrarCerradas ? guias : guias.filter(g => (g.estado || 'CARGADA') === 'CARGADA'),
    [guias, mostrarCerradas]
  )
  const totalNoVigentes = useMemo(
    () => guias.filter(g => ['CERRADA', 'ANULADA'].includes(g.estado)).length,
    [guias]
  )

  const cargarDatos = async () => {
    const [g, a, p, u, inv] = await Promise.all([
      api.get('/api/guias', { params: periodoSel ? { periodo_id: periodoSel } : {} }),
      api.get('/api/almacenes'),
      api.get('/api/productos'),
      api.get('/api/unidades-medida'),
      api.get('/api/inventario'),
    ])
    setGuias(g.data)
    setAlmacenes(a.data)
    setProductos(p.data)
    setUnidades(u.data)
    setInventario(inv.data)
    setCargando(false)
  }

  // Stock consolidado de un producto que ya esta en almacen: cuanto hay en el
  // almacen de esta guia y el total sumando los 3 (NUEVO + DEVOLUCION). Se
  // muestra bajo la linea al registrar un ingreso, para saber cuanto habia
  // antes de sumar lo que entra.
  const stockConsolidado = (productoId) => {
    const filas = inventario.filter(x => Number(x.producto_id) === Number(productoId))
    const total = sumarCantidades(filas.map(x => x.cantidad))
    const porAlmacen = {}
    for (const x of filas) porAlmacen[x.almacen_nombre] = sumarCantidades([porAlmacen[x.almacen_nombre] || 0, x.cantidad])
    const enEsteAlmacen = form.almacen_id
      ? sumarCantidades(filas.filter(x => Number(x.almacen_id) === Number(form.almacen_id)).map(x => x.cantidad))
      : null
    return { total, porAlmacen, enEsteAlmacen }
  }

  useEffect(() => { cargarDatos() }, [periodoSel])

  const abrirNuevo = () => {
    setForm({ numero_guia: '', tipo_documento: 'GUIA', almacen_id: '', fecha: hoy(), proveedor: '', numero_oc: '', direccion: '', guia_remision: '', factura: '', observaciones: '', items: [LINEA_VACIA()] })
    setProveedorOtro(false)
    setMostrarForm(true)
  }

  const seleccionarProveedor = (valorSelect) => {
    if (valorSelect === '__otro__') {
      setProveedorOtro(true)
      setForm(f => ({ ...f, proveedor: '' }))
    } else {
      setProveedorOtro(false)
      setForm(f => ({ ...f, proveedor: valorSelect }))
    }
  }

  const actualizarLinea = (i, campo, valor) => {
    setForm(f => {
      const items = [...f.items]
      items[i] = { ...items[i], [campo]: valor }
      return { ...f, items }
    })
  }

  // El select de Producto mezcla el catalogo (valor = id) con la opcion
  // "__nuevo__" para digitar un producto que todavia no existe.
  const seleccionarProducto = (i, valorSelect) => {
    setForm(f => {
      const items = [...f.items]
      if (valorSelect === '__nuevo__') {
        items[i] = { ...items[i], producto_id: '', producto_nombre: '', nuevo: true, unidad_medida_id: '', metrica: 'ENTERO', partidas: [] }
      } else if (valorSelect === '') {
        items[i] = { ...items[i], producto_id: '', producto_nombre: '', nuevo: false, unidad_medida_id: '', metrica: 'ENTERO', partidas: [] }
      } else {
        const prod = productos.find(p => p.id === Number(valorSelect))
        const metrica = prod?.metrica || 'ENTERO'
        items[i] = {
          ...items[i],
          producto_id: Number(valorSelect), producto_nombre: prod?.nombre || '', nuevo: false, unidad_medida_id: '',
          metrica,
          partidas: metrica === 'EN_PARTIDA' ? [PARTIDA_VACIA()] : [],
          cantidad: metrica === 'EN_PARTIDA' ? '' : items[i].cantidad,
        }
      }
      return { ...f, items }
    })
  }

  // Metrica de un producto nuevo dado de alta desde la guia (se define en el
  // catalogo; aca se elige al vuelo porque el producto se crea en este alta).
  const cambiarMetricaNuevo = (i, metrica) => {
    setForm(f => {
      const items = [...f.items]
      items[i] = {
        ...items[i],
        metrica,
        partidas: metrica === 'EN_PARTIDA' ? (items[i].partidas.length ? items[i].partidas : [PARTIDA_VACIA()]) : [],
        cantidad: metrica === 'EN_PARTIDA' ? '' : items[i].cantidad,
      }
      return { ...f, items }
    })
  }

  // Tipo de linea PRODUCTO / SERVICIO (Fase 8). Una linea SERVICIO no lleva
  // destino, partidas ni metrica; solo producto/descripcion + cantidad.
  const cambiarTipoLinea = (i, tipo) => setForm(f => {
    const items = [...f.items]
    const base = { ...items[i], tipo }
    if (tipo === 'SERVICIO') {
      // Un servicio no usa el catalogo: se describe en texto libre. Se
      // conserva producto_nombre por si venia escrito, se sueltan id/nuevo.
      base.producto_id = ''
      base.nuevo = false
      base.unidad_medida_id = ''
      base.destino = 'ALMACEN'
      base.destino_detalle = ''
      base.recogido = true
      base.metrica = 'ENTERO'
      base.partidas = []
      if (!base.servicio_modo) base.servicio_modo = 'EXTERNO'
    } else {
      const prod = productos.find(p => p.id === Number(base.producto_id))
      const metrica = prod?.metrica || 'ENTERO'
      base.metrica = metrica
      base.partidas = metrica === 'EN_PARTIDA' ? (base.partidas?.length ? base.partidas : [PARTIDA_VACIA()]) : []
    }
    items[i] = base
    return { ...f, items }
  })

  const agregarPartida = (i) => setForm(f => {
    const items = [...f.items]
    items[i] = { ...items[i], partidas: [...items[i].partidas, PARTIDA_VACIA()] }
    return { ...f, items }
  })
  const quitarPartida = (i, j) => setForm(f => {
    const items = [...f.items]
    items[i] = { ...items[i], partidas: items[i].partidas.filter((_, idx) => idx !== j) }
    return { ...f, items }
  })
  const actualizarPartida = (i, j, campo, valor) => setForm(f => {
    const items = [...f.items]
    const partidas = [...items[i].partidas]
    partidas[j] = { ...partidas[j], [campo]: valor }
    items[i] = { ...items[i], partidas }
    return { ...f, items }
  })

  const agregarLinea = () => setForm(f => ({ ...f, items: [...f.items, LINEA_VACIA()] }))
  const quitarLinea = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))

  const productoDe = (id) => productos.find(p => p.id === Number(id))

  const handleSubmit = async (e) => {
    e.preventDefault()

    const lineaEnPartidaInvalida = form.items.some(it => {
      if (it.tipo === 'SERVICIO' || it.metrica !== 'EN_PARTIDA') return false
      // Fase 11 (R6): las partidas admiten decimales (hasta 3). Solo se exige
      // que haya al menos una y que todas sean numeros > 0.
      const nums = it.partidas.map(p => Number(p.cantidad))
      return nums.length === 0 || nums.some(n => !Number.isFinite(n) || n <= 0)
    })
    if (lineaEnPartidaInvalida) {
      setMensaje({ tipo: 'error', texto: 'Hay una linea "en partida" con partidas invalidas: cada partida debe ser un numero mayor a 0 y debe haber al menos una.' })
      setTimeout(() => setMensaje(null), 5000)
      return
    }

    setGuardando(true)
    try {
      const payload = {
        ...form,
        items: form.items.map(it => {
          const enPartida = it.tipo !== 'SERVICIO' && it.metrica === 'EN_PARTIDA'
          const partidas = enPartida
            ? it.partidas
                .filter(p => Number(p.cantidad) > 0)
                .map(p => ({ cantidad: Number(p.cantidad), referencia: p.referencia.trim() }))
            : []
          return {
            ...it,
            producto_id: it.producto_id || null,
            producto_nombre: it.producto_id ? '' : it.producto_nombre.trim(),
            partidas,
            cantidad: enPartida ? sumaPartidas(it.partidas) : it.cantidad,
          }
        }),
      }
      const { data } = await api.post('/api/guias', payload)
      const notasTexto = data.notas_salida_generadas?.length > 0
        ? ` Se genero${data.notas_salida_generadas.length > 1 ? 'n' : ''} la nota de salida ${data.notas_salida_generadas.map(n => n.numero_nota).join(', ')} (Compras Diarias).`
        : ''
      setMensaje({
        tipo: 'ok',
        texto: (data.etiquetas.length > 0
          ? `Guia registrada. Se generaron ${data.etiquetas.length} etiqueta(s), lista(s) para imprimir.`
          : 'Guia registrada correctamente.') + notasTexto,
      })
      setMostrarForm(false)
      cargarDatos()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar la guia' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 5000)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Ingreso por Guia</h1>
          <p className="text-gray-500 mt-1">Registro de guias de ingreso con multiples productos</p>
        </div>
        {puedeRegistrar && (
          <button
            onClick={() => mostrarForm ? setMostrarForm(false) : abrirNuevo()}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
          >
            {mostrarForm ? 'Cancelar' : '+ Nuevo Ingreso'}
          </button>
        )}
      </div>

      {/* Filtro de periodo: solo admin y almacen (ver utils/permisos.js). */}
      {puedeVerPeriodos(usuario) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-6">
          <PeriodoFiltro />
          <p className="text-xs text-gray-400 mt-1.5">La lista de abajo muestra las guias de este periodo. El alta siempre entra en el periodo activo del almacen.</p>
        </div>
      )}

      {mensaje && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {mostrarForm && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Nuevo Ingreso</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Documento y N°</label>
                <div className="flex gap-2">
                  <select
                    value={form.tipo_documento}
                    onChange={e => setForm({ ...form, tipo_documento: e.target.value })}
                    className="border border-gray-300 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input
                    required
                    value={form.numero_guia}
                    onChange={e => setForm({ ...form, numero_guia: e.target.value.toUpperCase() })}
                    placeholder="Ej: G-04521, F-001-123, B-045"
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Almacen</label>
                <select
                  required
                  value={form.almacen_id}
                  onChange={e => setForm({ ...form, almacen_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar almacen...</option>
                  {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Fecha de ingreso</label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={e => setForm({ ...form, fecha: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Proveedor <span className="text-gray-400 font-normal">(opcional)</span></label>
                <select
                  value={proveedorOtro ? '__otro__' : form.proveedor}
                  onChange={e => seleccionarProveedor(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin proveedor / seleccionar...</option>
                  {proveedoresConocidos.map(p => <option key={p} value={p}>{p}</option>)}
                  <option value="__otro__">+ Otro proveedor (escribir)</option>
                </select>
                {proveedorOtro && (
                  <input
                    autoFocus
                    value={form.proveedor}
                    onChange={e => setForm({ ...form, proveedor: e.target.value.toUpperCase() })}
                    placeholder="Nombre del proveedor nuevo..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">N° de Orden de Compra <span className="text-gray-400 font-normal">(opcional, se puede agregar despues)</span></label>
                <input
                  value={form.numero_oc}
                  onChange={e => setForm({ ...form, numero_oc: e.target.value.toUpperCase() })}
                  placeholder="Ej: OC-1234"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-600 mb-1">Observaciones de la guia <span className="text-gray-400 font-normal">(opcional, se imprime en la Nota de Ingreso)</span></label>
                <textarea
                  rows={2}
                  value={form.observaciones}
                  onChange={e => setForm({ ...form, observaciones: e.target.value.toUpperCase() })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-3 mb-4">
              {form.items.map((it, i) => {
                const prod = productoDe(it.producto_id)
                const necesitaUnidad = !prod || !prod.unidad_medida_id
                const selectValue = it.nuevo ? '__nuevo__' : (it.producto_id ? String(it.producto_id) : '')
                const esProductoNuevo = it.nuevo
                const esServicio = it.tipo === 'SERVICIO'
                const enPartida = !esServicio && it.metrica === 'EN_PARTIDA'
                const totalPartidas = sumaPartidas(it.partidas)
                // Fase 11 (R6): la unidad de la linea (del catalogo o la elegida
                // en el form) decide si se admiten decimales por Kilo / Metro.
                const unidadLineaId = (prod && prod.unidad_medida_id) || it.unidad_medida_id
                const unidadLinea = unidades.find(u => u.id === Number(unidadLineaId))
                const permiteDecimal = !!unidadLinea?.permite_decimal
                const stepCantidad = permiteDecimal ? '0.001' : '1'
                const minCantidad = permiteDecimal ? '0.001' : '1'
                return (
                  <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex gap-2 mb-3">
                      {['PRODUCTO', 'SERVICIO'].map(t => (
                        <button
                          type="button"
                          key={t}
                          onClick={() => cambiarTipoLinea(i, t)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                            it.tipo === t ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {t === 'PRODUCTO' ? 'Producto' : 'Servicio'}
                        </button>
                      ))}
                      {esServicio && (
                        <div className="flex items-center gap-2 self-center">
                          {['EXTERNO', 'INTERNO'].map(m => (
                            <button
                              type="button"
                              key={m}
                              onClick={() => actualizarLinea(i, 'servicio_modo', m)}
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                                it.servicio_modo === m ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {m === 'EXTERNO' ? 'Externo' : 'Interno'}
                            </button>
                          ))}
                          <span className="text-[11px] text-gray-400">
                            {it.servicio_modo === 'EXTERNO'
                              ? 'genera Nota de Salida automatica (sin codigo)'
                              : 'genera un codigo y queda en almacen'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-12 gap-3 items-start">
                      <div className={esServicio ? 'col-span-6' : 'col-span-4'}>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{esServicio ? 'Servicio / descripcion' : 'Producto'}</label>
                        {esServicio ? (
                          <input
                            required
                            value={it.producto_nombre}
                            onChange={e => actualizarLinea(i, 'producto_nombre', e.target.value.toUpperCase())}
                            placeholder="Ej: Mantenimiento de torno, servicio de limpieza..."
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <>
                            <select
                              required
                              value={selectValue}
                              onChange={e => seleccionarProducto(i, e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Seleccionar del catalogo...</option>
                              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                              <option value="__nuevo__">+ Producto nuevo (escribir)</option>
                            </select>
                            {esProductoNuevo && (
                              <>
                                <input
                                  required
                                  autoFocus
                                  value={it.producto_nombre}
                                  onChange={e => actualizarLinea(i, 'producto_nombre', e.target.value.toUpperCase())}
                                  placeholder="Nombre del producto nuevo..."
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <select
                                  value={it.metrica}
                                  onChange={e => cambiarMetricaNuevo(i, e.target.value)}
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="ENTERO">Metrica: Entero</option>
                                  <option value="EN_PARTIDA">Metrica: En partida</option>
                                </select>
                              </>
                            )}
                            {it.producto_id && !esProductoNuevo && (() => {
                              const s = stockConsolidado(it.producto_id)
                              const nombreAlm = almacenes.find(a => a.id === Number(form.almacen_id))?.nombre
                              const otros = Object.entries(s.porAlmacen)
                              return (
                                <p className="text-xs text-gray-400 mt-1 leading-snug">
                                  Stock consolidado:{' '}
                                  {form.almacen_id
                                    ? <><b className="text-gray-500">{s.enEsteAlmacen}</b> en {nombreAlm} · </>
                                    : null}
                                  <b className="text-gray-500">{s.total}</b> en total
                                  {otros.length > 1 && (
                                    <span className="block">{otros.map(([k, v]) => `${k}: ${v}`).join('  ·  ')}</span>
                                  )}
                                </p>
                              )
                            })()}
                          </>
                        )}
                      </div>
                      <div className={esServicio ? 'col-span-3' : 'col-span-2'}>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad</label>
                        {enPartida ? (
                          <div className="border border-gray-200 bg-gray-100 rounded-lg px-2.5 py-2 text-sm text-gray-700">
                            {fmtCantidad(totalPartidas || 0)}
                            <span className="block text-xs text-gray-400">suma de partidas</span>
                          </div>
                        ) : (
                          <input
                            required
                            type="number" min={minCantidad} step={stepCantidad}
                            value={it.cantidad}
                            onChange={e => actualizarLinea(i, 'cantidad', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        {permiteDecimal && (
                          <span className="block text-[11px] text-gray-400 mt-0.5">admite decimales ({unidadLinea?.abreviatura || unidadLinea?.nombre})</span>
                        )}
                      </div>
                      {!esServicio && (
                        <div className="col-span-3">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Destino</label>
                          <select
                            value={it.destino}
                            onChange={e => actualizarLinea(i, 'destino', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="ALMACEN">✗ Almacen (genera codigo)</option>
                            <option value="COMPRAS_DIARIAS">✓ Compras Diarias</option>
                            <option value="OTRO">✓ Otro (especificar)</option>
                          </select>
                          {it.destino === 'OTRO' && (
                            <input
                              required
                              autoFocus
                              value={it.destino_detalle}
                              onChange={e => actualizarLinea(i, 'destino_detalle', e.target.value.toUpperCase())}
                              placeholder="Ej: Cliente, evento..."
                              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          )}
                        </div>
                      )}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Unidad de medida{esServicio ? ' (opcional)' : ''}
                        </label>
                        {necesitaUnidad ? (
                          <select
                            required={!esServicio}
                            value={it.unidad_medida_id}
                            onChange={e => actualizarLinea(i, 'unidad_medida_id', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Definir...</option>
                            {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                          </select>
                        ) : (
                          <div className="text-sm text-gray-500 px-2.5 py-2">
                            {prod.unidad_medida_nombre || 'Sin definir'}
                          </div>
                        )}
                      </div>
                      <div className="col-span-1 flex items-end justify-center h-full pt-5">
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => quitarLinea(i)}
                            className="text-red-500 hover:text-red-700 text-sm"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Fase 11 (R4): ID de agrupacion (se puede repetir en
                        varias lineas) y observacion por linea. */}
                    <div className="grid grid-cols-12 gap-3 items-start mt-2">
                      <div className="col-span-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1">ID (agrupador, opcional)</label>
                        <div className="flex gap-1">
                          <input
                            value={it.id_agrupador}
                            onChange={e => actualizarLinea(i, 'id_agrupador', e.target.value.toUpperCase())}
                            maxLength={30}
                            placeholder="Ej: A-12"
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {i > 0 && (
                            <button
                              type="button"
                              title="Usar el mismo ID que la linea anterior"
                              onClick={() => actualizarLinea(i, 'id_agrupador', form.items[i - 1].id_agrupador || '')}
                              className="shrink-0 border border-gray-300 rounded-lg px-2 text-xs text-gray-600 hover:bg-gray-50"
                            >
                              = anterior
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="col-span-8">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Observacion de la linea (opcional)</label>
                        <input
                          value={it.observaciones}
                          onChange={e => actualizarLinea(i, 'observaciones', e.target.value.toUpperCase())}
                          maxLength={300}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {enPartida && (
                      <div className="mt-3 border border-indigo-200 bg-indigo-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                            Partidas (producto en partida)
                          </span>
                          <span className="text-xs text-indigo-600">Total: {fmtCantidad(totalPartidas || 0)}</span>
                        </div>
                        <div className="space-y-2">
                          {it.partidas.map((pt, j) => (
                            <div key={j} className="grid grid-cols-12 gap-2 items-center">
                              <input
                                type="number" min={minCantidad} step={stepCantidad}
                                value={pt.cantidad}
                                onChange={e => actualizarPartida(i, j, 'cantidad', e.target.value)}
                                placeholder="Cantidad"
                                className="col-span-3 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <input
                                value={pt.referencia}
                                onChange={e => actualizarPartida(i, j, 'referencia', e.target.value.toUpperCase())}
                                placeholder="Referencia / paquete (ej. Caja 3 de 12)"
                                className="col-span-8 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <button
                                type="button"
                                onClick={() => quitarPartida(i, j)}
                                disabled={it.partidas.length <= 1}
                                className="col-span-1 text-red-500 hover:text-red-700 text-xs disabled:opacity-30"
                              >
                                Quitar
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => agregarPartida(i)}
                          className="mt-2 text-xs border border-indigo-300 rounded-lg px-2.5 py-1.5 text-indigo-700 hover:bg-indigo-100"
                        >
                          + Agregar partida
                        </button>
                      </div>
                    )}

                    {!esServicio && it.destino !== 'ALMACEN' && (
                      <div className="mt-3">
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                          <input
                            type="checkbox"
                            checked={it.recogido}
                            onChange={e => actualizarLinea(i, 'recogido', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          {DESTINOS_SALIDA_AUTO.includes(it.destino)
                            ? 'Ya lo recogieron (genera su Nota de Salida automatica si indicas quien retira; sin quedar en inventario)'
                            : 'Ya lo recogieron (sale de una vez, sin quedar en inventario ni generar codigo)'}
                          {!it.recogido && (
                            <span className="text-amber-600 font-medium">
                              {DESTINOS_SALIDA_AUTO.includes(it.destino)
                                ? '— Aun no: quedara en inventario con codigo hasta que lo marques retirado en el detalle de la guia'
                                : '— Aun no: quedara en inventario con codigo hasta que lo recojan'}
                            </span>
                          )}
                        </label>
                        {DESTINOS_SALIDA_AUTO.includes(it.destino) && it.recogido && (
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Quien retira <span className="text-gray-400 font-normal">(opcional)</span></label>
                              <input
                                value={it.persona_retira}
                                onChange={e => actualizarLinea(i, 'persona_retira', e.target.value.toUpperCase())}
                                placeholder="Nombre de quien retira"
                                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              {!it.persona_retira?.trim() && (
                                <p className="text-xs text-amber-600 mt-1 leading-snug">
                                  Sin nombre: la linea queda con codigo en inventario y generas la Nota de Salida despues, con el boton "Retirar" del detalle de la guia.
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Observacion (opcional)</label>
                              <input
                                value={it.retira_obs}
                                onChange={e => actualizarLinea(i, 'retira_obs', e.target.value.toUpperCase())}
                                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={agregarLinea}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50"
              >
                + Agregar linea (producto o servicio)
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={guardando} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Finalizar y generar codigos'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {!cargando && totalNoVigentes > 0 && (
        <label className="flex items-center gap-2 text-sm text-gray-600 mb-3 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={mostrarCerradas}
            onChange={e => setMostrarCerradas(e.target.checked)}
            className="rounded border-gray-300"
          />
          Mostrar tambien las cerradas y anuladas ({totalNoVigentes})
        </label>
      )}

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando guias...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">N° Guia</th>
                <th className="px-6 py-3 text-left">Almacen</th>
                <th className="px-6 py-3 text-left">O.C.</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-left">Registrado por</th>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-right">Lineas</th>
                <th className="px-6 py-3 text-right">Etiquetas</th>
                <th className="px-6 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {guiasVisibles.map((g, i) => (
                <tr key={g.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-semibold text-gray-800">
                    {g.numero_guia}
                    <span className="block text-[10px] font-normal text-gray-400 uppercase">{tipoDocumentoLabel(g.tipo_documento)}</span>
                  </td>
                  <td className="px-6 py-3 text-gray-700">{g.almacen_nombre}</td>
                  <td className="px-6 py-3 text-gray-500">{g.numero_oc || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      g.estado === 'ANULADA' ? 'bg-red-100 text-red-700'
                      : g.estado === 'CERRADA' ? 'bg-gray-200 text-gray-600'
                      : 'bg-blue-100 text-blue-700'
                    }`}>
                      {g.estado || 'CARGADA'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{g.usuario_nombre || '—'}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{new Date(g.fecha).toLocaleDateString('es-GT')}</td>
                  <td className="px-6 py-3 text-right">{g.total_items}</td>
                  <td className="px-6 py-3 text-right">{g.total_etiquetas}</td>
                  <td className="px-6 py-3 text-right">
                    <Link to={`/guias/${g.id}`} className="text-sm border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {guiasVisibles.length === 0 && (
            <p className="text-center text-gray-400 py-8">
              {guias.length === 0 ? 'No hay guias registradas todavia' : 'No hay guias cargadas — todas estan cerradas'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
