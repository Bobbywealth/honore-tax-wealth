import type { Metadata } from "next";import "./globals.css";
export const metadata:Metadata={
  metadataBase: new URL("https://honore-tax-wealth.onrender.com"),
  title:"Honoré Tax & Wealth",
  description:"Tax preparation, filing, and planning with a bigger picture in focus.",
  icons:{icon:"/favicon.svg",apple:"/favicon.svg"},
  openGraph:{title:"Honoré Tax & Wealth",description:"Tax preparation, filing, and planning with a bigger picture in focus.",type:"website",siteName:"Honoré Tax & Wealth",images:[{url:"/assets/og/og.jpg",width:1200,height:630,alt:"Honoré Tax & Wealth"}]},
  twitter:{card:"summary_large_image",title:"Honoré Tax & Wealth",description:"Tax preparation, filing, and planning with a bigger picture in focus.",images:["/assets/og/og.jpg"]}
};
export default function RootLayout({children}:{children:React.ReactNode}){
  return (
    <html lang="en">
      <body>
        <link rel="preload" as="image" href="/assets/hero-couple.webp" fetchpriority="high"/>
        {children}
        <script src="/consultation.js" defer />
      </body>
    </html>
  );
}
