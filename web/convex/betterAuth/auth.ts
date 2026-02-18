import { createClient } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { action } from "../_generated/server";
import authConfig from "../auth.config";
import schema from "./schema";

// Better Auth Component
export const authComponent = createClient<DataModel, typeof schema>(
  components.betterAuth,
  {
    local: { schema },
    verbose: false,
  },
);

const siteUrl = process.env.SITE_URL ?? "http://localhost:5173";

// Better Auth Options
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  return {
    appName: "My App",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({
        authConfig,
        ...(process.env.JWKS ? { jwks: process.env.JWKS } : {}),
      }),
    ],
  } satisfies BetterAuthOptions;
};

// For `@better-auth/cli`
export const options = createAuthOptions({} as GenericCtx<DataModel>);

// Better Auth Instance
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};

// Action publique pour récupérer les JWKS courants (utilisé lors de l'install via CLI)
export const getLatestJwks = action({
  args: {},
  handler: async (ctx) => {
    const auth = createAuth(ctx as unknown as GenericCtx<DataModel>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (auth.api as any).getLatestJwks();
  },
});
