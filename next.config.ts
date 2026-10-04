import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Security headers applied to every response. Tighten CSP allowlists per
// route once the secure client portal and document viewer are in place.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    // Inline styles + scripts allowed because Next.js hydration injects them.
    // Google Fonts CSS is loaded from fonts.googleapis.com.  No iframes,
    // no remote scripts.  Tighten when document uploads / portal launch.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-src 'self'",
    ].join("; "),
  },
];

if (isProd) {
  // Render fronts this with HTTPS already; HSTS tells browsers to refuse HTTP.
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
