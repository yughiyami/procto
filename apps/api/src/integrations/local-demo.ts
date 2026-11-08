import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JsonRpcProvider } from 'ethers';
import { z } from 'zod';
import { isLocalMinkaly, type MinkalyConfig } from './minkaly.js';

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const hash = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const manifestSchema = z.object({schemaVersion:z.literal(1),demo:z.literal(true),chainId:z.literal(31337),createdAt:z.string(),contractAddress:address,tokenAddress:address,buyer:address,seller:address,arbiter:address,scenarios:z.array(z.object({label:z.string(),orderHash:hash,state:z.number().int(),amountBaseUnits:z.string()})).max(10),receipts:z.array(z.object({action:z.string(),hash,blockNumber:z.number().int(),status:z.literal(1)})).max(50)});

/** Walk package markers rather than assume src and tsc output have equal depth. */
export async function localDemoManifestPath(moduleUrl = import.meta.url): Promise<string> {
  let directory = dirname(fileURLToPath(moduleUrl));
  for (let depth = 0; depth < 10; depth++) {
    try {
      const pkg = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')) as {name?: string};
      if (pkg.name === 'izumi') return resolve(directory, 'scripts/contracts/dist/local-demo.json');
    } catch { /* A source directory normally has no package marker. */ }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error('Izumi workspace root not found');
}

/** Public synthetic evidence only; authentication supplied by the app. No write/sign RPC. */
export async function readLocalDemo(config: MinkalyConfig) {
  const base = {enabled:isLocalMinkaly(config),connected:false,demo:true as const,chainId:31337 as const};
  if (!base.enabled) return base;
  const provider = new JsonRpcProvider(config.rpcUrl);
  try {
    const deployment = manifestSchema.parse(JSON.parse(await readFile(await localDemoManifestPath(),'utf8')));
    if (deployment.contractAddress.toLowerCase() !== config.contractAddress.toLowerCase()) throw new Error('Configured address mismatch');
    if ((await provider.getNetwork()).chainId !== 31337n || (await provider.getCode(deployment.contractAddress)) === '0x') throw new Error('Local contract unavailable');
    for (const receipt of deployment.receipts) {
      const onChain = await provider.getTransactionReceipt(receipt.hash);
      if (onChain?.status !== 1 || onChain.blockNumber !== receipt.blockNumber) throw new Error('Demo receipt not verified');
    }
    return {...base,connected:true,deployment};
  } catch { return {...base,error:'Local DEMO unavailable or stale. Start scripts/contracts/local/server.mjs and update the contract address.'}; }
  finally {provider.destroy();}
}
