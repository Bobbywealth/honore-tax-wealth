"use client";
export default function GlobalError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
  return (
    <main style={{maxWidth:560,margin:"60px auto",textAlign:"center",background:"#fff",border:"1px solid #e8e2d5",borderRadius:16,padding:"48px 36px",boxShadow:"0 18px 45px #0b1a2a10",fontFamily:"Manrope,system-ui,-apple-system,sans-serif",color:"#0b1a2a"}}>
      <h1 style={{font:"500 36px/1.1 Georgia,serif",letterSpacing:"-0.03em",margin:"0 0 14px"}}>Something went wrong.</h1>
      <p style={{fontSize:16,lineHeight:1.55,color:"#53606d",margin:"0 0 24px"}}>An unexpected error occurred. Please try again, or head back to the home page.</p>
      {error.digest && <p style={{margin:"0 0 24px"}}><code style={{background:"#f1ead9",padding:"2px 6px",borderRadius:4,fontSize:13}}>Ref: {error.digest}</code></p>}
      <button onClick={()=>reset()} style={{display:"inline-block",padding:"14px 22px",borderRadius:8,background:"#0b1a2a",color:"#fff",font:"800 12px Manrope,sans-serif",letterSpacing:"0.1em",textDecoration:"none",border:0,cursor:"pointer"}}>TRY AGAIN</button>
    </main>
  );
}
