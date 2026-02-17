import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { createAuth } from "./betterAuth/auth";

const http = httpRouter();

// ── Better Auth HTTP handler ──────────────────────────────────────────────────
const authHandler = httpAction(async (ctx, request) => {
  const auth = createAuth(ctx as any);
  const response = await auth.handler(request);
  return response;
});

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

export default http;
