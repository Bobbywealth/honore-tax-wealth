import type { MetadataRoute } from "next";

/**
 * Public, indexable pages only.
 *
 * Private areas are deliberately absent: the client dashboard, admin area,
 * consultation intake, and account recovery routes. Those either require a
 * session or would otherwise invite indexing of pages that show nothing
 * useful to a crawler.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://ihonoretaxandwealth.com";
  const now = new Date();

  return [
    ...["personal-taxes","business-taxes","tax-planning","irs-notices"].map(slug=>({url:`${base}/services/${slug}`,lastModified:now,changeFrequency:"monthly" as const,priority:0.8})),
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];
}