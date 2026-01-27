import { describe, expect, test } from 'vitest'
import * as Http from '~test/Http.js'
import * as Challenge from '../Challenge.js'
import * as Credential from '../Credential.js'
import * as Intent from '../Intent.js'
import * as Method from '../Method.js'
import * as MethodIntent from '../MethodIntent.js'
import * as Receipt from '../Receipt.js'
import * as z from '../zod.js'
import * as Mpay from './Mpay.js'

const fooCharge = MethodIntent.fromIntent(Intent.charge, {
  method: 'test',
  schema: {
    credential: {
      payload: z.object({ signature: z.string() }),
    },
    request: {
      requires: ['recipient'],
    },
  },
})

const fooMethod = Method.from({
  name: 'test',
  intents: { charge: fooCharge },
})

const realm = 'api.example.com'
const secretKey = 'test-secret-key'

describe('create', () => {
  test('default', () => {
    const method = Method.toServer(fooMethod, {
      async verify() {
        return {
          method: 'test',
          reference: 'ref-123',
          status: 'success' as const,
          timestamp: new Date().toISOString(),
        }
      },
    })

    const handler = Mpay.create({ method, realm, secretKey })

    expect(handler.method).toBe(method)
    expect(handler.realm).toBe(realm)
    expect(typeof handler.charge).toBe('function')
  })

  test('behavior: creates intent functions for all intents', () => {
    const fooAuthorize = MethodIntent.fromIntent(Intent.authorize, {
      method: 'test',
      schema: {
        credential: {
          payload: z.object({ token: z.string() }),
        },
      },
    })

    const baseMethod = Method.from({
      name: 'test',
      intents: {
        authorize: fooAuthorize,
        charge: fooCharge,
      },
    })

    const method = Method.toServer(baseMethod, {
      async verify() {
        return {
          method: 'test',
          reference: 'ref-123',
          status: 'success' as const,
          timestamp: new Date().toISOString(),
        }
      },
    })

    const handler = Mpay.create({ method, realm, secretKey })

    expect(typeof handler.charge).toBe('function')
    expect(typeof handler.authorize).toBe('function')
  })
})

