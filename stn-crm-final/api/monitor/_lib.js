// Gedeelde check-logica voor de monitor-routes. Geen eigen endpoint (begint met "_").
const tls = require('tls')

async function checkUptime(url) {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
    clearTimeout(timeout)
    return { isOnline: res.status < 500, responseTimeMs: Date.now() - start }
  } catch (e) {
    return { isOnline: false, responseTimeMs: Date.now() - start }
  }
}

// Best-effort TLS-certificaat check via een directe socket — geen externe dienst nodig.
function checkSSL(hostname) {
  return new Promise(resolve => {
    let resolved = false
    const finish = result => { if (!resolved) { resolved = true; resolve(result) } }
    try {
      const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 8000, rejectUnauthorized: false }, () => {
        const cert = socket.getPeerCertificate()
        socket.end()
        if (cert && cert.valid_to) finish({ valid: new Date(cert.valid_to) > new Date(), expiresAt: cert.valid_to })
        else finish({ valid: false, expiresAt: null })
      })
      socket.on('error', () => finish({ valid: false, expiresAt: null }))
      socket.on('timeout', () => { socket.destroy(); finish({ valid: false, expiresAt: null }) })
    } catch (e) { finish({ valid: false, expiresAt: null }) }
  })
}

// Best-effort WordPress/plugin-detectie uit de publieke HTML — net als een passieve
// scanner: geen login, geen API-key, alleen wat iedereen al ziet die de pagina bezoekt.
async function sniffWordPress(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    const html = await res.text()
    const wpMatch = html.match(/<meta name="generator" content="WordPress ([\d.]+)"/i)
    const phpHeader = res.headers.get('x-powered-by') || ''
    const phpMatch = phpHeader.match(/PHP\/([\d.]+)/i)
    const pluginMatches = [...html.matchAll(/\/wp-content\/plugins\/([a-z0-9-_]+)\/[^"'?]*\?ver=([\d.]+)/gi)]
    const plugins = {}
    for (const m of pluginMatches) plugins[m[1]] = m[2]
    return {
      wpVersion: wpMatch ? wpMatch[1] : null,
      phpVersion: phpMatch ? phpMatch[1] : null,
      plugins: Object.entries(plugins).map(([name, version]) => ({ name, version })),
    }
  } catch (e) {
    return { wpVersion: null, phpVersion: null, plugins: [] }
  }
}

module.exports = { checkUptime, checkSSL, sniffWordPress }
