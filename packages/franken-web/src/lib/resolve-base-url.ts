export function resolveBaseUrl(
  locationOrigin: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  configuredApiUrl: string | undefined = import.meta.env.VITE_API_URL as string | undefined,
): string {
  const normalizedApiUrl = configuredApiUrl?.trim().replace(/\/+$/, '');
  return normalizedApiUrl || locationOrigin;
}
