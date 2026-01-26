import type { IncomingMessage } from 'node:http'
import { describe, expect, test } from 'vitest'
import * as Request from './Request.js'

describe('fromNodeRequest', () => {
  test('converts IncomingMessage to Fetch Request', () => {
    const incoming = {
      method: 'POST',
      url: '/api/resource',
      headers: {
        host: 'example.com',
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
    } as IncomingMessage

    const request = Request.fromNodeRequest(incoming)

    expect(request.method).toBe('POST')
    expect(request.url).toBe('http://example.com/api/resource')
    expect(request.headers.get('Authorization')).toBe('Bearer token')
    expect(request.headers.get('Content-Type')).toBe('application/json')
  })

  test('uses default values when host/url/method missing', () => {
    const incoming = {
      headers: {},
    } as IncomingMessage

    const request = Request.fromNodeRequest(incoming)

    expect(request.method).toBe('GET')
    expect(request.url).toBe('http://localhost/')
  })

  test('joins array header values', () => {
    const incoming = {
      method: 'GET',
      url: '/',
      headers: {
        host: 'example.com',
        'set-cookie': ['a=1', 'b=2'],
      },
    } as unknown as IncomingMessage

    const request = Request.fromNodeRequest(incoming)

    expect(request.headers.get('Set-Cookie')).toBe('a=1, b=2')
  })
})
