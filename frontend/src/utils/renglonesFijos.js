// Modelo de "renglon fisico" para documentos que se imprimen sobre un
// talonario PREIMPRESO (rayado/cuadricula ya dibujada en el papel, Epson
// FX-890 II matricial): a diferencia de un PDF en blanco, la fila de la
// tabla NO puede crecer para acomodar un nombre largo -- tiene que
// PARTIRSE en renglones de ancho fijo y ocupar los renglones de abajo,
// dejando Cantidad/P.Unit/Total solo en el primero.
//
// Calibrado sobre el TALONARIO FISICO real (no una aproximacion en pantalla):
// se imprimio una regla de caracteres sin limite (CalibracionImpresion.jsx,
// borrada despues de usarse una vez) en el mismo recuadro/tabla/fuente que
// la Nota de Ingreso real, y se midio con regla donde el rayado ya impreso
// del talonario corta la columna DETALLE. Si el talonario cambia (otro
// modelo, otra impresora/fuente), se repite esa medicion y se ajusta aca
// nomas -- es el unico lugar que hace falta tocar.
export const CARACTERES_LINEA_1 = 68
export const CARACTERES_LINEA_SIGUIENTE = 79

// Alto fijo de cada renglon de la tabla DETALLE, en el mismo lugar para
// las 3 impresiones que lo usan (Nota de Ingreso, Nota de Salida, Nota de
// Devolucion). Ajustar junto con los anchos de arriba.
export const ALTO_RENGLON_FIJO = '1.75rem'

