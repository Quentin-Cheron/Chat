import { useCallback, useMemo } from "react";
import { authClient } from "./auth-client";

/**
 * Hook qui fournit le token JWT better-auth à ConvexProviderWithAuth.
 * better-auth expose le token via la session — on le récupère à chaque
 * refresh pour que Convex puisse valider les requêtes.
 */
export function useBetterAuthForConvex() {
  const { data: session, isPending } = authClient.useSession();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      // better-auth stocke le token de session dans un cookie httpOnly.
      // Pour Convex, on a besoin d'un JWT signé côté serveur.
      // On appelle l'endpoint better-auth pour obtenir le token JWT.
      try {
        const res = await fetch("/api/auth/token", {
          credentials: "include",
          headers: forceRefreshToken ? { "Cache-Control": "no-cache" } : {},
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { token?: string };
        return data.token ?? null;
      } catch {
        return null;
      }
    },
    [],
  );

  return useMemo(
    () => ({
      isLoading: isPending,
      isAuthenticated: Boolean(session?.user),
      fetchAccessToken,
    }),
    [isPending, session?.user, fetchAccessToken],
  );
}
