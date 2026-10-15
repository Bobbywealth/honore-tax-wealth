/**
 * Document storage abstraction.
 *
 * Files are NEVER web-accessible directly. All reads go through an
 * authenticated API route that streams from this layer.
 *
 * Current implementation: local disk under UPLOAD_DIR. This is suitable for
 * single-instance deploys but will NOT survive a Render free-instance
 * restart (no persistent disk) and does not replicate across instances.
 *
 * TODO (production): replace LocalDiskStorage with an S3-compatible
 * implementation. Required env vars (see .env.example):
 *   S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 * Optionally S3_ENDPOINT for R2/MinIO-compatible providers.
 *
 * SECURITY NOTES (pre-production checklist):
 * - Uploads should be virus-scanned before being marked available.
 *   Options: ClamAV sidecar (clamdscan on write), or provider-side scanning
 *   (e.g. S3 Object Lambda / R2 + external scanner). The `scanStatus` column
 *   on `documents` exists for this: keep it "pending" until a scan passes.
 * - Consider encrypting at rest (S3 SSE-S3/SSE-KMS, or age/gpg for disk).
 * - The upload API validates content-type and size; the storage layer
 *   additionally refuses path traversal in keys.
 */

import { createHash, randomBytes } from "crypto";
import { mkdir, writeFile, readFile, unlink, stat } from "fs/promises";
import { join, resolve, sep } from "path";

export type PutResult = {
  /** Opaque storage key, safe to persist in `documents.storage_key`. */
  key: string;
  /** SHA-256 hex of the stored bytes. */
  checksum: string;
  sizeBytes: number;
};

export interface StorageDriver {
  put(prefix: string, filename: string, data: Buffer, contentType: string): Promise<PutResult>;
  get(key: string): Promise<{ data: Buffer; contentType: string }>;
  delete(key: string): Promise<void>;
}

function uploadRoot(): string {
  const dir = process.env.UPLOAD_DIR ?? "./uploads";
  // Resolve once so every later join stays inside the root.
  return resolve(dir);
}

async function ensureRoot(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
}

/** Refuse keys that would escape the upload root. */
function safeJoin(root: string, key: string): string {
  const full = resolve(join(root, key));
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error("storage: path traversal refused");
  }
  return full;
}

function sanitizeFilename(name: string): string {
  // Strip directories, control chars, and leading dots. Keep it readable.
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/^\.+/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
  return cleaned || "file";
}

class LocalDiskStorage implements StorageDriver {
  async put(prefix: string, filename: string, data: Buffer): Promise<PutResult> {
    const root = uploadRoot();
    await ensureRoot(root);
    const safeName = sanitizeFilename(filename);
    const rand = randomBytes(16).toString("hex");
    // Key layout: <prefix>/<yyyy-mm>/<rand>-<sanitized>. No user input in
    // directory segments beyond the sanitized filename.
    const d = new Date();
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const key = `${prefix}/${ym}/${rand}-${safeName}`;
    const full = safeJoin(root, key);
    await mkdir(join(root, prefix, ym), { recursive: true });
    await writeFile(full, data);
    const checksum = createHash("sha256").update(data).digest("hex");
    return { key, checksum, sizeBytes: data.length };
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string }> {
    const root = uploadRoot();
    const full = safeJoin(root, key);
    const data = await readFile(full);
    // Content type is stored in the DB row, not on disk; callers pass it.
    return { data, contentType: "application/octet-stream" };
  }

  async delete(key: string): Promise<void> {
    const root = uploadRoot();
    const full = safeJoin(root, key);
    try {
      await unlink(full);
    } catch (err) {
      // Idempotent: deleting a missing file is not an error.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}

// Singleton driver. Swap the constructor here (or via STORAGE_DRIVER env)
// when the S3 implementation lands.
let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!driver) driver = new LocalDiskStorage();
  return driver;
}

/** Re-exported so API routes share one sanitizer. */
export { sanitizeFilename };

/** Disk usage under the upload root, for the admin dashboard. Best-effort. */
export async function diskUsageBytes(): Promise<number | null> {
  try {
    const root = uploadRoot();
    const s = await stat(root);
    if (!s.isDirectory()) return null;
    // Cheap approximation: walk one level. Deep walks are O(n) on every
    // dashboard load; the client page already sums DB sizes instead.
    return null;
  } catch {
    return null;
  }
}
