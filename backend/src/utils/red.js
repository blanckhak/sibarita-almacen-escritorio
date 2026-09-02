// Saca una IP legible de la peticion Express.
// - req.ip ya respeta 'trust proxy' (server.js) si algun dia hay proxy delante.
// - Normaliza el formato IPv4-mapeado en IPv6 ("::ffff:192.168.1.5" -> "192.168.1.5").
// - "::1" (localhost IPv6) se muestra como "127.0.0.1" para que no confunda.
function ipDe(req) {
  let ip = req.ip
    || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || null
  if (!ip) return null
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  if (ip === '::1') ip = '127.0.0.1'
  return ip.slice(0, 45)
}

module.exports = { ipDe }
