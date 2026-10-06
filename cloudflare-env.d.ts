declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    LOG_SALT?: string;
    BUCKET?: R2Bucket;
  }
}
