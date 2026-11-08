import { createHttpClient } from '@izumi/api-client';
import { clearToken, getToken } from '../../auth/tokenStorage';

export type BlockchainDemo = {
  enabled: boolean;
  connected: boolean;
  demo: true;
  chainId: 31337;
  error?: string;
  deployment?: {
    schemaVersion: 1;
    demo: true;
    chainId: 31337;
    createdAt: string;
    contractAddress: string;
    tokenAddress: string;
    buyer: string;
    seller: string;
    arbiter: string;
    scenarios: Array<{ label: string; orderHash: string; state: number; amountBaseUnits: string }>;
    receipts: Array<{ action: string; hash: string; blockNumber: number; status: number }>;
  };
};

const http = createHttpClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3017',
  getToken,
  onUnauthorized: () => {
    clearToken();
    if (window.location.pathname !== '/login') window.location.assign('/login');
  },
});

export const readBlockchainDemo = () => http.request<BlockchainDemo>('GET', '/blockchain/demo');
