export const metadata = {title:"Thank you · Honoré Tax & Wealth",description:"We received your consultation request.",robots:{index:false}};
export default function ThankYou(){
  return (
    <main style={{maxWidth:560,margin:"60px auto",textAlign:"center",background:"#fff",border:"1px solid #e8e2d5",borderRadius:16,padding:"56px 40px",boxShadow:"0 18px 45px #0b1a2a10",fontFamily:"Manrope,system-ui,-apple-system,sans-serif",color:"#0b1a2a"}}>
      <div style={{width:64,height:64,borderRadius:"50%",background:"#2f7a52",color:"#fff",display:"grid",placeItems:"center",margin:"0 auto 22px",font:"800 28px Manrope,sans-serif"}}>✓</div>
      <p style={{font:"800 11px Manrope,sans-serif",letterSpacing:"0.2em",color:"#c7a569",marginBottom:12,margin:0}}>REQUEST RECEIVED</p>
      <h1 style={{font:"500 40px/1.05 Georgia,serif",letterSpacing:"-0.03em",margin:"0 0 14px"}}>Thank you.</h1>
      <p style={{fontSize:16,lineHeight:1.55,color:"#53606d",margin:"0 0 28px"}}>We received your consultation request. This is not a confirmed appointment. The team will follow up to discuss availability, scope, and any fees before work begins.</p>
      <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
        <a href="/" style={{display:"inline-block",padding:"14px 22px",borderRadius:8,font:"800 12px Manrope,sans-serif",letterSpacing:"0.1em",textDecoration:"none",background:"#0b1a2a",color:"#fff"}}>BACK TO HOME</a>
      </div>
    </main>
  );
}
