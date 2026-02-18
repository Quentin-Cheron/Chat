import type { UploadedFile } from "@/types/files";

const CONVEX_SITE_URL =
  ((import.meta as unknown as { env: Record<string, string> }).env
    .VITE_CONVEX_SITE_URL as string | undefined) ?? "http://localhost:3211";

export type { UploadedFile };

export async function uploadFile(file: File): Promise<UploadedFile> {
  // 1. Request a pre-signed PUT URL from the Convex HTTP action
  const presignRes = await fetch(`${CONVEX_SITE_URL}/api/files/presign`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });

  if (!presignRes.ok) {
    let errMsg = "Presign request failed";
    try {
      const err = (await presignRes.json()) as { error?: string };
      if (err.error) errMsg = err.error;
    } catch {
      // ignore JSON parse error
    }
    throw new Error(errMsg);
  }

  const { uploadUrl, storageKey, publicUrl } = (await presignRes.json()) as {
    uploadUrl: string;
    storageKey: string;
    publicUrl: string;
  };

  // 2. PUT the file directly to MinIO using the pre-signed URL
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed (HTTP ${uploadRes.status})`);
  }

  return {
    storageKey,
    url: publicUrl,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function isVideo(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ACCEPTED_FILE_TYPES =
  "image/*,video/*,audio/*,application/pdf,application/zip,application/x-zip-compressed,text/plain,text/csv";

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
