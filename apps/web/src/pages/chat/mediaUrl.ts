/** UI guard only. The API must independently enforce its public-media policy. */
export function validMediaUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password &&
      host.includes('.') && !host.endsWith('.local') && !host.endsWith('.localhost') &&
      !/^\d+(\.\d+){3}$/.test(host) && !host.includes(':');
  } catch { return false; }
}
