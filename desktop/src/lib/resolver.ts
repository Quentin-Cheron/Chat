export type ResolvePayload = {
  code: string;
  targetUrl: string;
  redirectTo: string;
  expiresAt: string | null;
};

const resolverBase = (import.meta.env.VITE_RESOLVER_BASE_URL || 'https://localhost').replace(/\/$/, '');

export async function resolveInviteCode(code: string): Promise<ResolvePayload> {
  const response = await fetch(`${resolverBase}/api/resolver/resolve/${encodeURIComponent(code)}`, {
    credentials: 'omit',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `HTTP ${response.status}`);
  }

  return response.json() as Promise<ResolvePayload>;
}

export function humanizeResolverError(message: string): string {
  if (message.includes('Invite code not found')) return 'Code introuvable.';
  if (message.includes('Invite code expired')) return 'Code expire.';
  if (message.includes('Rate limit exceeded')) return 'Trop de tentatives. Reessayez plus tard.';
  return message;
}
