import { Base64 } from 'ox'
import type * as Challenge from './Challenge.js'
import * as Request from './Request.js'

export type Credential<
  payload = unknown,
  challenge extends Challenge.Challenge = Challenge.Challenge,
> = {
  /** Echoed challenge parameters from the original 402 response. */
  challenge: Omit<challenge, 'request'> & { request: string }
  /** Method-specific payment proof. */
  payload: payload
  /** Optional payer identifier as a DID (e.g., "did:pkh:eip155:1:0x..."). */
  source?: string | undefined
}

/**
 * Deserializes an Authorization header value to a credential.
 *
 * @param header - The Authorization header value.
 * @returns The deserialized credential.
 *
 * @example
 * ```ts
 * import { Credential } from 'mpay'
 *
 * const credential = Credential.deserialize(header)
 * ```
 */
export function deserialize<payload = unknown>(value: string): Credential<payload> {
  const prefixMatch = value.match(/^Payment\s+(.+)$/i)
  if (!prefixMatch?.[1]) throw new Error('Missing Payment scheme.')
  try {
    const json = Base64.toString(prefixMatch[1])
    return JSON.parse(json) as Credential<payload>
  } catch {
    throw new Error('Invalid base64url or JSON.')
  }
}

/**
 * Creates a credential from the given parameters.
 *
 * The challenge's request field is automatically serialized to base64url.
 *
 * @param parameters - Credential parameters with a Challenge object.
 * @returns A credential with serialized challenge.
 *
 * @example
 * ```ts
 * import { Credential, Challenge } from 'mpay'
 *
 * const credential = Credential.from({
 *   challenge,
 *   payload: { signature: '0x...' },
 * })
 * ```
 */
export function from<const parameters extends from.Parameters>(
  parameters: parameters,
): Credential<parameters['payload'], parameters['challenge']> {
  const { challenge, payload, source } = parameters
  return {
    challenge: {
      id: challenge.id,
      intent: challenge.intent,
      method: challenge.method,
      realm: challenge.realm,
      request: Request.serialize(challenge.request),
      ...(challenge.digest && { digest: challenge.digest }),
      ...(challenge.expires && { expires: challenge.expires }),
    },
    payload,
    ...(source && { source }),
  } as Credential<parameters['payload'], parameters['challenge']>
}

export declare namespace from {
  type Parameters = {
    /** The challenge from the 402 response. */
    challenge: Challenge.Challenge
    /** Method-specific payment proof. */
    payload: unknown
    /** Optional payer identifier as a DID (e.g., "did:pkh:eip155:1:0x..."). */
    source?: string
  }
}

/**
 * Extracts the credential from a Request's Authorization header.
 *
 * @param request - The HTTP request.
 * @returns The deserialized credential.
 *
 * @example
 * ```ts
 * import { Credential } from 'mpay'
 *
 * const credential = Credential.fromRequest(request)
 * ```
 */
export function fromRequest<payload = unknown>(request: Request): Credential<payload> {
  const header = request.headers.get('Authorization')
  if (!header) throw new Error('Missing Authorization header.')
  return deserialize<payload>(header)
}

/**
 * Serializes a credential to the Authorization header format.
 *
 * @param credential - The credential to serialize.
 * @returns A string suitable for the Authorization header value.
 *
 * @example
 * ```ts
 * import { Credential } from 'mpay'
 *
 * const header = Credential.serialize(credential)
 * // => 'Payment eyJjaGFsbGVuZ2UiOnsi...'
 * ```
 */
export function serialize(credential: Credential): string {
  const json = JSON.stringify(credential)
  const encoded = Base64.fromString(json, { pad: false, url: true })
  return `Payment ${encoded}`
}
