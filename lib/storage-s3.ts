import { createHash, createHmac, randomBytes } from "crypto";
import type { PutResult, StorageDriver } from "./storage";

/**
 * S3-compatible object storage (Cloudflare R2, AWS S3, MinIO).
 *
 * Hand-rolled AWS Signature V4 on purpose: this project needs exactly three
 * object verbs (PUT, GET, DELETE) against one bucket, and pulling in
 * `@aws-sdk/client-s3` would add a large dependency tree to a repo that is
 * otherwise lean. The signing is the same algorithm the SDK uses.
 *
 * Path-style addressing (`https://<endpoint>/<bucket>/<key>`) is used because
 * R2 and MinIO both support it and it avoids a DNS lookup per bucket.
 *
 * Required env:
 *   S3_BUCKET
 *   S3_REGION            (use "auto" for R2)
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 * Optional env:
 *   S3_ENDPOINT          (R2/MinIO). Omit for AWS S3, where the regional
 *                        endpoint is derived from S3_REGION.
 *   S3_FORCE_PATH_STYLE  ("0" to switch to virtual-host addressing on AWS)
 *
 * SECURITY NOTES (carried from lib/storage.ts):
 * - Objects are written private. All reads must go through the authenticated
 *   API route; never hand out a public bucket URL.
 * - `scanStatus` on the documents row should stay "pending" until a scan
 *   passes. This driver deliberately does not mark anything available.
 * - Consider SSE on the bucket (R2 default is encrypted at rest; for AWS use
 *   SSE-S3 or SSE-KMS).
 */

type Cfg = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string | null;
  forcePathStyle: boolean;
};

function configFromEnv(): Cfg | null {
  const bucket = process.env.S3_BUCKET ?? "";
  const region = process.env.S3_REGION ?? "";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? "";
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;

  const endpointRaw = process.env.S3_ENDPOINT ?? "";
  const endpoint = endpointRaw ? endpointRaw.replace(/\/+$/, "") : null;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== "0";
  return { bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle };
}

export function s3Configured(): boolean {
  return configFromEnv() !== null;
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/^\.+/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
  return cleaned || "file";
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function amzDate(): { amz: string; dateStamp: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const amz =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  return { amz, dateStamp: amz.slice(0, 8) };
}

/**
 * RFC 3986 encode, matching AWS's canonical-URI rules. `encodeURIComponent`
 * is close but leaves `!'()*` unescaped, which SigV4 requires escaped.
 */
function uriEncode(value: string, encodeSlash: boolean): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else if (ch === "/" && !encodeSlash) {
      out += ch;
    } else {
      const bytes = Buffer.from(ch, "utf8");
      for (const b of bytes) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

type SignedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Buffer | null;
};

function sign(
  cfg: Cfg,
  method: string,
  key: string,
  body: Buffer | null,
  extraHeaders: Record<string, string> = {},
): SignedRequest {
  const { amz, dateStamp } = amzDate();
  const payloadHash = sha256Hex(body ?? Buffer.alloc(0));

  const host = cfg.endpoint
    ? new URL(cfg.endpoint).host
    : `s3.${cfg.region}.amazonaws.com`;
  const canonicalUri = cfg.forcePathStyle
    ? `/${cfg.bucket}/${uriEncode(key, false)}`
    : `/${uriEncode(key, false)}`;

  const url = cfg.endpoint
    ? cfg.forcePathStyle
      ? `${cfg.endpoint}/${cfg.bucket}/${uriEncode(key, false)}`
      : `https://${cfg.bucket}.${host}/${uriEncode(key, false)}`
    : `https://${host}/${cfg.bucket}/${uriEncode(key, false)}`;

  // Only headers we sign. Content-Type is included when the caller supplies
  // it so the stored object keeps its declared type.
  const headerMap: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
    ...extraHeaders,
  };

  const signedHeaderNames = Object.keys(headerMap)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames
    .map((h) => `${h}:${String(headerMap[h] ?? headerMap[h.toLowerCase()]).trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    "", // no query string for these verbs
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url,
    method,
    headers: { ...headerMap, Authorization: authorization },
    body,
  };
}

async function send(req: SignedRequest): Promise<Response> {
  return fetch(req.url, {
    method: req.method,
    headers: req.headers,
    // Uint8Array rather than Buffer: the fetch type signature accepts a typed
    // array but not Node's Buffer under this lib configuration.
    body: req.body ? new Uint8Array(req.body) : undefined,
  });
}

export class S3Storage implements StorageDriver {
  private cfg: Cfg;

  constructor(cfg: Cfg) {
    this.cfg = cfg;
  }

  async put(prefix: string, filename: string, data: Buffer, contentType: string): Promise<PutResult> {
    const safeName = sanitizeFilename(filename);
    const rand = randomBytes(16).toString("hex");
    const d = new Date();
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    // Same key layout as LocalDiskStorage so a later migration between drivers
    // is a copy, not a re-key.
    const key = `${prefix}/${ym}/${rand}-${safeName}`;

    const req = sign(this.cfg, "PUT", key, data, {
      "content-type": contentType || "application/octet-stream",
      "content-length": String(data.length),
    });
    const res = await send(req);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`storage: PUT failed (${res.status}) ${text.slice(0, 200)}`);
    }

    return {
      key,
      checksum: sha256Hex(data),
      sizeBytes: data.length,
    };
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string }> {
    const req = sign(this.cfg, "GET", key, null);
    const res = await send(req);
    if (!res.ok) {
      throw new Error(`storage: GET failed (${res.status})`);
    }
    const data = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    return { data, contentType };
  }

  async delete(key: string): Promise<void> {
    const req = sign(this.cfg, "DELETE", key, null);
    const res = await send(req);
    // Idempotent: deleting a missing object returns 404 and that is fine.
    if (!res.ok && res.status !== 404) {
      throw new Error(`storage: DELETE failed (${res.status})`);
    }
  }
}

/** Build a driver from env, or null when the S3 block is not configured. */
export function s3StorageFromEnv(): S3Storage | null {
  const cfg = configFromEnv();
  return cfg ? new S3Storage(cfg) : null;
}
