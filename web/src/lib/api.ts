// Fonctions restantes qui appellent encore le serveur NestJS (auth + resolver)
// Workspaces/channels/messages/members/invites → gérés par Convex (voir convex/)

export type ResolvedInvitePayload = {
  code: string;
  targetUrl: string;
  redirectTo: string;
  expiresAt: string | null;
};

const resolverBaseUrl = (
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_RESOLVER_BASE_URL || ""
).replace(/\/$/, "");

export const publicJoinBaseUrl = (
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_PUBLIC_JOIN_BASE_URL || ""
).replace(/\/$/, "");

async function resolverRequest<T>(path: string): Promise<T> {
  const resolvedPath = resolverBaseUrl ? `${resolverBaseUrl}${path}` : path;
  const response = await fetch(resolvedPath, { credentials: "omit" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function resolveInviteCode(
  code: string,
): Promise<ResolvedInvitePayload> {
  return resolverRequest<ResolvedInvitePayload>(
    `/api/resolver/resolve/${encodeURIComponent(code)}`,
  );
}
