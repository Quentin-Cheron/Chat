import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./betterAuth/auth";
import { presignUpload } from "./files";

const http = httpRouter();

// Register all Better Auth routes via the official component method.
// This handles /api/auth/*, Convex JWT token endpoints, CORS, and JWKS internally.
authComponent.registerRoutes(http, createAuth, { cors: true });

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
