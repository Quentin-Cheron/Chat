import { type AuthConfig } from "convex/server";

const siteUrl = process.env.CONVEX_SITE_URL ?? "http://localhost:3211";

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "convex",
      algorithm: "ES256",
      issuer: siteUrl,
      jwks: `${siteUrl}/api/auth/convex/jwks`,
    },
  ],
} satisfies AuthConfig;
