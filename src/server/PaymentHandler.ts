import type { IncomingMessage, ServerResponse } from 'node:http'
import type { z } from 'zod/mini'
import * as Challenge from '../Challenge.js'
import * as Credential from '../Credential.js'
import * as Errors from '../Errors.js'
import type * as MethodIntent from '../MethodIntent.js'
import * as Receipt from '../Receipt.js'
import * as Request from './Request.js'
import * as Response from './Response.js'

/**
 * Server-side payment handler.
 */
export type PaymentHandler<
  intents extends Record<string, MethodIntent.MethodIntent> = Record<
    string,
    MethodIntent.MethodIntent
  >,
> = {
  /** Payment method name (e.g., "tempo", "stripe"). */
  method: string
  /** Server realm (e.g., hostname). */
  realm: string
} & {
  [intent in keyof intents]: IntentFn<intents[intent]>
}

/**
 * Result returned by an intent function (Fetch API).
 */
export type IntentResult =
  | { response: Response; status: 402 }
  | { receipt: (response: Response) => Response; status: 200 }

/**
 * Intent function type with overloads for Fetch and Node.js.
 */
export type IntentFn<intent extends MethodIntent.MethodIntent> = {
  /** Fetch API: returns 402 response or receipt wrapper. */
  (request: Request, options: z.input<intent['schema']['request']>): Promise<IntentResult>

  /** Node.js: writes headers to response. */
  (
    request: IncomingMessage,
    response: ServerResponse,
    options: z.input<intent['schema']['request']>,
  ): Promise<void>
}

/**
 * Creates a server-side payment handler.
 *
 * @example
 * ```ts
 * import { PaymentHandler } from 'mpay/server'
 * import { Intents } from 'mpay/tempo'
 *
 * const payment = PaymentHandler.from({
 *   method: 'tempo',
 *   realm: 'api.example.com',
 *   secretKey: 'my-secret',
 *   intents: {
 *     charge: Intents.charge,
 *     authorize: Intents.authorize,
 *   },
 *   async verify(credential, challenge) {
 *     // Verify the credential and return a receipt
 *     return { status: 'success', timestamp: new Date().toISOString(), reference: '0x...' }
 *   },
 * })
 * ```
 */
export function from<const intents extends Record<string, MethodIntent.MethodIntent>>(
  parameters: from.Parameters<intents>,
): PaymentHandler<intents> {
  const { method, realm, secretKey, intents, verify } = parameters

  const intentFns: Record<string, IntentFn<MethodIntent.MethodIntent>> = {}
  for (const [name, intent] of Object.entries(intents))
    intentFns[name] = intentFn({
      intent,
      realm,
      secretKey,
      verify: verify as never,
    })

  return { method, realm, ...intentFns } as PaymentHandler<intents>
}

export declare namespace from {
  type Parameters<intents extends Record<string, MethodIntent.MethodIntent>> = {
    /** Payment method name (e.g., "tempo", "stripe"). */
    method: string
    /** Server realm (e.g., hostname). */
    realm: string
    /** Secret key for HMAC-bound challenge IDs (required for stateless verification). */
    secretKey: string
    /** Map of intent names to method intents. */
    intents: intents
    /** Verify a credential and return a receipt. */
    verify: VerifyFn<intents>
  }
}

export type VerifyFn<intents extends Record<string, MethodIntent.MethodIntent>> = (
  parameters: VerifyParameters<intents>,
) => Promise<Receipt.Receipt>

/** @internal */
type VerifyParameters<intents extends Record<string, MethodIntent.MethodIntent>> = {
  [K in keyof intents]: {
    credential: Credential.Credential<
      z.output<intents[K]['schema']['credential']['payload']>,
      Challenge.Challenge<z.output<intents[K]['schema']['request']>>
    >
    request: Request
  }
}[keyof intents]

/** @internal */
// biome-ignore lint/correctness/noUnusedVariables: _
function intentFn<intent extends MethodIntent.MethodIntent>(
  parameters: intentFn.Parameters<intent>,
): IntentFn<intent> {
  const { intent, realm, secretKey, verify } = parameters

  async function handleFetch(
    request: Request,
    options: z.input<intent['schema']['request']>,
  ): Promise<IntentResult> {
    const challenge = Challenge.fromIntent(intent, {
      secretKey,
      realm,
      request: options,
    })

    const send402 = (error: Errors.PaymentError): IntentResult => ({
      response: Response.send402({ challenge, error }),
      status: 402,
    })

    const header = request.headers.get('Authorization')
    if (!header) return send402(new Errors.PaymentRequiredError())

    let credential: Credential.Credential
    try {
      credential = Credential.deserialize(header)
    } catch (e) {
      return send402(new Errors.MalformedCredentialError({ reason: (e as Error).message }))
    }

    if (credential.challenge.id !== challenge.id) {
      return send402(
        new Errors.InvalidChallengeError({
          id: credential.challenge.id,
          reason: 'credential does not match the issued challenge',
        }),
      )
    }

    try {
      intent.schema.credential.payload.parse(credential.payload)
    } catch (e) {
      return send402(new Errors.InvalidPayloadError({ reason: (e as Error).message }))
    }

    const receiptData = await verify({ credential, request } as never)

    return {
      receipt(res: globalThis.Response) {
        const headers = new Headers(res.headers)
        headers.set('Payment-Receipt', Receipt.serialize(receiptData))
        return new globalThis.Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        })
      },
      status: 200,
    }
  }

  async function handleNode(
    request: IncomingMessage,
    response: ServerResponse,
    options: z.input<intent['schema']['request']>,
  ): Promise<void> {
    const fetchRequest = Request.fromNodeRequest(request)
    const result = await handleFetch(fetchRequest, options)

    if (result.status === 402) {
      response.writeHead(402, Object.fromEntries(result.response.headers))
      const body = await result.response.text()
      if (body) response.write(body)
    } else {
      const wrapped = result.receipt(new globalThis.Response())
      // biome-ignore lint/style/noNonNullAssertion: _
      response.setHeader('Payment-Receipt', wrapped.headers.get('Payment-Receipt')!)
    }
  }

  return ((request, responseOrOptions, maybeOptions) =>
    request instanceof globalThis.Request
      ? handleFetch(request, responseOrOptions as z.input<intent['schema']['request']>)
      : handleNode(request, responseOrOptions, maybeOptions)) as IntentFn<intent>
}

declare namespace intentFn {
  type Parameters<intent extends MethodIntent.MethodIntent> = {
    intent: intent
    realm: string
    secretKey: string
    verify: VerifyFn<Record<string, intent>>
  }
}
