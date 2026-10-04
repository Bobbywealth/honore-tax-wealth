import Link from "next/link";
export const metadata = {title:"Thank you · Honoré Tax & Wealth",description:"We received your consultation request.",robots:{index:false}};
export default function ThankYou(){
  return (
    <html lang="en"><head><title>Thank you · Honoré Tax & Wealth</title>
    <meta name="description" content="We received your consultation request and will be in touch shortly."/>
    <meta name="robots" content="noindex"/>
    <link rel="icon" href="/favicon.svg"/>
    <style>body{margin:0;font-family:Manrope,system-ui,-apple-system,sans-serif;background:#f7f5ef;color:#0b1a2a;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:560px;text-align:center;background:#fff;border:1px solid #e8e2d5;border-radius:16px;padding:56px 40px;box-shadow:0 18px 45px #0b1a2a10}.check{width:64px;height:64px;border-radius:50%;background:#2f7a52;color:#fff;display:grid;place-items:center;margin:0 auto 22px;font:800 28px Manrope,sans-serif}.eyebrow{font:800 11px Manrope,sans-serif;letter-spacing:.2em;color:#c7a569;margin-bottom:12px}h1{font:500 40px/1.05 Georgia,serif;letter-spacing:-.03em;margin:0 0 14px}p{font-size:16px;line-height:1.55;color:#53606d;margin:0 0 28px}.row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}a.btn{display:inline-block;padding:14px 22px;border-radius:8px;font:800 12px Manrope,sans-serif;letter-spacing:.1em;text-decoration:none}a.primary{background:#0b1a2a;color:#fff}a.ghost{border:1px solid #d9c9a3;color:#0b1a2a}</style>
    </head><body><main class="card"><div class="check">✓</div><p class="eyebrow">REQUEST RECEIVED</p><h1>Thank you.</h1><p>We received your consultation request and will be in touch within one business day. If you need to reach us sooner, call or email and we'll respond the same day.</p><div class="row"><a class="btn primary" href="/">BACK TO HOME</a><a class="btn ghost" href="mailto:hello@honoretaxwealth.com">EMAIL US</a></div></main></body></html>
  );
}
