export function resolveBaseUrl(
  locationOrigin: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  configuredApiUrl: string | undefined = import.meta.env.VITE_API_URL as string | undefined,
): string {
  void configuredApiUrl;
  return locationOrigin;
}
