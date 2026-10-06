import type { Metadata, Viewport } from "next";import "./globals.css";
export const viewport:Viewport={
  width:"device-width",
  initialScale:1,
  themeColor:"#0b1a2a",
  colorScheme:"light",
};
export const metadata:Metadata={
  metadataBase: new URL("https://honore-tax-wealth.onrender.com"),
  title:{default:"Honoré Tax & Wealth",template:"%s · Honoré Tax & Wealth"},
  description:"Tax preparation, filing, and planning with a bigger picture in focus.",
  applicationName:"Honoré Tax & Wealth",
  keywords:["tax preparation","tax filing","tax planning","IRS notices","small business tax","Bloomfield NJ tax","NJ tax accountant"],
  authors:[{name:"Honoré Tax & Wealth"}],
  creator:"Honoré Tax & Wealth",
  publisher:"Honoré Tax & Wealth",
  alternates:{canonical:"/"},
  robots:{index:true, follow:true, googleBot:{index:true, follow:true, "max-image-preview":"large", "max-snippet":-1}},
  formatDetection:{telephone:false,address:false,email:false},
  icons:{icon:[
    {url:"/favicon.svg", type:"image/svg+xml"},
    {url:"/favicon-32.png", type:"image/png", sizes:"32x32"},
    {url:"/favicon.ico", sizes:"any"},
  ], apple:[
    {url:"/apple-touch-icon.png", sizes:"180x180", type:"image/png"},
  ]},
  openGraph:{title:"Honoré Tax & Wealth",description:"Tax preparation, filing, and planning with a bigger picture in focus.",type:"website",siteName:"Honoré Tax & Wealth",images:[{url:"/assets/og/og.jpg",width:1200,height:630,alt:"Honoré Tax & Wealth"}]},
  twitter:{card:"summary_large_image",title:"Honoré Tax & Wealth",description:"Tax preparation, filing, and planning with a bigger picture in focus.",images:["/assets/og/og.jpg"]},
};
const jsonLd = {
  "@context":"https://schema.org",
  "@type":"ProfessionalService",
  "name":"Honoré Tax & Wealth",
  "description":"Tax preparation, filing, and planning for individuals, families, and business owners.",
  "url":"https://honore-tax-wealth.onrender.com/",
  "image":"https://honore-tax-wealth.onrender.com/assets/og/og.jpg",
  "logo":"https://honore-tax-wealth.onrender.com/assets/honore-logo-cropped-sm.png",
  "telephone":"+1-555-000-0000",
  "priceRange":"$$",
  "areaServed":{"@type":"AdministrativeArea","name":"New Jersey"},
  "serviceType":["Tax preparation","Tax filing","Tax planning","IRS notice help","Small business tax"],
  "knowsAbout":["Individual taxation","Business taxation","IRS procedures","Tax planning"],
};
export default function RootLayout({children}:{children:React.ReactNode}){
  return (
    <html lang="en">
      <head>
        {/* Loaded here rather than via @import in globals.css: the plain
            Next.js build resolves CSS imports at build time and cannot
            resolve absolute /public paths. Order preserves the original
            cascade: style.css then cleanup.css. */}
        <link rel="stylesheet" href="/style.css"/>
        <link rel="stylesheet" href="/cleanup.css"/>
      </head>
      <body>
        <link rel="preload" as="image" href="/assets/hero-couple.webp" fetchPriority="high"/>
        <link rel="preload" as="image" href="/assets/hero-consultation-approved.webp" fetchPriority="low"/>
        <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd)}}/>
        {children}
        <link rel="stylesheet" href="/visual-upgrades.css" />
        <script src="/consultation.js" defer />
        <script src="/cookie-banner.js" defer />
      </body>
    </html>
  );
}
