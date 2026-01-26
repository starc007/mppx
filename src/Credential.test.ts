import { describe, expect, test } from 'vitest'
import * as Credential from './Credential.js'

const challenge = {
  id: 'x7Tg2pLqR9mKvNwY3hBcZa',
  realm: 'api.example.com',
  method: 'tempo',
  intent: 'charge',
  request: { amount: '1000' },
} as const

describe('from', () => {
  test('behavior: creates credential and serializes request', () => {
    const credential = Credential.from({
      challenge,
      payload: { signature: '0x1234' },
    })
    expect(credential).toMatchInlineSnapshot(`
      {
        "challenge": {
          "id": "x7Tg2pLqR9mKvNwY3hBcZa",
          "intent": "charge",
          "method": "tempo",
          "realm": "api.example.com",
          "request": "eyJhbW91bnQiOiIxMDAwIn0",
        },
        "payload": {
          "signature": "0x1234",
        },
      }
    `)
  })

  test('behavior: creates credential with source', () => {
    const credential = Credential.from({
      challenge,
      source: 'did:pkh:eip155:1:0x1234567890abcdef',
      payload: { hash: '0xabcd' },
    })

    expect(credential).toMatchInlineSnapshot(`
      {
        "challenge": {
          "id": "x7Tg2pLqR9mKvNwY3hBcZa",
          "intent": "charge",
          "method": "tempo",
          "realm": "api.example.com",
          "request": "eyJhbW91bnQiOiIxMDAwIn0",
        },
        "payload": {
          "hash": "0xabcd",
        },
        "source": "did:pkh:eip155:1:0x1234567890abcdef",
      }
    `)
  })

  test('behavior: includes optional challenge fields', () => {
    const credential = Credential.from({
      challenge: {
        ...challenge,
        expires: '2025-01-15T12:00:00Z',
        digest: 'sha-256=abc123',
      },
      payload: { signature: '0x1234' },
    })

    expect(credential.challenge.expires).toBe('2025-01-15T12:00:00Z')
    expect(credential.challenge.digest).toBe('sha-256=abc123')
  })
})

describe('serialize', () => {
  test('behavior: serializes credential to Authorization header format', () => {
    const credential = Credential.from({
      challenge,
      payload: { signature: '0x1234' },
    })

    const header = Credential.serialize(credential)

    expect(header).toMatchInlineSnapshot(
      `"Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJ4N1RnMnBMcVI5bUt2TndZM2hCY1phIiwiaW50ZW50IjoiY2hhcmdlIiwibWV0aG9kIjoidGVtcG8iLCJyZWFsbSI6ImFwaS5leGFtcGxlLmNvbSIsInJlcXVlc3QiOiJleUpoYlc5MWJuUWlPaUl4TURBd0luMCJ9LCJwYXlsb2FkIjp7InNpZ25hdHVyZSI6IjB4MTIzNCJ9fQ"`,
    )
  })

  test('behavior: serializes credential with source', () => {
    const credential = Credential.from({
      challenge,
      source: 'did:pkh:eip155:1:0x1234567890abcdef',
      payload: { hash: '0xabcd' },
    })

    const header = Credential.serialize(credential)

    expect(header).toMatchInlineSnapshot(
      `"Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJ4N1RnMnBMcVI5bUt2TndZM2hCY1phIiwiaW50ZW50IjoiY2hhcmdlIiwibWV0aG9kIjoidGVtcG8iLCJyZWFsbSI6ImFwaS5leGFtcGxlLmNvbSIsInJlcXVlc3QiOiJleUpoYlc5MWJuUWlPaUl4TURBd0luMCJ9LCJwYXlsb2FkIjp7Imhhc2giOiIweGFiY2QifSwic291cmNlIjoiZGlkOnBraDplaXAxNTU6MToweDEyMzQ1Njc4OTBhYmNkZWYifQ"`,
    )
  })
})

describe('deserialize', () => {
  test('behavior: deserializes Authorization header to credential', () => {
    const header =
      'Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJ4N1RnMnBMcVI5bUt2TndZM2hCY1phIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJ0ZW1wbyIsImludGVudCI6ImNoYXJnZSIsInJlcXVlc3QiOiJleUpoYlc5MWJuUWlPaUl4TURBd0luMCJ9LCJwYXlsb2FkIjp7InNpZ25hdHVyZSI6IjB4MTIzNCJ9fQ'

    const credential = Credential.deserialize(header)

    expect(credential).toMatchInlineSnapshot(`
      {
        "challenge": {
          "id": "x7Tg2pLqR9mKvNwY3hBcZa",
          "intent": "charge",
          "method": "tempo",
          "realm": "api.example.com",
          "request": "eyJhbW91bnQiOiIxMDAwIn0",
        },
        "payload": {
          "signature": "0x1234",
        },
      }
    `)
  })

  test('behavior: deserializes credential with source', () => {
    const header =
      'Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJ4N1RnMnBMcVI5bUt2TndZM2hCY1phIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJ0ZW1wbyIsImludGVudCI6ImNoYXJnZSIsInJlcXVlc3QiOiJleUpoYlc5MWJuUWlPaUl4TURBd0luMCJ9LCJzb3VyY2UiOiJkaWQ6cGtoOmVpcDE1NToxOjB4MTIzNDU2Nzg5MGFiY2RlZiIsInBheWxvYWQiOnsiaGFzaCI6IjB4YWJjZCJ9fQ'

    const credential = Credential.deserialize(header)

    expect(credential).toMatchInlineSnapshot(`
      {
        "challenge": {
          "id": "x7Tg2pLqR9mKvNwY3hBcZa",
          "intent": "charge",
          "method": "tempo",
          "realm": "api.example.com",
          "request": "eyJhbW91bnQiOiIxMDAwIn0",
        },
        "payload": {
          "hash": "0xabcd",
        },
        "source": "did:pkh:eip155:1:0x1234567890abcdef",
      }
    `)
  })

  test('error: throws for missing Payment scheme', () => {
    expect(() => Credential.deserialize('Bearer abc123')).toThrow('Missing Payment scheme.')
  })
})

describe('fromRequest', () => {
  test('behavior: extracts credential from Request', () => {
    const request = new Request('https://api.example.com/resource', {
      headers: {
        Authorization:
          'Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJ4N1RnMnBMcVI5bUt2TndZM2hCY1phIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJ0ZW1wbyIsImludGVudCI6ImNoYXJnZSIsInJlcXVlc3QiOiJleUpoYlc5MWJuUWlPaUl4TURBd0luMCJ9LCJwYXlsb2FkIjp7InNpZ25hdHVyZSI6IjB4MTIzNCJ9fQ',
      },
    })

    const credential = Credential.fromRequest(request)

    expect(credential).toMatchInlineSnapshot(`
      {
        "challenge": {
          "id": "x7Tg2pLqR9mKvNwY3hBcZa",
          "intent": "charge",
          "method": "tempo",
          "realm": "api.example.com",
          "request": "eyJhbW91bnQiOiIxMDAwIn0",
        },
        "payload": {
          "signature": "0x1234",
        },
      }
    `)
  })

  test('error: throws for missing Authorization header', () => {
    const request = new Request('https://api.example.com/resource')
    expect(() => Credential.fromRequest(request)).toThrow('Missing Authorization header.')
  })
})
