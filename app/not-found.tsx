import Link from "next/link";
export const metadata = {title:"Page not found · Honoré Tax & Wealth",robots:{index:false}};
export default function NotFound(){
  return (
    <main style={{maxWidth:520,margin:"60px auto",textAlign:"center",background:"#fff",border:"1px solid #e8e2d5",borderRadius:16,padding:"48px 36px",boxShadow:"0 18px 45px #0b1a2a10",fontFamily:"Manrope,system-ui,-apple-system,sans-serif",color:"#0b1a2a"}}>
      <p style={{font:"800 11px Manrope,sans-serif",letterSpacing:"0.2em",color:"#c7a569",marginBottom:14,margin:0}}>404 / PAGE NOT FOUND</p>
      <h1 style={{font:"500 42px/1.05 Georgia,serif",letterSpacing:"-0.03em",margin:"0 0 14px"}}>This page slipped through.</h1>
      <p style={{fontSize:16,lineHeight:1.55,color:"#53606d",margin:"0 0 28px"}}>The link you followed may be broken, or the page may have moved. Let&apos;s get you back to something useful.</p>
      <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
        <Link href="/" style={{display:"inline-block",padding:"14px 22px",borderRadius:8,font:"800 12px Manrope,sans-serif",letterSpacing:"0.1em",textDecoration:"none",background:"#0b1a2a",color:"#fff"}}>BACK TO HOME</Link>
        <a href="mailto:hello@honoretaxwealth.com" style={{display:"inline-block",padding:"14px 22px",borderRadius:8,font:"800 12px Manrope,sans-serif",letterSpacing:"0.1em",textDecoration:"none",border:"1px solid #d9c9a3",color:"#0b1a2a"}}>EMAIL US</a>
      </div>
    </main>
  );
}
