import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  type ClientOptions as ContractClientOptions,
  type MethodOptions,
  type Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CC6KIYZ4BZXVG4XT33XIF7PNSHDGY65VWV6ZWSUG56JEVB6VRFENJP6T",
  }
} as const

export const Errors = {
  1: {message:"OrderNotFound"},
  2: {message:"ShareNotFound"},
  3: {message:"NoShares"},
  4: {message:"TooManyShares"},
  5: {message:"InvalidAmount"},
  6: {message:"InvalidDeadline"},
  7: {message:"InvalidPrice"},
  8: {message:"InvalidState"},
  9: {message:"AlreadyPaid"},
  10: {message:"AlreadyDelivered"},
  11: {message:"NoOffer"},
  12: {message:"SelfPurchase"},
  13: {message:"Expired"},
  14: {message:"NotExpired"},
  15: {message:"Overflow"}
}


export interface Order {
  buyer: string;
  deadline: u64;
  /**
 * Amount already returned to the buyer.
 */
refunded: i128;
  /**
 * Amount already paid out to share owners.
 */
released: i128;
  shares: Array<Share>;
  status: OrderStatus;
  token: string;
  total: i128;
}


/**
 * One supplier's slice of the order, tracked through delivery and payment.
 */
export interface Share {
  amount: i128;
  delivered: boolean;
  label: string;
  /**
 * Advance price at which the owner offers the claim, if any.
 */
offer_price: Option<i128>;
  /**
 * Current owner of the payment claim (supplier, or the investor who bought it).
 */
owner: string;
  paid: boolean;
  refunded: boolean;
  /**
 * Original supplier; the only account that may call `mark_delivered`.
 */
supplier: string;
}


/**
 * Input describing one supplier's slice of a shared order.
 */
export interface ShareInput {
  amount: i128;
  label: string;
  supplier: string;
}

export type OrderStatus = {tag: "Created", values: void} | {tag: "Funded", values: void} | {tag: "Completed", values: void} | {tag: "Refunded", values: void} | {tag: "PartiallyRefunded", values: void};










