import * as Challenge from '../Challenge.js'
import type * as Errors from '../Errors.js'

export function send402(parameters: send402.Parameters): Response {
  const { challenge, error } = parameters

  const headers: Record<string, string> = { 'WWW-Authenticate': Challenge.serialize(challenge) }

  let body: string | null = null

  if (error) {
    headers['Content-Type'] = 'application/problem+json'
    body = JSON.stringify(error.toProblemDetails(challenge.id))
  }

  return new Response(body, { status: 402, headers })
}

export declare namespace send402 {
  type Parameters = {
    challenge: Challenge.Challenge
    error?: Errors.PaymentError | undefined
  }
}