// Parte `texto` en renglones de a lo sumo `maxChars`, cortando por
// palabra completa (nunca a mitad de palabra). Si una palabra sola ya es
// mas larga que maxChars se deja entera en su propio renglon -- no la
// forzamos a partirse a mitad de palabra: es un caso raro (una palabra de
// 40+ letras) y partirla a la fuerza generaria un corte ilegible.
function partirEnLineas(texto, maxChars) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean)
  const lineas = []
  let actual = ''
  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra
    if (candidata.length <= maxChars || !actual) {
      actual = candidata
    } else {
      lineas.push(actual)
      actual = palabra
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

// Con el wrap "greedy" de arriba, la UNICA linea que puede quedar corta
// es la ultima (las anteriores ya se llenaron al maximo por construccion).
// Si esa ultima linea es una sola palabra suelta, no vale la pena gastar
// un renglon fisico entero para ella -- se le "presta" la ultima palabra
// del renglon anterior, siempre y cuando siga entrando en el ancho de la
// linea de destino (el ancho fisico manda: si no entra, se deja como
// estaba en vez de desbordar la columna).
function evitarPalabraHuerfana(lineas, maxCharsUltima) {
  if (lineas.length < 2) return lineas
  const idx = lineas.length - 1
  const ultima = lineas[idx]
  if (ultima.includes(' ')) return lineas // no es una sola palabra

  const palabrasAnterior = lineas[idx - 1].split(' ')
  if (palabrasAnterior.length < 2) return lineas // la anterior se quedaria vacia

  const palabraQueBaja = palabrasAnterior[palabrasAnterior.length - 1]
  const nuevaUltima = `${palabraQueBaja} ${ultima}`
  if (nuevaUltima.length > maxCharsUltima) return lineas

  const resultado = [...lineas]
  resultado[idx - 1] = palabrasAnterior.slice(0, -1).join(' ')
  resultado[idx] = nuevaUltima
  return resultado
}

// Arma el texto completo de un item (nombre + sufijo de servicio) y lo
// separa en { primera, siguientes[] }: `primera` usa el presupuesto mas
// chico (comparte renglon con el codigo/ITEM), `siguientes` usan el
// presupuesto normal (el renglon les queda libre entero).
function partirNombreItem(it) {
  const sufijo = it.tipo === 'SERVICIO'
    ? ` (servicio${it.servicio_modo ? ` ${it.servicio_modo.toLowerCase()}` : ''})`
    : ''
  const nombreCompleto = `${it.producto_nombre || ''}${sufijo}`.trim()

  const palabras = nombreCompleto.split(/\s+/).filter(Boolean)
  let primera = ''
  let i = 0
  for (; i < palabras.length; i++) {
    const candidata = primera ? `${primera} ${palabras[i]}` : palabras[i]
    if (candidata.length <= CARACTERES_LINEA_1 || !primera) {
      primera = candidata
      if (candidata.length > CARACTERES_LINEA_1) { i++; break }
    } else {
      break
    }
  }
  const restante = palabras.slice(i).join(' ')
  const siguientes = restante ? partirEnLineas(restante, CARACTERES_LINEA_SIGUIENTE) : []

  const corregidas = evitarPalabraHuerfana([primera, ...siguientes], CARACTERES_LINEA_SIGUIENTE)
  return { primera: corregidas[0], siguientes: corregidas.slice(1) }
}

// Expande UN item en sus renglones fisicos: el primero lleva el item
// completo (para que el caller pinte codigo/cantidad/p.unit/total); los
// siguientes son solo continuacion de texto (`esContinuacion: true`, sin
// esos datos). Nunca se separan entre si -- son un bloque indivisible.
function renglonesDeItem(it) {
  const { primera, siguientes } = partirNombreItem(it)
  const renglones = [{ ...it, esContinuacion: false, textoLinea: primera }]
  for (const linea of siguientes) {
    renglones.push({ ...it, esContinuacion: true, textoLinea: linea })
  }
  return renglones
}

// Expande una lista de items en renglones fisicos, todos seguidos (sin
// paginar). Se mantiene para quien necesite la lista plana.
export function expandirEnRenglones(items) {
  return items.flatMap(renglonesDeItem)
}

// Pagina los renglones de una lista de items de a `porPagina` por hoja,
// SIN partir un producto entre dos hojas si se puede evitar: si los
// renglones de un item no entran en lo que queda de la hoja actual, ese
// item pasa ENTERO a la siguiente (la hoja actual queda con renglones en
// blanco al final, que ya se rellenan con null como en cualquier hoja
// incompleta). Solo se corta un item a mitad de hoja cuando el item por
// si solo ya supera la capacidad de una hoja completa -- ahi no hay forma
// de evitarlo sin perder texto, asi que sigue en la hoja de abajo.
export function paginarPorItem(items, porPagina) {
  const paginas = []
  let actual = []
  for (const it of items) {
    const grupo = renglonesDeItem(it)
    if (grupo.length > porPagina) {
      // no entra en ninguna hoja entera: se reparte, llenando cada hoja
      let restante = grupo
      while (restante.length > 0) {
        const espacio = porPagina - actual.length
        const tomar = restante.slice(0, espacio)
        actual.push(...tomar)
        restante = restante.slice(tomar.length)
        if (actual.length >= porPagina) { paginas.push(actual); actual = [] }
      }
      continue
    }
    if (actual.length + grupo.length > porPagina) {
      paginas.push(actual)
      actual = []
    }
    actual.push(...grupo)
  }
  // Si el ultimo item lleno una hoja justo (rama de arriba ya la empujo y
  // dejo `actual` vacio), no agregar una hoja extra en blanco.
  if (actual.length > 0 || paginas.length === 0) paginas.push(actual)

  // Relleno con null hasta completar el cuadro de CADA hoja (no solo la
  // ultima): a diferencia de enPaginas() -- que corta un array plano en
  // partes iguales y por eso solo la ultima puede quedar corta -- aca
  // CUALQUIER hoja puede quedar incompleta a proposito (para no partir un
  // item a la mitad), y el rayado fisico de esa hoja tiene que verse
  // completo igual.
  for (const pagina of paginas) {
    while (pagina.length < porPagina) pagina.push(null)
  }
  return paginas
}
