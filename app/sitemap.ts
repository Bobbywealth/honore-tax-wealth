import type {MetadataRoute} from "next";
export default function sitemap():MetadataRoute.Sitemap{
  const base = "https://honore-tax-wealth.onrender.com";
  return [
    {url:`${base}/`, lastModified:new Date(), changeFrequency:"weekly", priority:1},
    {url:`${base}/login/`, lastModified:new Date(), changeFrequency:"monthly", priority:0.4},
    {url:`${base}/dashboard/admin?preview=1`, lastModified:new Date(), changeFrequency:"monthly", priority:0.2},
  ];
}
