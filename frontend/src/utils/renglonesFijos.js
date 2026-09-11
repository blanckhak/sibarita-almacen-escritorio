// Modelo de "renglon fisico" para documentos que se imprimen sobre un
// talonario PREIMPRESO (rayado/cuadricula ya dibujada en el papel, Epson
// FX-890 II matricial): a diferencia de un PDF en blanco, la fila de la
// tabla NO puede crecer para acomodar un nombre largo -- tiene que
// PARTIRSE en renglones de ancho fijo y ocupar los renglones de abajo,
// dejando Cantidad/P.Unit/Total solo en el primero.
//
// PROVISORIO: estos dos numeros (cuantos caracteres entran por renglon)
// estan puestos a ojo, NO medidos. Ajustar aca nomas cuando el usuario
// mida el talonario fisico con regla (ver NOTAS_PROYECTO_SIBARITA.txt,
// Fase 1 / Bloque 2 "6 lineas" -- item 30 del cierre del 11/09/2026).
// CARACTERES_LINEA_1 es mas chico porque ese renglon comparte espacio con
// el codigo de barra impreso (ej. "J9018") y el ITEM ("1 A1 ·").
export const CARACTERES_LINEA_1 = 38
export const CARACTERES_LINEA_SIGUIENTE = 48

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
  return { primera, siguientes }
}

// Expande una lista de items en "renglones fisicos": el primer renglon de
// cada item lleva el item completo (para que el caller pinte codigo/
// cantidad/p.unit/total); los siguientes son solo continuacion de texto
// (`esContinuacion: true`, sin esos datos).
export function expandirEnRenglones(items) {
  const renglones = []
  for (const it of items) {
    const { primera, siguientes } = partirNombreItem(it)
    renglones.push({ ...it, esContinuacion: false, textoLinea: primera })
    for (const linea of siguientes) {
      renglones.push({ ...it, esContinuacion: true, textoLinea: linea })
    }
  }
  return renglones
}
