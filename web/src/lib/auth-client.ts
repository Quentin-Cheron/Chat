import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  // VITE_CONVEX_SITE_URL = URL HTTP de Convex (ex: http://localhost:3210)
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
  plugins: [convexClient(), crossDomainClient()],
});
