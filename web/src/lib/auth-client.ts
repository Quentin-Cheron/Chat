import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// VITE_CONVEX_SITE_URL = base du site Convex (ex: https://chat.private-chat.site/convex-site)
// Better Auth appelle baseURL + basePath + /endpoint
// Sur cloud: https://xxx.convex.site/api/auth/get-session
// Sur self-hosted: https://domain/convex-site/api/auth/get-session
const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string;

export const authClient = createAuthClient({
  baseURL: convexSiteUrl,
  plugins: [crossDomainClient(), convexClient()],
});
