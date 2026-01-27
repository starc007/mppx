import { AbiFunction, Address } from 'ox'
import {
  type Account,
  type Client,
  createClient,
  http,
  parseEventLogs,
  type TransactionReceipt,
} from 'viem'
import { getTransactionReceipt, sendRawTransactionSync, signTransaction } from 'viem/actions'
import { tempo as tempo_chain } from 'viem/chains'
import { Abis, Transaction } from 'viem/tempo'
import type { OneOf } from '../../internal/types.js'
import * as PaymentHandler from '../../server/PaymentHandler.js'
import * as Intents from '../Intents.js'

const transfer = AbiFunction.from('function transfer(address to, uint256 amount) returns (bool)')
const transferSelector = AbiFunction.getSelector(transfer)

/**
 * Creates a Tempo server-side payment handler.
 *
 * @example
 * ```ts
 * import { PaymentHandler } from 'mpay/tempo/server'
 *
 * const payment = PaymentHandler.tempo({
 *   chainId: 42431,
 *   rpcUrl: 'https://rpc.testnet.tempo.xyz',
 *   realm: 'api.example.com',
 *   secretKey: process.env.PAYMENT_SECRET_KEY,
 * })
 *
 * // Or with a viem client
 * const payment = PaymentHandler.tempo({
 *   client,
 *   realm: 'api.example.com',
 *   secretKey: process.env.PAYMENT_SECRET_KEY,
 * })
 * ```
 */
export function tempo(parameters: tempo.Parameters) {
  const { realm, secretKey, feePayer } = parameters

  const client = (() => {
    if (parameters.client) return parameters.client
    return createClient({
      chain: {
        ...tempo_chain,
        id: parameters.chainId,
      },
      transport: http(parameters.rpcUrl),
    })
  })()

  return PaymentHandler.from({
    intents: {
      // TODO: add support for authorize
      // authorize: Intents.authorize,
      charge: Intents.charge,
    },
    method: 'tempo',
    realm,
    secretKey,
    async verify({ credential }) {
      const { challenge } = credential

      switch (challenge.intent) {
        case 'charge': {
          const { request } = challenge
          const { amount, expires, methodDetails } = request

          const currency = request.currency as Address.Address
          const recipient = request.recipient as Address.Address

          if (new Date(expires) < new Date()) throw new Error('Payment request expired')

          const payload = credential.payload

          switch (payload.type) {
            case 'hash': {
              const hash = payload.hash as `0x${string}`
              const receipt = await getTransactionReceipt(client, {
                hash,
              })

              const logs = parseEventLogs({
                abi: Abis.tip20,
                eventName: 'Transfer',
                logs: receipt.logs,
              })

              const match = logs.find(
                (log) =>
                  Address.isEqual(log.address, currency) &&
                  Address.isEqual(log.args.to, recipient) &&
                  log.args.amount.toString() === amount,
              )

              if (!match)
                throw new MismatchError(
                  'Payment verification failed: no matching transfer found.',
                  {
                    amount,
                    currency,
                    recipient,
                  },
                )

              return toReceipt(receipt)
            }

            case 'transaction': {
              const serializedTransaction =
                payload.signature as Transaction.TransactionSerializedTempo
              const transaction = Transaction.deserialize(serializedTransaction)

              const calls = transaction.calls ?? []

              if (calls.length !== 1)
                throw new MismatchError('Invalid transaction: unexpected number of calls', {
                  expected: '1',
                  got: String(calls.length),
                })

              const call = calls[0]!
              if (!call.to || !Address.isEqual(call.to, currency))
                throw new MismatchError(
                  'Invalid transaction: call target does not match currency',
                  {
                    expected: currency,
                    got: call.to ?? '(empty)',
                  },
                )

              if (!call.data)
                throw new MismatchError('Invalid transaction: call data is missing', {
                  expected: transferSelector,
                  got: '(empty)',
                })

              const [to, amount_] = (() => {
                try {
                  return AbiFunction.decodeData(transfer, call.data)
                } catch {
                  throw new MismatchError('Invalid transaction: failed to decode transfer call', {
                    expected: transferSelector,
                    got: call.data.slice(0, 10),
                  })
                }
              })()

              if (!Address.isEqual(to, recipient))
                throw new MismatchError('Invalid transaction: transfer recipient mismatch', {
                  expected: recipient,
                  got: to,
                })

              if (amount_.toString() !== amount)
                throw new MismatchError('Invalid transaction: transfer amount mismatch', {
                  expected: amount,
                  got: amount_.toString(),
                })

              const serializedTransaction_final = await (async () => {
                if (methodDetails?.feePayer && feePayer) {
                  return signTransaction(client, {
                    ...transaction,
                    account: feePayer,
                    feePayer,
                  } as never)
                }
                return serializedTransaction
              })()

              const receipt = await sendRawTransactionSync(client, {
                serializedTransaction: serializedTransaction_final,
              })

              return toReceipt(receipt)
            }

            default:
              throw new Error(
                `Unsupported credential type "${(payload as { type: string }).type}".`,
              )
          }
        }

        default:
          throw new Error(`Unsupported intent "${challenge.intent}".`)
      }
    },
  })
}

export declare namespace tempo {
  type Parameters = {
    /** Optional fee payer account for covering transaction fees. */
    feePayer?: Account | undefined
    /** Server realm (e.g., hostname). */
    realm: string
    /** Secret key for HMAC-bound challenge IDs. */
    secretKey: string
  } & OneOf<
    | {
        /** Viem Client. */
        client: Client
      }
    | {
        /** Tempo chain ID. */
        chainId: number
        /** Tempo RPC URL. */
        rpcUrl: string
      }
  >
}

/** @internal */
export function toReceipt(receipt: TransactionReceipt) {
  return {
    method: 'tempo',
    status: receipt.status === 'success' ? 'success' : 'failed',
    timestamp: new Date().toISOString(),
    reference: receipt.transactionHash,
  } as const
}

/** @internal */
class MismatchError extends Error {
  override readonly name = 'MismatchError'

  constructor(reason: string, details: Record<string, string>) {
    super([reason, ...Object.entries(details).map(([k, v]) => `  - ${k}: ${v}`)].join('\n'))
  }
}
