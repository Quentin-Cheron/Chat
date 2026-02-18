import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { createAuth } from "./betterAuth/auth";
import { presignUpload } from "./files";

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

// ── File upload — pre-signed MinIO URL ────────────────────────────────────────
http.route({
  path: "/api/files/presign",
  method: "POST",
  handler: presignUpload,
});

// CORS preflight for /api/files/presign
http.route({
  path: "/api/files/presign",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

export default http;
