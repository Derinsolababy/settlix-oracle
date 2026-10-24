import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk';
import { notFound } from './errors.js';
import { fromStroops } from './money.js';

export type InvoiceStatus = 'Open' | 'Paid' | 'Cancelled' | 'PartiallyRefunded' | 'Refunded';

export interface Invoice {
  id: number;
  merchant: string;
  token: string;
  amount: string;
  reference: string;
  status: InvoiceStatus;
  expiresAt: string;
  createdAt: string;
  customer: string | null;
  payee: string | null;
  fee: string;
  refunded: string;
  paidAt: string | null;
}

/** Read-only access to the Settlix contracts through Soroban RPC simulation. */
export interface ChainReader {
  feeBps(): Promise<number>;
  invoice(id: number): Promise<Invoice>;
}

const INVOICE_NOT_FOUND = 9;
const iso = (secs: bigint | number) => new Date(Number(secs) * 1000).toISOString();

export function sorobanReader(opts: {
  rpcUrl: string;
  networkPassphrase: string;
  paymentContractId?: string;
  settlementContractId?: string;
}): ChainReader {
  const server = new rpc.Server(opts.rpcUrl);
  // Simulation does not need the source account to exist or sign.
  const source = Keypair.random().publicKey();

  async function call(contractId: string | undefined, method: string, ...args: xdr.ScVal[]) {
    if (!contractId) throw new Error(`no contract configured for ${method}`);
    const tx = new TransactionBuilder(new Account(source, '0'), {
      fee: BASE_FEE,
      networkPassphrase: opts.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      const code = /Error\(Contract, #(\d+)\)/.exec(sim.error)?.[1];
      throw Object.assign(new Error(`${method} failed: ${code ? `contract error #${code}` : sim.error.slice(0, 200)}`), {
        contractCode: code ? Number(code) : undefined,
      });
    }
    return scValToNative(sim.result!.retval);
  }

  return {
    async feeBps() {
      return Number(await call(opts.settlementContractId, 'fee_bps'));
    },
    async invoice(id) {
      let raw: any;
      try {
        raw = await call(opts.paymentContractId, 'get_invoice', nativeToScVal(id, { type: 'u64' }));
      } catch (err) {
        if ((err as { contractCode?: number }).contractCode === INVOICE_NOT_FOUND) throw notFound(`invoice ${id} not found`);
        throw err;
      }
      return {
        id: Number(raw.id),
        merchant: raw.merchant,
        token: raw.token,
        amount: fromStroops(BigInt(raw.amount)),
        reference: raw.reference,
        // Unit enum variants decode as a one-element array, e.g. ['Paid'].
        status: (Array.isArray(raw.status) ? raw.status[0] : raw.status) as InvoiceStatus,
        expiresAt: iso(raw.expires_at),
        createdAt: iso(raw.created_at),
        customer: raw.customer ?? null,
        payee: raw.payee ?? null,
        fee: fromStroops(BigInt(raw.fee)),
        refunded: fromStroops(BigInt(raw.refunded)),
        paidAt: BigInt(raw.paid_at) > 0n ? iso(raw.paid_at) : null,
      };
    },
  };
}

/**
 * Fee rate with a cache: read from the settlement contract when configured,
 * otherwise the configured default. A failed refresh keeps the last value.
 */
export function cachedFeeBps(reader: ChainReader | null, fallback: number, ttlMs = 300_000, now = Date.now) {
  let value = fallback;
  let fetchedAt = -Infinity;
  return async () => {
    if (reader && now() - fetchedAt > ttlMs) {
      // Stamp before the call so a failing RPC is retried once per ttl, not per request.
      fetchedAt = now();
      try {
        value = await reader.feeBps();
      } catch {
        /* keep last known value */
      }
    }
    return value;
  };
}
