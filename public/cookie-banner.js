/* eslint-disable */
(() => {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem("htw-cookie-consent")) return;

  // Slim bottom-bar cookie notice. Designed so it never covers hero content
  // or sticky CTAs on a long page; stays a single horizontal row that the
  // user dismisses with one tap.
  const bar = document.createElement("div");
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Cookie notice");
  bar.style.cssText = [
    "position:fixed",
    "left:0",
    "right:0",
    "bottom:0",
    "z-index:80",
    "background:rgba(11,26,42,.96)",
    "color:#e6eef3",
    "border-top:1px solid rgba(199,165,105,.35)",
    "padding:10px 20px max(10px, env(safe-area-inset-bottom))",
    "display:flex",
    "align-items:center",
    "gap:14px",
    "font:13px/1.5 Manrope,system-ui,sans-serif",
    "box-shadow:0 -6px 24px rgba(8,18,30,.45)",
    "opacity:0",
    "transform:translateY(100%)",
    "transition:opacity .25s ease,transform .25s ease",
  ].join(";");
  bar.innerHTML =
    '<span style="flex:1;min-width:0">' +
      '<strong style="display:inline;font:800 12px Manrope,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;margin-right:10px">Cookies</strong>' +
      '<span style="color:#a8b6c2">Essential only. No tracking or marketing cookies.</span>' +
    "</span>" +
    '<button data-cookie="accept" type="button" style="background:#d9b878;color:#0b1a2a;border:0;padding:8px 14px;border-radius:6px;font:800 11px Manrope,sans-serif;letter-spacing:.08em;cursor:pointer;white-space:nowrap">GOT IT</button>';
  document.body.appendChild(bar);
  // Lets CSS hide the floating consultation pill while this bar is open.
  document.body.classList.add("htw-cookie-open");
  requestAnimationFrame(() => {
    bar.style.opacity = "1";
    bar.style.transform = "none";
  });
  bar.querySelector("[data-cookie=accept]").addEventListener("click", () => {
    localStorage.setItem("htw-cookie-consent", "1");
    document.body.classList.remove("htw-cookie-open");
    bar.style.opacity = "0";
    bar.style.transform = "translateY(100%)";
    setTimeout(() => bar.remove(), 320);
  });
})();