describe('request handler', () => {
  test('returns 402 when no Authorization header', async () => {
    const method = Method.toServer(fooMethod, {
      async verify() {
        return {
          method: 'test',
          reference: 'ref-123',
          status: 'success' as const,
          timestamp: new Date().toISOString(),
        }
      },
    })

    const handler = Mpay.create({ method, realm, secretKey })

    const request = new Request('https://example.com/resource')

    const result = await handler.charge({
      request: {
        amount: '1000',
        currency: '0x1234',
        expires: new Date(Date.now() + 60_000).toISOString(),
        recipient: '0xabc',
      },
    })(request)

    expect(result.status).toBe(402)
    if (result.status !== 402) throw new Error()

    expect(result.challenge.headers.get('WWW-Authenticate')).toContain('Payment')

    const body = (await result.challenge.json()) as object
    expect({
      ...body,
      challengeId: '[challengeId]',
      instance: '[instance]',
    }).toMatchInlineSnapshot(`
      {
        "challengeId": "[challengeId]",
        "detail": "Payment is required for "api.example.com".",
        "instance": "[instance]",
        "status": 402,
        "title": "PaymentRequiredError",
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/payment-required",
      }
    `)
  })

  test('returns 402 with challenge for malformed credential', async () => {
    const method = Method.toServer(fooMethod, {
      async verify() {
        return {
          method: 'test',
          reference: 'ref-123',
          status: 'success' as const,
          timestamp: new Date().toISOString(),
        }
      },
    })

    const request = new Request('https://example.com/resource', {
      headers: { Authorization: 'Payment invalid' },
    })

    const result = await Mpay.create({ method, realm, secretKey }).charge({
      request: {
        amount: '1000',
        currency: '0x1234',
        expires: new Date(Date.now() + 60_000).toISOString(),
        recipient: '0xabc',
      },
    })(request)

    expect(result.status).toBe(402)
    if (result.status !== 402) throw new Error()

    const body = (await result.challenge.json()) as object
    expect({
      ...body,
      challengeId: '[challengeId]',
      instance: '[instance]',
    }).toMatchInlineSnapshot(`
      {
        "challengeId": "[challengeId]",
        "detail": "Credential is malformed: Invalid base64url or JSON..",
        "instance": "[instance]",
        "status": 402,
        "title": "MalformedCredentialError",
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/malformed-credential",
      }
    `)
  })

  test('returns 402 when challenge ID mismatch', async () => {
    const method = Method.toServer(fooMethod, {
      async verify() {
        return {
          method: 'test',
          reference: 'ref-123',
          status: 'success' as const,
          timestamp: new Date().toISOString(),
        }
      },
    })

    const wrongChallenge = Challenge.from({
      id: 'wrong-id',
      intent: 'charge',
      method: 'test',
      realm,
      request: { amount: '1000', currency: '0x1234', recipient: '0xabc' },
    })
    const credential = Credential.from({
      challenge: wrongChallenge,
      payload: { signature: '0x123' },
    })

    const request = new Request('https://example.com/resource', {
      headers: { Authorization: Credential.serialize(credential) },
    })

    const result = await Mpay.create({ method, realm, secretKey }).charge({
      request: {
        amount: '1000',
        currency: '0x1234',
        expires: new Date(Date.now() + 60_000).toISOString(),
        recipient: '0xabc',
      },
    })(request)

    expect(result.status).toBe(402)
    if (result.status !== 402) throw new Error()

    const body = (await result.challenge.json()) as object
    expect({
      ...body,
      challengeId: '[challengeId]',
      instance: '[instance]',
    }).toMatchInlineSnapshot(`
      {
        "challengeId": "[challengeId]",
        "detail": "Challenge "wrong-id" is invalid: credential does not match the issued challenge.",
        "instance": "[instance]",
        "status": 402,
        "title": "InvalidChallengeError",
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/invalid-challenge",
      }
    `)
  })

  test('returns 402 when payload schema validation fails', async () => {
    const method = Method.toServer(fooMethod, {
      async verify() {
        return {
          method: 'test',
          reference: 'ref-123',
          status: 'success' as const,
          timestamp: new Date().toISOString(),
        }
      },
    })

    const handle = Mpay.create({ method, realm, secretKey }).charge({
      request: {
        amount: '1000',
        currency: '0x1234',
        expires: new Date(Date.now() + 60_000).toISOString(),
        recipient: '0xabc',
      },
    })

    const firstResult = await handle(new Request('https://example.com/resource'))
    expect(firstResult.status).toBe(402)
    if (firstResult.status !== 402) throw new Error()

    const challenge = Challenge.fromResponse(firstResult.challenge)

    const credential = Credential.from({
      challenge,
      payload: { wrongField: 'value' } as never,
    })

    const result = await handle(
      new Request('https://example.com/resource', {
        headers: { Authorization: Credential.serialize(credential) },
      }),
    )

    expect(result.status).toBe(402)
    if (result.status !== 402) throw new Error()

    const body = (await result.challenge.json()) as object
    expect({
      ...body,
      challengeId: '[challengeId]',
      detail: '[detail]',
      instance: '[instance]',
    }).toMatchInlineSnapshot(`
      {
        "challengeId": "[challengeId]",
        "detail": "[detail]",
        "instance": "[instance]",
        "status": 402,
        "title": "InvalidPayloadError",
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/invalid-payload",
      }
    `)
  })

  test('returns 402 when verify throws', async () => {
    const method = Method.toServer(fooMethod, {
      async verify() {
        throw new Error('Verification failed')
      },
    })

    const handle = Mpay.create({ method, realm, secretKey }).charge({
      request: {
        amount: '1000',
        currency: '0x1234',
        expires: new Date(Date.now() + 60_000).toISOString(),
        recipient: '0xabc',
      },
    })

    const firstResult = await handle(new Request('https://example.com/resource'))
    expect(firstResult.status).toBe(402)
    if (firstResult.status !== 402) throw new Error()

    const challenge = Challenge.fromResponse(firstResult.challenge)

    const credential = Credential.from({
      challenge,
      payload: { signature: '0x123' },
    })

    const result = await handle(
      new Request('https://example.com/resource', {
        headers: { Authorization: Credential.serialize(credential) },
      }),
    )

    expect(result.status).toBe(402)
    if (result.status !== 402) throw new Error()

    const body = (await result.challenge.json()) as object
    expect({
      ...body,
      challengeId: '[challengeId]',
      instance: '[instance]',
    }).toMatchInlineSnapshot(`
      {
        "challengeId": "[challengeId]",
        "detail": "Payment verification failed: Verification failed.",
        "instance": "[instance]",
        "status": 402,
        "title": "VerificationFailedError",
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/verification-failed",
      }
    `)
  })

  test('returns 200 with withReceipt function on success', async () => {
    const method = Method.toServer(fooMethod, {
      async verify() {
        return {
          method: 'test',
          reference: 'ref-123',
          status: 'success' as const,
          timestamp: new Date().toISOString(),
        }
      },
    })

    const handle = Mpay.create({ method, realm, secretKey }).charge({
      request: {
        amount: '1000',
        currency: '0x1234',
        expires: new Date(Date.now() + 60_000).toISOString(),
        recipient: '0xabc',
      },
    })

    const firstResult = await handle(new Request('https://example.com/resource'))
    expect(firstResult.status).toBe(402)
    if (firstResult.status !== 402) throw new Error()

    const challenge = Challenge.fromResponse(firstResult.challenge)

    const credential = Credential.from({
      challenge,
      payload: { signature: '0x123' },
    })

    const result = await handle(
      new Request('https://example.com/resource', {
        headers: { Authorization: Credential.serialize(credential) },
      }),
    )

    expect(result.status).toBe(200)
    if (result.status !== 200) throw new Error()

    const response = result.withReceipt(new Response('OK'))
    expect(response.headers.has('Payment-Receipt')).toBe(true)

    const receipt = Receipt.fromResponse(response)
    expect(receipt.status).toBe('success')
    expect(receipt.reference).toBe('ref-123')
  })

  test('behavior: passes context to verify function', async () => {
    let receivedContext: unknown

    const method = Method.toServer(fooMethod, {
      context: z.object({ apiKey: z.string() }),
      async verify({ context }) {
        receivedContext = context
        return {
          method: 'test',
          reference: 'ref-123',
          status: 'success' as const,
          timestamp: new Date().toISOString(),
        }
      },
    })

    const handle = Mpay.create({ method, realm, secretKey }).charge({
      apiKey: 'test-api-key',
      request: {
        amount: '1000',
        currency: '0x1234',
        expires: new Date(Date.now() + 60_000).toISOString(),
        recipient: '0xabc',
      },
    })

    const firstResult = await handle(new Request('https://example.com/resource'))
    expect(firstResult.status).toBe(402)
    if (firstResult.status !== 402) throw new Error()

    const challenge = Challenge.fromResponse(firstResult.challenge)

    const credential = Credential.from({
      challenge,
      payload: { signature: '0x123' },
    })

    await handle(
      new Request('https://example.com/resource', {
        headers: { Authorization: Credential.serialize(credential) },
      }),
    )

    expect(receivedContext).toEqual({ apiKey: 'test-api-key' })
  })
})

