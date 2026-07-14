export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function extractResponseErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body = await res.json() as unknown;
    if (!body || typeof body !== 'object') return undefined;

    const error = (body as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;

    if (error && typeof error === 'object') {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
