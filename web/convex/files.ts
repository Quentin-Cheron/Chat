import { httpAction } from "./_generated/server";
import { requireAuth } from "./_helpers";

/**
 * POST /api/files/presign
 * Body: { fileName: string, mimeType: string, size: number }
 * Returns: { uploadUrl: string, storageKey: string, publicUrl: string }
 *
 * Generates a pre-signed S3/MinIO PUT URL so the browser can upload
 * directly to MinIO without exposing credentials to the client.
 */
export const presignUpload = httpAction(async (ctx, request) => {
  // Auth check
  try {
    await requireAuth(ctx);
  } catch {
    return new Response(JSON.stringify({ error: "Unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // CORS preflight passthrough (OPTIONS handled separately in http.ts)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  let body: { fileName?: string; mimeType?: string; size?: number };
  try {
    body = (await request.json()) as {
      fileName?: string;
      mimeType?: string;
      size?: number;
    };
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { fileName, mimeType, size } = body;

  if (!fileName || !mimeType || !size) {
    return jsonError("Missing required fields: fileName, mimeType, size", 400);
  }

  if (size > 50 * 1024 * 1024) {
    return jsonError("File too large (max 50 MB)", 400);
  }

  const allowedMimes = [
    "image/",
    "video/",
    "audio/",
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "text/plain",
    "text/csv",
  ];
  const allowed = allowedMimes.some((prefix) => mimeType.startsWith(prefix));
  if (!allowed) {
    return jsonError("File type not allowed", 400);
  }

  const minioInternalUrl =
    process.env.MINIO_INTERNAL_URL ?? "http://minio:9000";
  const minioPublicUrl =
    process.env.MINIO_PUBLIC_URL ?? minioInternalUrl;
  const bucket = process.env.MINIO_BUCKET ?? "chat-uploads";
  const accessKey = process.env.MINIO_ROOT_USER ?? "minioadmin";
  const secretKey = process.env.MINIO_ROOT_PASSWORD ?? "minioadmin123";

  // Build a unique storage key: timestamp + random + sanitised extension
  const ext = (fileName.split(".").pop() ?? "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const storageKey = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

  let uploadUrl: string;
  try {
    uploadUrl = await buildPresignedPutUrl({
      endpoint: minioInternalUrl,
      bucket,
      key: storageKey,
      accessKey,
      secretKey,
      mimeType,
      expiresIn: 300, // 5 minutes
    });
  } catch (e) {
    console.error("[presignUpload] Failed to build presigned URL:", e);
    return jsonError("Failed to generate upload URL", 500);
  }

  // The public URL uses the Caddy-proxied /files path
  const publicUrl = `${minioPublicUrl}/${bucket}/${storageKey}`;

  return new Response(
    JSON.stringify({ uploadUrl, storageKey, publicUrl }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    },
  );
});

// ── Helpers ────────────────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

/**
 * Minimal AWS Signature V4 pre-signed URL builder.
 * Works with MinIO (S3-compatible). No external SDK required — uses only
 * the Web Crypto API available in the Convex runtime.
 */
async function buildPresignedPutUrl(opts: {
  endpoint: string;
  bucket: string;
  key: string;
  accessKey: string;
  secretKey: string;
  mimeType: string;
  expiresIn: number; // seconds
}): Promise<string> {
  const { endpoint, bucket, key, accessKey, secretKey, mimeType, expiresIn } =
    opts;

  const now = new Date();

  // Format dates
  const dateStamp = now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, ""); // YYYYMMDD
  const amzDate =
    now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z")
      .slice(0, 15) + "Z"; // YYYYMMDDTHHmmssZ

  const region = "us-east-1"; // MinIO default
  const service = "s3";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKey}/${credentialScope}`;

  // Build the canonical URI — encode the key
  const encodedKey = key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const canonicalUri = `/${bucket}/${encodedKey}`;

  // Build query string (must be sorted)
  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "content-type;host",
  });
  // URLSearchParams sorts by insertion order — sort explicitly
  const sortedParams = new URLSearchParams(
    [...queryParams.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  const canonicalQueryString = sortedParams.toString();

  // Parse host from endpoint
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;

  const canonicalHeaders = `content-type:${mimeType}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  // Crypto helpers using Web Crypto API
  const encoder = new TextEncoder();

  const sha256Hash = async (data: string): Promise<string> => {
    const buf = await crypto.subtle.digest("SHA-256", encoder.encode(data));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const hmacSha256 = async (
    keyData: Uint8Array,
    message: string,
  ): Promise<Uint8Array> => {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(message),
    );
    return new Uint8Array(signature);
  };

  const hashedCanonical = await sha256Hash(canonicalRequest);

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashedCanonical,
  ].join("\n");

  // Derive signing key: HMAC(HMAC(HMAC(HMAC("AWS4" + secretKey, date), region), service), "aws4_request")
  const signingKey = await (async () => {
    const kDate = await hmacSha256(
      encoder.encode(`AWS4${secretKey}`),
      dateStamp,
    );
    const kRegion = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, service);
    return hmacSha256(kService, "aws4_request");
  })();

  const signatureBytes = await hmacSha256(signingKey, stringToSign);
  const signature = Array.from(signatureBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Assemble final URL
  const finalUrl = new URL(
    `${endpoint}/${bucket}/${encodedKey}`,
  );
  for (const [k, v] of sortedParams.entries()) {
    finalUrl.searchParams.set(k, v);
  }
  finalUrl.searchParams.set("X-Amz-Signature", signature);

  return finalUrl.toString();
}
