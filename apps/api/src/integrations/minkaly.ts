import { Contract, Interface, JsonRpcProvider, ZeroAddress, getAddress, isHexString } from 'ethers';

/** Interface signatures inspected at DAM2323/Minkaly/contracts/MinkalyEscrow.sol (SPDX MIT).
 * This is an escrow interface, NOT a generic evidence anchoring contract. No source copied.
 */
export const MINKALY_ABI = [
  'function retain(bytes32 orderId,address seller,uint256 amount,uint64 releaseAt)',
  'function release(bytes32 orderId)', 'function claim(bytes32 orderId)',
  'function resolve(bytes32 orderId,bool toSeller)', 'function settleExpiredClaim(bytes32 orderId)',
  'function token() view returns(address)',
  'function deals(bytes32) view returns(address client,address seller,uint256 amount,uint64 releaseAt,uint64 disputeDeadline,uint8 state)',
] as const;
export type MinkalyConfig = { chainId: number; contractAddress: string; rpcUrl?: string; demoEnabled?: boolean };
export function isLocalMinkaly(config: MinkalyConfig): boolean {
  if (!config.demoEnabled || config.chainId !== 31337 || !config.rpcUrl) return false;
  try { const url = new URL(config.rpcUrl); return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '8547' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash; } catch { return false; }
}
export type MinkalyAction = { action: 'retain'; orderHash: string; seller: string; amountBaseUnits: string; releaseAt: number } | { action: 'release' | 'claim' | 'settleExpiredClaim'; orderHash: string };
function check(config: MinkalyConfig, hash: string) {
  if (config.chainId !== 11155111 && !isLocalMinkaly(config)) throw new Error('Only Sepolia or explicitly enabled loopback DEMO is permitted');
  if (!isHexString(hash, 32)) throw new Error('orderHash must be bytes32; never submit PII');
  const address = getAddress(config.contractAddress);
  if (address === ZeroAddress) throw new Error('Contract address is required');
  return address;
}

/** Returns unsigned calldata for a separately connected testnet wallet. Never signs or broadcasts.
 * retain also requires buyer token balance/allowance; amount is raw token units, NOT PEN.
 * Prepared calldata does not prove contract code, role authorization or current state validity.
 */
export function prepareMinkalyTransaction(config: MinkalyConfig, input: MinkalyAction, nowSeconds = Math.floor(Date.now() / 1000)) {
  const to = check(config, input.orderHash);
  const iface = new Interface(MINKALY_ABI);
  let args: unknown[] = [input.orderHash];
  if (input.action === 'retain') {
    const seller = getAddress(input.seller);
    if (seller === ZeroAddress || !/^[1-9]\d{0,77}$/.test(input.amountBaseUnits) || BigInt(input.amountBaseUnits) >= 2n ** 256n) throw new Error('Invalid seller or token amount');
    if (!Number.isSafeInteger(input.releaseAt) || input.releaseAt <= nowSeconds) throw new Error('releaseAt must be a future Unix timestamp');
    args = [input.orderHash, seller, input.amountBaseUnits, input.releaseAt];
  } else if (!['release', 'claim', 'settleExpiredClaim'].includes(input.action)) throw new Error('Unsupported action');
  return { chainId: config.chainId, to, data: iface.encodeFunctionData(input.action, args), value: '0', requiresWalletSignature: true, testnetOnly: true };
}

export async function readMinkalyDeal(config: MinkalyConfig, orderHash: string) {
  const address = check(config, orderHash);
  if (!config.rpcUrl || (!isLocalMinkaly(config) && new URL(config.rpcUrl).protocol !== 'https:')) throw new Error('HTTPS MINKALY_RPC_URL required outside local DEMO');
  const provider = new JsonRpcProvider(config.rpcUrl);
  try {
    if ((await provider.getNetwork()).chainId !== BigInt(config.chainId)) throw new Error('RPC chain mismatch');
    if ((await provider.getCode(address)) === '0x') throw new Error('No contract deployed at configured address');
    const contract = new Contract(address, MINKALY_ABI, provider);
    const deal = await contract.getFunction('deals')(orderHash);
    return { client: String(deal[0]), seller: String(deal[1]), amountBaseUnits: String(deal[2]), releaseAt: String(deal[3]), disputeDeadline: String(deal[4]), state: Number(deal[5]), chainId: config.chainId };
  } finally { provider.destroy(); }
}
