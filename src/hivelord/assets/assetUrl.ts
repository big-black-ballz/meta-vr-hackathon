/**
 * Resolves an app-relative asset path against the build base URL, so the
 * same code works at the domain root and under a sub-path (GitHub Pages).
 * Every asset and decoder URL in the Hivelord pipeline goes through here.
 */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const clean = path.replace(/^\/+/u, '');
  if (base === './' || base === '.' || base === '') {
    return clean;
  }
  const rooted = base.endsWith('/') ? base : `${base}/`;
  return `${rooted}${clean}`;
}
