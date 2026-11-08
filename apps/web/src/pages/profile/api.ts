import { createHttpClient } from '@izumi/api-client';
import { clearToken, getToken } from '../../auth/tokenStorage';

export type ProfileInput = { name: string; city: string; activity: 'seller' | 'coordinator' | 'both'; products: string[] };
export type Profile = ProfileInput & { completed: boolean; updatedAt: string | null };
const http = createHttpClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3017', getToken,
  onUnauthorized: () => { clearToken(); window.location.assign('/login'); },
});
export const profileApi = {
  get: () => http.request<Profile>('GET', '/profile'),
  save: (body: ProfileInput) => http.request<Profile>('POST', '/profile', { body }),
};
