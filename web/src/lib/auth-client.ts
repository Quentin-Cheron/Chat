import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // VITE_CONVEX_SITE_URL = URL HTTP de Convex (ex: https://xxx.convex.site)
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
  plugins: [crossDomainClient(), convexClient()],
});
