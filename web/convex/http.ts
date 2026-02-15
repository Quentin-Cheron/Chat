import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { createAuth } from "./betterAuth/auth";

const http = httpRouter();

// ── Better Auth HTTP handler ──────────────────────────────────────────────────
// Handles all /api/auth/* routes (sign-in, sign-up, get-session, etc.)
const authHandler = httpAction(async (ctx, request) => {
  const auth = createAuth(ctx as any);
  const response = await auth.handler(request);
  return response;
});

// Register all Better Auth routes under /api/auth/
http.route({
  pathPrefix: "/api/auth/",
  method: "GET",
  handler: authHandler,
});
http.route({
  pathPrefix: "/api/auth/",
  method: "POST",
  handler: authHandler,
});
http.route({
  path: "/api/auth",
  method: "GET",
  handler: authHandler,
});

// ── Resolver HTTP routes ──────────────────────────────────────────────────────

function checkResolverToken(request: Request): boolean {
  const token = request.headers.get("x-resolver-token");
  const expected = process.env.RESOLVER_REGISTER_TOKEN;
  if (!token || !expected || token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function cors(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

http.route({
  pathPrefix: "/api/resolver/resolve/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.pathname.replace(/^\/api\/resolver\/resolve\//, "");
    try {
      const result = await ctx.runQuery(internal.resolver.resolve, { code });
      await ctx.runMutation(internal.resolver.incrementResolveCount, {
        code: result.code,
      });
      return cors(JSON.stringify(result));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      const status = msg.includes("not found")
        ? 404
        : msg.includes("expired")
          ? 410
          : 400;
      return cors(JSON.stringify({ error: msg }), status);
    }
  }),
});

http.route({
  path: "/api/resolver/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!checkResolverToken(request)) {
      return cors(JSON.stringify({ error: "resolver token is invalid" }), 403);
    }
    try {
      const body = (await request.json()) as {
        code: string;
        targetUrl: string;
        expiresAt?: string | null;
      };
      const expiresAt = body.expiresAt
        ? new Date(body.expiresAt).getTime()
        : undefined;
      if (expiresAt !== undefined && Number.isNaN(expiresAt)) {
        return cors(JSON.stringify({ error: "expiresAt is invalid" }), 400);
      }
      const result = await ctx.runMutation(internal.resolver.register, {
        code: body.code,
        targetUrl: body.targetUrl,
        expiresAt,
      });
      return cors(JSON.stringify(result));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      return cors(JSON.stringify({ error: msg }), 400);
    }
  }),
});

http.route({
  path: "/api/resolver/stats",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!checkResolverToken(request)) {
      return cors(JSON.stringify({ error: "resolver token is invalid" }), 403);
    }
    const result = await ctx.runQuery(internal.resolver.stats, {});
    return cors(JSON.stringify(result));
  }),
});

http.route({
  path: "/api/resolver/expired",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    if (!checkResolverToken(request)) {
      return cors(JSON.stringify({ error: "resolver token is invalid" }), 403);
    }
    const result = await ctx.runMutation(internal.resolver.purgeExpired, {});
    return cors(JSON.stringify(result));
  }),
});

export default http;
