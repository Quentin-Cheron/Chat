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

export function parseDirectInviteLink(input: string): { code: string; redirectTo: string; targetUrl: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/invite\/([^/]+)/);
    if (!match?.[1]) {
      return null;
    }
    const code = decodeURIComponent(match[1]);
    return {
      code,
      targetUrl: url.origin,
      redirectTo: `${url.origin}/invite/${encodeURIComponent(code)}`,
    };
  } catch {
    return null;
  }
}

export function humanizeResolverError(message: string): string {
  if (message.includes('Invite code not found')) return 'Code introuvable.';
  if (message.includes('Invite code expired')) return 'Code expire.';
  if (message.includes('Rate limit exceeded')) return 'Trop de tentatives. Reessayez plus tard.';
  return message;
}