describe('request handler (node)', () => {
  test('returns 402 when no Authorization header', async () => {
    const method = Method.toServer(fooMethod, {
      async verify() {
        return {
          method: 'test',
          reference: 'ref-123',
          status: 'success' as const,
          timestamp: new Date().toISOString(),
        }
      },
    })

    const handler = Mpay.create({ method, realm, secretKey })

    const server = await Http.createServer(async (req, res) => {
      await handler.charge({
        request: {
          amount: '1000',
          currency: '0x1234',
          expires: new Date(Date.now() + 60_000).toISOString(),
          recipient: '0xabc',
        },
      })(req, res)
      if (!res.headersSent) res.end('OK')
    })

    const response = await fetch(server.url)
    expect(response.status).toBe(402)
    expect(response.headers.get('WWW-Authenticate')).toContain('Payment')

    const body = (await response.json()) as object
    expect({
      ...body,
      challengeId: '[challengeId]',
      instance: '[instance]',
    }).toMatchInlineSnapshot(`
      {
        "challengeId": "[challengeId]",
        "detail": "Payment is required for "api.example.com".",
        "instance": "[instance]",
        "status": 402,
        "title": "PaymentRequiredError",
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/payment-required",
      }
    `)

    server.close()
  })

  test('returns 200 with Payment-Receipt header on success', async () => {
    const method = Method.toServer(fooMethod, {
      async verify() {
        return {
          method: 'test',
          reference: 'ref-123',
          status: 'success' as const,
          timestamp: new Date().toISOString(),
        }
      },
    })

    const handler = Mpay.create({ method, realm, secretKey })
    const expires = new Date(Date.now() + 60_000).toISOString()

    const server = await Http.createServer(async (req, res) => {
      await handler.charge({
        request: {
          amount: '1000',
          currency: '0x1234',
          expires,
          recipient: '0xabc',
        },
      })(req, res)
      if (!res.headersSent) res.end('OK')
    })

    const firstResponse = await fetch(server.url)
    expect(firstResponse.status).toBe(402)

    const challenge = Challenge.fromResponse(firstResponse)

    const credential = Credential.from({
      challenge,
      payload: { signature: '0x123' },
    })

    const response = await fetch(server.url, {
      headers: { Authorization: Credential.serialize(credential) },
    })

    expect(response.status).toBe(200)
    expect(response.headers.has('Payment-Receipt')).toBe(true)

    const receipt = Receipt.fromResponse(response)
    expect(receipt.status).toBe('success')
    expect(receipt.reference).toBe('ref-123')

    server.close()
  })
})