export interface Client {
  /**
   * Construct and simulate a fund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lock the full order total in escrow. Buyer signs (which also authorizes
   * the token transfer). Only possible before the deadline.
   */
  fund: ({order_id}: {order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a buy_share transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * An investor buys the open offer: `price` moves from the investor to the
   * current owner and the investor becomes the owner of the claim. The claim
   * is backed by funds already locked in escrow, so the investor bears only
   * delivery risk, not the buyer's credit risk.
   */
  buy_share: ({order_id, index, investor}: {order_id: u64, index: u32, investor: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_order: ({order_id}: {order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Order>>>

  /**
   * Construct and simulate a offer_share transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The current owner offers the claim at an advance `price`
   * (`0 < price <= amount`). Calling again replaces the previous offer.
   */
  offer_share: ({order_id, index, price}: {order_id: u64, index: u32, price: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a order_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  order_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a cancel_offer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The current owner withdraws an open offer.
   */
  cancel_offer: ({order_id, index}: {order_id: u64, index: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create an order. The buyer signs; funds are not moved until `fund`.
   * Returns the new order id (ids start at 1).
   */
  create_order: ({buyer, token, shares, deadline}: {buyer: string, token: string, shares: Array<ShareInput>, deadline: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a mark_delivered transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The share's original supplier declares the work delivered. This is a
   * signal only; it never moves money. Payment still needs the buyer's
   * `confirm_delivery`.
   */
  mark_delivered: ({order_id, index}: {order_id: u64, index: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a refund_expired transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * After the deadline anyone may trigger a refund of every unpaid share to
   * the buyer. Status becomes `Refunded` if nothing had been paid out,
   * otherwise `PartiallyRefunded`. An investor holding an undelivered share
   * loses it (delivery risk); the buyer decides acceptance by confirming
   * before the deadline.
   */
  refund_expired: ({order_id}: {order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a confirm_delivery transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The buyer accepts delivery of a share and releases its amount to the
   * CURRENT owner of the claim (the supplier, or the investor who bought it).
   * 
   * The buyer's acceptance is what matters: this works even if the supplier
   * never called `mark_delivered`. When every share is paid the order
   * becomes `Completed`.
   */
  confirm_delivery: ({order_id, index}: {order_id: u64, index: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static override async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public override readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAH9Mb2NrIHRoZSBmdWxsIG9yZGVyIHRvdGFsIGluIGVzY3Jvdy4gQnV5ZXIgc2lnbnMgKHdoaWNoIGFsc28gYXV0aG9yaXplcwp0aGUgdG9rZW4gdHJhbnNmZXIpLiBPbmx5IHBvc3NpYmxlIGJlZm9yZSB0aGUgZGVhZGxpbmUuAAAAAARmdW5kAAAAAQAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAQRBbiBpbnZlc3RvciBidXlzIHRoZSBvcGVuIG9mZmVyOiBgcHJpY2VgIG1vdmVzIGZyb20gdGhlIGludmVzdG9yIHRvIHRoZQpjdXJyZW50IG93bmVyIGFuZCB0aGUgaW52ZXN0b3IgYmVjb21lcyB0aGUgb3duZXIgb2YgdGhlIGNsYWltLiBUaGUgY2xhaW0KaXMgYmFja2VkIGJ5IGZ1bmRzIGFscmVhZHkgbG9ja2VkIGluIGVzY3Jvdywgc28gdGhlIGludmVzdG9yIGJlYXJzIG9ubHkKZGVsaXZlcnkgcmlzaywgbm90IHRoZSBidXllcidzIGNyZWRpdCByaXNrLgAAAAlidXlfc2hhcmUAAAAAAAADAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAAAAAAABWluZGV4AAAAAAAABAAAAAAAAAAIaW52ZXN0b3IAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAJZ2V0X29yZGVyAAAAAAAAAQAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAQAAA+kAAAfQAAAABU9yZGVyAAAAAAAAAw==",
        "AAAAAAAAAHxUaGUgY3VycmVudCBvd25lciBvZmZlcnMgdGhlIGNsYWltIGF0IGFuIGFkdmFuY2UgYHByaWNlYAooYDAgPCBwcmljZSA8PSBhbW91bnRgKS4gQ2FsbGluZyBhZ2FpbiByZXBsYWNlcyB0aGUgcHJldmlvdXMgb2ZmZXIuAAAAC29mZmVyX3NoYXJlAAAAAAMAAAAAAAAACG9yZGVyX2lkAAAABgAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAAVwcmljZQAAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAALb3JkZXJfY291bnQAAAAAAAAAAAEAAAAG",
        "AAAAAAAAACpUaGUgY3VycmVudCBvd25lciB3aXRoZHJhd3MgYW4gb3BlbiBvZmZlci4AAAAAAAxjYW5jZWxfb2ZmZXIAAAACAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAAAAAAABWluZGV4AAAAAAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAG5DcmVhdGUgYW4gb3JkZXIuIFRoZSBidXllciBzaWduczsgZnVuZHMgYXJlIG5vdCBtb3ZlZCB1bnRpbCBgZnVuZGAuClJldHVybnMgdGhlIG5ldyBvcmRlciBpZCAoaWRzIHN0YXJ0IGF0IDEpLgAAAAAADGNyZWF0ZV9vcmRlcgAAAAQAAAAAAAAABWJ1eWVyAAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZzaGFyZXMAAAAAA+oAAAfQAAAAClNoYXJlSW5wdXQAAAAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAAJtUaGUgc2hhcmUncyBvcmlnaW5hbCBzdXBwbGllciBkZWNsYXJlcyB0aGUgd29yayBkZWxpdmVyZWQuIFRoaXMgaXMgYQpzaWduYWwgb25seTsgaXQgbmV2ZXIgbW92ZXMgbW9uZXkuIFBheW1lbnQgc3RpbGwgbmVlZHMgdGhlIGJ1eWVyJ3MKYGNvbmZpcm1fZGVsaXZlcnlgLgAAAAAObWFya19kZWxpdmVyZWQAAAAAAAIAAAAAAAAACG9yZGVyX2lkAAAABgAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAASxBZnRlciB0aGUgZGVhZGxpbmUgYW55b25lIG1heSB0cmlnZ2VyIGEgcmVmdW5kIG9mIGV2ZXJ5IHVucGFpZCBzaGFyZSB0bwp0aGUgYnV5ZXIuIFN0YXR1cyBiZWNvbWVzIGBSZWZ1bmRlZGAgaWYgbm90aGluZyBoYWQgYmVlbiBwYWlkIG91dCwKb3RoZXJ3aXNlIGBQYXJ0aWFsbHlSZWZ1bmRlZGAuIEFuIGludmVzdG9yIGhvbGRpbmcgYW4gdW5kZWxpdmVyZWQgc2hhcmUKbG9zZXMgaXQgKGRlbGl2ZXJ5IHJpc2spOyB0aGUgYnV5ZXIgZGVjaWRlcyBhY2NlcHRhbmNlIGJ5IGNvbmZpcm1pbmcKYmVmb3JlIHRoZSBkZWFkbGluZS4AAAAOcmVmdW5kX2V4cGlyZWQAAAAAAAEAAAAAAAAACG9yZGVyX2lkAAAABgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAS5UaGUgYnV5ZXIgYWNjZXB0cyBkZWxpdmVyeSBvZiBhIHNoYXJlIGFuZCByZWxlYXNlcyBpdHMgYW1vdW50IHRvIHRoZQpDVVJSRU5UIG93bmVyIG9mIHRoZSBjbGFpbSAodGhlIHN1cHBsaWVyLCBvciB0aGUgaW52ZXN0b3Igd2hvIGJvdWdodCBpdCkuCgpUaGUgYnV5ZXIncyBhY2NlcHRhbmNlIGlzIHdoYXQgbWF0dGVyczogdGhpcyB3b3JrcyBldmVuIGlmIHRoZSBzdXBwbGllcgpuZXZlciBjYWxsZWQgYG1hcmtfZGVsaXZlcmVkYC4gV2hlbiBldmVyeSBzaGFyZSBpcyBwYWlkIHRoZSBvcmRlcgpiZWNvbWVzIGBDb21wbGV0ZWRgLgAAAAAAEGNvbmZpcm1fZGVsaXZlcnkAAAACAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAAAAAAABWluZGV4AAAAAAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADwAAAAAAAAANT3JkZXJOb3RGb3VuZAAAAAAAAAEAAAAAAAAADVNoYXJlTm90Rm91bmQAAAAAAAACAAAAAAAAAAhOb1NoYXJlcwAAAAMAAAAAAAAADVRvb01hbnlTaGFyZXMAAAAAAAAEAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAABQAAAAAAAAAPSW52YWxpZERlYWRsaW5lAAAAAAYAAAAAAAAADEludmFsaWRQcmljZQAAAAcAAAAAAAAADEludmFsaWRTdGF0ZQAAAAgAAAAAAAAAC0FscmVhZHlQYWlkAAAAAAkAAAAAAAAAEEFscmVhZHlEZWxpdmVyZWQAAAAKAAAAAAAAAAdOb09mZmVyAAAAAAsAAAAAAAAADFNlbGZQdXJjaGFzZQAAAAwAAAAAAAAAB0V4cGlyZWQAAAAADQAAAAAAAAAKTm90RXhwaXJlZAAAAAAADgAAAAAAAAAIT3ZlcmZsb3cAAAAP",
        "AAAAAQAAAAAAAAAAAAAABU9yZGVyAAAAAAAACAAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAAhkZWFkbGluZQAAAAYAAAAlQW1vdW50IGFscmVhZHkgcmV0dXJuZWQgdG8gdGhlIGJ1eWVyLgAAAAAAAAhyZWZ1bmRlZAAAAAsAAAAoQW1vdW50IGFscmVhZHkgcGFpZCBvdXQgdG8gc2hhcmUgb3duZXJzLgAAAAhyZWxlYXNlZAAAAAsAAAAAAAAABnNoYXJlcwAAAAAD6gAAB9AAAAAFU2hhcmUAAAAAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAtPcmRlclN0YXR1cwAAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAFdG90YWwAAAAAAAAL",
        "AAAAAQAAAEhPbmUgc3VwcGxpZXIncyBzbGljZSBvZiB0aGUgb3JkZXIsIHRyYWNrZWQgdGhyb3VnaCBkZWxpdmVyeSBhbmQgcGF5bWVudC4AAAAAAAAABVNoYXJlAAAAAAAACAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAlkZWxpdmVyZWQAAAAAAAABAAAAAAAAAAVsYWJlbAAAAAAAABAAAAA6QWR2YW5jZSBwcmljZSBhdCB3aGljaCB0aGUgb3duZXIgb2ZmZXJzIHRoZSBjbGFpbSwgaWYgYW55LgAAAAAAC29mZmVyX3ByaWNlAAAAA+gAAAALAAAATUN1cnJlbnQgb3duZXIgb2YgdGhlIHBheW1lbnQgY2xhaW0gKHN1cHBsaWVyLCBvciB0aGUgaW52ZXN0b3Igd2hvIGJvdWdodCBpdCkuAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAEcGFpZAAAAAEAAAAAAAAACHJlZnVuZGVkAAAAAQAAAENPcmlnaW5hbCBzdXBwbGllcjsgdGhlIG9ubHkgYWNjb3VudCB0aGF0IG1heSBjYWxsIGBtYXJrX2RlbGl2ZXJlZGAuAAAAAAhzdXBwbGllcgAAABM=",
        "AAAAAQAAADhJbnB1dCBkZXNjcmliaW5nIG9uZSBzdXBwbGllcidzIHNsaWNlIG9mIGEgc2hhcmVkIG9yZGVyLgAAAAAAAAAKU2hhcmVJbnB1dAAAAAAAAwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAVsYWJlbAAAAAAAABAAAAAAAAAACHN1cHBsaWVyAAAAEw==",
        "AAAAAgAAAAAAAAAAAAAAC09yZGVyU3RhdHVzAAAAAAUAAAAAAAAAAAAAAAdDcmVhdGVkAAAAAAAAAAAAAAAABkZ1bmRlZAAAAAAAAAAAAAAAAAAJQ29tcGxldGVkAAAAAAAAAAAAAAAAAAAIUmVmdW5kZWQAAAAAAAAAAAAAABFQYXJ0aWFsbHlSZWZ1bmRlZAAAAA==",
        "AAAABQAAAAAAAAAAAAAACVNoYXJlUGFpZAAAAAAAAAEAAAAKc2hhcmVfcGFpZAAAAAAABAAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAQAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAQAAAAAAAAACdG8AAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACVNoYXJlU29sZAAAAAAAAAEAAAAKc2hhcmVfc29sZAAAAAAABQAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAQAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAQAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAAAAAAIaW52ZXN0b3IAAAATAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC09yZGVyRnVuZGVkAAAAAAEAAAAMb3JkZXJfZnVuZGVkAAAAAwAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAQAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAAAAAAAFdG90YWwAAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADE9yZGVyQ3JlYXRlZAAAAAEAAAANb3JkZXJfY3JlYXRlZAAAAAAAAAUAAAAAAAAACG9yZGVyX2lkAAAABgAAAAEAAAAAAAAABWJ1eWVyAAAAAAAAEwAAAAAAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAAAAAABXRvdGFsAAAAAAAACwAAAAAAAAAAAAAACGRlYWRsaW5lAAAABgAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADFNoYXJlT2ZmZXJlZAAAAAEAAAANc2hhcmVfb2ZmZXJlZAAAAAAAAAQAAAAAAAAACG9yZGVyX2lkAAAABgAAAAEAAAAAAAAABWluZGV4AAAAAAAABAAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADU9yZGVyUmVmdW5kZWQAAAAAAAABAAAADm9yZGVyX3JlZnVuZGVkAAAAAAAEAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAABAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAdwYXJ0aWFsAAAAAAEAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADk9mZmVyQ2FuY2VsbGVkAAAAAAABAAAAD29mZmVyX2NhbmNlbGxlZAAAAAADAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAABAAAAAAAAAAVpbmRleAAAAAAAAAQAAAABAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADk9yZGVyQ29tcGxldGVkAAAAAAABAAAAD29yZGVyX2NvbXBsZXRlZAAAAAACAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAABAAAAAAAAAAhyZWxlYXNlZAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADlNoYXJlRGVsaXZlcmVkAAAAAAABAAAAD3NoYXJlX2RlbGl2ZXJlZAAAAAADAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAABAAAAAAAAAAVpbmRleAAAAAAAAAQAAAABAAAAAAAAAAhzdXBwbGllcgAAABMAAAAAAAAAAg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    fund: this.txFromJSON<Result<void>>,
        buy_share: this.txFromJSON<Result<void>>,
        get_order: this.txFromJSON<Result<Order>>,
        offer_share: this.txFromJSON<Result<void>>,
        order_count: this.txFromJSON<u64>,
        cancel_offer: this.txFromJSON<Result<void>>,
        create_order: this.txFromJSON<Result<u64>>,
        mark_delivered: this.txFromJSON<Result<void>>,
        refund_expired: this.txFromJSON<Result<void>>,
        confirm_delivery: this.txFromJSON<Result<void>>
  }
}