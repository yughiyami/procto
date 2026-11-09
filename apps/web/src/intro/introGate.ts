/** Decides whether /demo opens with the intro video. Pure; unit-tested. */
export function shouldShowIntro(search: string, seen: boolean): boolean {
  const flag = new URLSearchParams(search).get('intro');
  if (flag === '0') return false;
  if (flag === '1') return true;
  return !seen;
}
