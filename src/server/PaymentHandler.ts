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
    intentFns[name] = createIntentFn({
      intent,
      realm,
      secretKey,
      verify: verify as never,
    })

  return { method, realm, ...intentFns } as PaymentHandler<intents>
}

export declare namespace from {
  type Parameters<intents extends Record<string, MethodIntent.MethodIntent>> = {
    /** Map of intent names to method intents. */
    intents: intents
    /** Payment method name (e.g., "tempo", "stripe"). */
    method: string
    /** Server realm (e.g., hostname). */
    realm: string
    /** Secret key for HMAC-bound challenge IDs (required for stateless verification). */
    secretKey: string
    /** Verify a credential and return a receipt. */
    verify: VerifyFn<intents>
  }
}

export type VerifyFn<intents extends Record<string, MethodIntent.MethodIntent>> = (
  parameters: VerifyFn.Parameters<intents>,
) => Promise<Receipt.Receipt>

export declare namespace VerifyFn {
  type Parameters<intents extends Record<string, MethodIntent.MethodIntent>> = {
    [K in keyof intents]: {
      credential: Credential.Credential<
        z.output<intents[K]['schema']['credential']['payload']>,
        Challenge.Challenge<z.output<intents[K]['schema']['request']>, intents[K]['name']>
      >
      request: Request
    }
  }[keyof intents]
}

// biome-ignore lint/correctness/noUnusedVariables: _
function createIntentFn<intent extends MethodIntent.MethodIntent>(
  parameters: createIntentFn.Parameters<intent>,
): createIntentFn.ReturnType<intent> {
  const { intent, realm, secretKey, verify } = parameters

  async function handleFetch(
    request: Request,
    options: z.input<intent['schema']['request']>,
  ): Promise<IntentFn.Response> {
    // Recompute challenge from options. The HMAC-bound ID means we don't need to
    // store challenges server-side—if the client echoes back a credential with
    // a matching ID, we know it was issued by us with these exact parameters.
    const challenge = Challenge.fromIntent(intent, {
      secretKey,
      realm,
      request: options,
    })

    // No credential provided—issue challenge
    const header = request.headers.get('Authorization')
    if (!header)
      return {
        challenge: Response.requirePayment({ challenge, error: new Errors.PaymentRequiredError() }),
        status: 402,
      }

    // Parse credential from Authorization header
    let credential: Credential.Credential
    try {
      credential = Credential.deserialize(header)
    } catch (e) {
      return {
        challenge: Response.requirePayment({
          challenge,
          error: new Errors.MalformedCredentialError({ reason: (e as Error).message }),
        }),
        status: 402,
      }
    }

    // The challenge ID is HMAC-SHA256(secretKey, realm|method|intent|request|expires).
    // By comparing IDs, we verify: (1) we issued this challenge, and (2) the client
    // hasn't tampered with any parameters. This is stateless—no database lookup needed.
    if (credential.challenge.id !== challenge.id)
      return {
        challenge: Response.requirePayment({
          challenge,
          error: new Errors.InvalidChallengeError({
            id: credential.challenge.id,
            reason: 'credential does not match the issued challenge',
          }),
        }),
        status: 402,
      }

    // Validate payload structure against intent schema
    try {
      intent.schema.credential.payload.parse(credential.payload)
    } catch (e) {
      return {
        challenge: Response.requirePayment({
          challenge,
          error: new Errors.InvalidPayloadError({ reason: (e as Error).message }),
        }),
        status: 402,
      }
    }

    // User-provided verification (e.g., check signature, submit tx, verify payment)
    const receiptData = await verify({ credential, request } as never)

    return {
      status: 200,
      withReceipt(response: globalThis.Response) {
        const headers = new Headers(response.headers)
        headers.set('Payment-Receipt', Receipt.serialize(receiptData))
        return new globalThis.Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      },
    }
  }

  async function handleNode(
    request: IncomingMessage,
    response: ServerResponse,
    options: z.input<intent['schema']['request']>,
  ): Promise<void> {
    const fetchRequest = Request.fromNodeRequest(request, response)
    const result = await handleFetch(fetchRequest, options)

    if (result.status === 402) {
      response.writeHead(402, Object.fromEntries(result.challenge.headers))
      const body = await result.challenge.text()
      if (body) response.write(body)
    } else {
      const wrapped = result.withReceipt(new globalThis.Response())
      // biome-ignore lint/style/noNonNullAssertion: _
      response.setHeader('Payment-Receipt', wrapped.headers.get('Payment-Receipt')!)
    }
  }

  return ((request, responseOrOptions, maybeOptions) =>
    request instanceof globalThis.Request
      ? handleFetch(request, responseOrOptions as never)
      : handleNode(request, responseOrOptions, maybeOptions)) as IntentFn<intent>
}

declare namespace createIntentFn {
  type Parameters<intent extends MethodIntent.MethodIntent> = {
    intent: intent
    realm: string
    secretKey: string
    verify: VerifyFn<Record<string, intent>>
  }

  type ReturnType<intent extends MethodIntent.MethodIntent> = IntentFn<intent>
}

/** @internal */
type IntentFn<intent extends MethodIntent.MethodIntent> = IntentFn.FetchFn<intent> &
  IntentFn.NodeFn<intent>

/** @internal */
declare namespace IntentFn {
  export type FetchFn<intent extends MethodIntent.MethodIntent> = (
    request: Request,
    options: z.input<intent['schema']['request']>,
  ) => Promise<IntentFn.Response>

  export type NodeFn<intent extends MethodIntent.MethodIntent> = (
    request: IncomingMessage,
    response: ServerResponse,
    options: z.input<intent['schema']['request']>,
  ) => Promise<void>

  /**
   * Response returned by an intent function (Fetch API).
   */
  export type Response =
    | { challenge: globalThis.Response; status: 402 }
    | { status: 200; withReceipt: (response: globalThis.Response) => globalThis.Response }
}
