import { describe, expect, test } from 'vitest'
import {
  InvalidChallengeError,
  InvalidPayloadError,
  MalformedCredentialError,
  PaymentExpiredError,
  PaymentRequiredError,
  VerificationFailedError,
} from './Errors.js'

function errorSnapshot(error: Error & { type: string; status: number }) {
  return {
    name: error.name,
    message: error.message,
    type: error.type,
    status: error.status,
  }
}

describe('MalformedCredentialError', () => {
  test('default', () => {
    expect(errorSnapshot(new MalformedCredentialError())).toMatchInlineSnapshot(`
      {
        "message": "Credential is malformed.",
        "name": "MalformedCredentialError",
        "status": 402,
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/malformed-credential",
      }
    `)
  })

  test('with reason', () => {
    expect(
      errorSnapshot(new MalformedCredentialError({ reason: 'invalid base64url' })),
    ).toMatchInlineSnapshot(`
        {
          "message": "Credential is malformed: invalid base64url.",
          "name": "MalformedCredentialError",
          "status": 402,
          "type": "https://tempoxyz.github.io/payment-auth-spec/problems/malformed-credential",
        }
      `)
  })
})

describe('InvalidChallengeError', () => {
  test('default', () => {
    expect(errorSnapshot(new InvalidChallengeError())).toMatchInlineSnapshot(`
      {
        "message": "Challenge is invalid.",
        "name": "InvalidChallengeError",
        "status": 402,
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/invalid-challenge",
      }
    `)
  })

  test('with id', () => {
    expect(errorSnapshot(new InvalidChallengeError({ id: 'abc123' }))).toMatchInlineSnapshot(`
      {
        "message": "Challenge "abc123" is invalid.",
        "name": "InvalidChallengeError",
        "status": 402,
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/invalid-challenge",
      }
    `)
  })

  test('with reason', () => {
    expect(errorSnapshot(new InvalidChallengeError({ reason: 'expired' }))).toMatchInlineSnapshot(`
      {
        "message": "Challenge is invalid: expired.",
        "name": "InvalidChallengeError",
        "status": 402,
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/invalid-challenge",
      }
    `)
  })

  test('with id and reason', () => {
    expect(
      errorSnapshot(new InvalidChallengeError({ id: 'abc123', reason: 'already used' })),
    ).toMatchInlineSnapshot(`
        {
          "message": "Challenge "abc123" is invalid: already used.",
          "name": "InvalidChallengeError",
          "status": 402,
          "type": "https://tempoxyz.github.io/payment-auth-spec/problems/invalid-challenge",
        }
      `)
  })
})

describe('VerificationFailedError', () => {
  test('default', () => {
    expect(errorSnapshot(new VerificationFailedError())).toMatchInlineSnapshot(`
      {
        "message": "Payment verification failed.",
        "name": "VerificationFailedError",
        "status": 402,
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/verification-failed",
      }
    `)
  })

  test('with reason', () => {
    expect(
      errorSnapshot(new VerificationFailedError({ reason: 'invalid signature' })),
    ).toMatchInlineSnapshot(`
        {
          "message": "Payment verification failed: invalid signature.",
          "name": "VerificationFailedError",
          "status": 402,
          "type": "https://tempoxyz.github.io/payment-auth-spec/problems/verification-failed",
        }
      `)
  })
})

describe('PaymentExpiredError', () => {
  test('default', () => {
    expect(errorSnapshot(new PaymentExpiredError())).toMatchInlineSnapshot(`
      {
        "message": "Payment has expired.",
        "name": "PaymentExpiredError",
        "status": 402,
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/payment-expired",
      }
    `)
  })

  test('with expires', () => {
    expect(
      errorSnapshot(new PaymentExpiredError({ expires: '2025-01-26T12:00:00Z' })),
    ).toMatchInlineSnapshot(`
        {
          "message": "Payment expired at 2025-01-26T12:00:00Z.",
          "name": "PaymentExpiredError",
          "status": 402,
          "type": "https://tempoxyz.github.io/payment-auth-spec/problems/payment-expired",
        }
      `)
  })
})

describe('PaymentRequiredError', () => {
  test('default', () => {
    expect(errorSnapshot(new PaymentRequiredError())).toMatchInlineSnapshot(`
      {
        "message": "Payment is required.",
        "name": "PaymentRequiredError",
        "status": 402,
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/payment-required",
      }
    `)
  })

  test('with resource', () => {
    expect(
      errorSnapshot(new PaymentRequiredError({ resource: '/api/premium' })),
    ).toMatchInlineSnapshot(`
        {
          "message": "Payment required for "/api/premium".",
          "name": "PaymentRequiredError",
          "status": 402,
          "type": "https://tempoxyz.github.io/payment-auth-spec/problems/payment-required",
        }
      `)
  })
})

describe('InvalidPayloadError', () => {
  test('default', () => {
    expect(errorSnapshot(new InvalidPayloadError())).toMatchInlineSnapshot(`
      {
        "message": "Credential payload is invalid.",
        "name": "InvalidPayloadError",
        "status": 402,
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/invalid-payload",
      }
    `)
  })

  test('with reason', () => {
    expect(
      errorSnapshot(new InvalidPayloadError({ reason: 'missing signature field' })),
    ).toMatchInlineSnapshot(`
        {
          "message": "Credential payload is invalid: missing signature field.",
          "name": "InvalidPayloadError",
          "status": 402,
          "type": "https://tempoxyz.github.io/payment-auth-spec/problems/invalid-payload",
        }
      `)
  })
})

describe('toProblemDetails', () => {
  test('without challengeId', () => {
    const error = new MalformedCredentialError({ reason: 'invalid JSON' })
    expect(error.toProblemDetails()).toMatchInlineSnapshot(`
      {
        "detail": "Credential is malformed: invalid JSON.",
        "status": 402,
        "title": "MalformedCredentialError",
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/malformed-credential",
      }
    `)
  })

  test('with challengeId', () => {
    const error = new InvalidChallengeError({ id: 'abc123', reason: 'expired' })
    expect(error.toProblemDetails('abc123')).toMatchInlineSnapshot(`
      {
        "challengeId": "abc123",
        "detail": "Challenge "abc123" is invalid: expired.",
        "status": 402,
        "title": "InvalidChallengeError",
        "type": "https://tempoxyz.github.io/payment-auth-spec/problems/invalid-challenge",
      }
    `)
  })
})
