"use client";
export default function GlobalError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
  return (
    <html lang="en"><head><title>Something went wrong · Honoré Tax & Wealth</title>
    <meta name="robots" content="noindex"/>
    <link rel="icon" href="/favicon.svg"/>
    <style>body{margin:0;font-family:Manrope,system-ui,-apple-system,sans-serif;background:#f7f5ef;color:#0b1a2a;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:560px;text-align:center;background:#fff;border:1px solid #e8e2d5;border-radius:16px;padding:48px 36px;box-shadow:0 18px 45px #0b1a2a10}h1{font:500 36px/1.1 Georgia,serif;letter-spacing:-.03em;margin:0 0 14px}p{font-size:16px;line-height:1.55;color:#53606d;margin:0 0 24px}code{background:#f1ead9;padding:2px 6px;border-radius:4px;font-size:13px}.btn{display:inline-block;padding:14px 22px;border-radius:8px;background:#0b1a2a;color:#fff;font:800 12px Manrope,sans-serif;letter-spacing:.1em;text-decoration:none;border:0;cursor:pointer}</style>
    </head><body><main class="card"><h1>Something went wrong.</h1><p>An unexpected error occurred. Please try again, or head back to the home page.</p>{error.digest && <p><code>Ref: {error.digest}</code></p>}<button class="btn" onClick={()=>reset()}>TRY AGAIN</button></main></body></html>
  );
}
