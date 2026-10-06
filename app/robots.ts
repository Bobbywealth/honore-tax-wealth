import type { MetadataRoute } from "next";

/**
 * Private and sensitive routes are disallowed so they never enter an index.
 *
 * /inquiries and the account-recovery routes are included because they either
 * render nothing useful to a crawler or are one-shot token links; either way
 * there is nothing to gain from indexing them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/inquiries",
          "/reset-password",
          "/forgot-password",
          "/thank-you",
        ],
      },
    ],
    sitemap: "https://honore-tax-wealth.onrender.com/sitemap.xml",
  };
}