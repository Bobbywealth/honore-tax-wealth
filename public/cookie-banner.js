(()=>{
  if(typeof localStorage==="undefined") return;
  if(localStorage.getItem("htw-cookie-consent")) return;
  const bar=document.createElement("div");
  bar.setAttribute("role","region");
  bar.setAttribute("aria-label","Cookie notice");
  bar.style.cssText="position:fixed;left:16px;right:16px;bottom:16px;z-index:80;background:#0b1a2a;color:#e6eef3;border:1px solid #c7a56933;border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:space-between;font:14px Manrope,system-ui,sans-serif;box-shadow:0 18px 45px #0b1a2a55;max-width:680px;margin:0 auto;opacity:0;transform:translateY(20px);transition:opacity .35s ease,transform .35s ease";
  bar.innerHTML='<div style="flex:1 1 320px;min-width:0"><strong style="display:block;font-size:14px;margin-bottom:4px;color:#fff">We respect your privacy.</strong><span style="color:#9fb0ba">This site uses only essential cookies to keep the site working. No tracking or marketing cookies are set.</span></div><div style="display:flex;gap:8px;flex-shrink:0"><button data-cookie="accept" style="background:#d9b878;color:#0b1a2a;border:0;padding:10px 18px;border-radius:8px;font:800 12px Manrope,sans-serif;letter-spacing:.08em;cursor:pointer">GOT IT</button></div>';
  document.body.appendChild(bar);
  requestAnimationFrame(()=>{bar.style.opacity="1";bar.style.transform="none"});
  bar.querySelector('[data-cookie=accept]').addEventListener("click",()=>{localStorage.setItem("htw-cookie-consent","1");bar.style.opacity="0";bar.style.transform="translateY(20px)";setTimeout(()=>bar.remove(),400)});
})();
