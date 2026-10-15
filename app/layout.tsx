import type { Metadata, Viewport } from "next";
import "./globals.css";
import ConsultationDialog from "./_components/ConsultationDialog";
export const viewport:Viewport={
  width:"device-width",
  initialScale:1,
  themeColor:"#0b1a2a",
  colorScheme:"light",
};
export const metadata:Metadata={
  metadataBase: new URL("https://ihonoretaxandwealth.com"),
  title:{default:"iHonore Tax & Wealth",template:"%s · iHonore Tax & Wealth"},
  description:"Tax preparation, filing, and planning with a bigger picture in focus.",
  applicationName:"iHonore Tax & Wealth",
  keywords:["tax preparation","tax filing","tax planning","IRS notices","small business tax","Bloomfield NJ tax","NJ tax accountant"],
  authors:[{name:"iHonore Tax & Wealth"}],
  creator:"iHonore Tax & Wealth",
  publisher:"iHonore Tax & Wealth",
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
  openGraph:{title:"iHonore Tax & Wealth",description:"Tax preparation, filing, and planning with a bigger picture in focus.",type:"website",siteName:"iHonore Tax & Wealth",images:[{url:"/assets/og/og.jpg",width:1200,height:630,alt:"iHonore Tax & Wealth"}]},
  twitter:{card:"summary_large_image",title:"iHonore Tax & Wealth",description:"Tax preparation, filing, and planning with a bigger picture in focus.",images:["/assets/og/og.jpg"]},
};
const jsonLd = {
  "@context":"https://schema.org",
  "@type":"ProfessionalService",
  "name":"iHonore Tax & Wealth",
  "description":"Tax preparation, filing, and planning for individuals, families, and business owners.",
  "url":"https://ihonoretaxandwealth.com/",
  "image":"https://ihonoretaxandwealth.com/assets/og/og.jpg",
  "logo":"https://ihonoretaxandwealth.com/assets/honore-logo-cropped-sm.png",
  // No `telephone` property. This previously advertised "+1-555-000-0000",
  // a reserved fictional number, in structured data on every page. Google
  // treats fabricated contact details in JSON-LD as a spam signal and it
  // violates the project's own rule against placeholder contact information.
  // Restore the field once the practice supplies a verified number.
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
            cascade: style.css then cleanup.css. dashboard.css is loaded only
            by app/dashboard/layout.tsx so marketing pages skip it. */}
        <link rel="stylesheet" href="/style.css"/>
        <link rel="stylesheet" href="/cleanup.css"/>
        <script dangerouslySetInnerHTML={{__html:`(function(){if('scrollRestoration' in history){history.scrollRestoration='manual'}function top(){try{window.scrollTo(0,0)}catch(e){}}top();window.addEventListener('pageshow',function(e){if(e.persisted){top()}});})();`}}/>
      </head>
      <body>
        <link rel="preload" as="image" href="/assets/hero-couple-1600.webp" fetchPriority="high"/>
        <link rel="preload" as="image" href="/assets/hero-consultation-approved-1600.webp" fetchPriority="low"/>
        <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd)}}/>
        {children}
        <ConsultationDialog />
        <link rel="stylesheet" href="/visual-upgrades.css" />
        <script src="/consultation.js" defer />
        <script src="/cookie-banner.js" defer />
      </body>
    </html>
  );
}
