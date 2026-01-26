import type { IncomingMessage } from 'node:http'

/**
 * Converts a Node.js IncomingMessage to a Fetch API Request.
 *
 * @param request - The Node.js IncomingMessage.
 * @returns A Fetch API Request with the same headers.
 */
export function fromNodeRequest(request: IncomingMessage): Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  const url = `http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`
  return new Request(url, {
    method: request.method ?? 'GET',
    headers,
  })
}
