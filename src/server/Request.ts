import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Converts a Node.js IncomingMessage to a Fetch API Request.
 *
 * @param req - The Node.js IncomingMessage.
 * @param res - The Node.js ServerResponse (used for abort signal).
 * @returns A Fetch API Request.
 */
export function fromNodeRequest(req: IncomingMessage, res?: ServerResponse): Request {
  let controller: AbortController | null = new AbortController()

  if (res) {
    res.once('close', () => controller?.abort())
    res.once('finish', () => {
      controller = null
    })
  }

  const method = req.method ?? 'GET'
  const headers = createHeaders(req)

  const protocol = 'encrypted' in req.socket && req.socket.encrypted ? 'https:' : 'http:'
  const host = headers.get('Host') ?? 'localhost'
  const url = new URL(req.url ?? '/', `${protocol}//${host}`)

  const init: RequestInit = { method, headers, signal: controller.signal }

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = new ReadableStream({
      start(controller) {
        req.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
        })
        req.on('end', () => {
          controller.close()
        })
      },
    })
    ;(init as { duplex: 'half' }).duplex = 'half'
  }

  return new Request(url, init)
}

/**
 * Creates a Headers object from a Node.js IncomingMessage.
 *
 * Uses rawHeaders to preserve header casing and multi-value headers.
 *
 * @param req - The Node.js IncomingMessage.
 * @returns A Headers object.
 */
function createHeaders(req: IncomingMessage): Headers {
  const headers = new Headers()
  const rawHeaders = req.rawHeaders

  for (let i = 0; i < rawHeaders.length; i += 2) {
    const key = rawHeaders[i]
    const value = rawHeaders[i + 1]
    if (key && value && !key.startsWith(':')) {
      headers.append(key, value)
    }
  }

  return headers
}
