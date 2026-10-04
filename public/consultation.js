(()=>{const year=document.getElementById('year');if(year)year.textContent=new Date().getFullYear();const menu=document.getElementById('menu'),toggle=document.querySelector('.mobile-menu');if(menu&&toggle){toggle.addEventListener('click',()=>{const open=menu.classList.toggle('show');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close menu':'Open menu')});menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{menu.classList.remove('show');toggle.setAttribute('aria-expanded','false')}))}const dialog=document.getElementById('consultation-dialog');if(!dialog)return;document.querySelectorAll('[data-open-consultation]').forEach(button=>button.addEventListener('click',()=>(dialog.showModal(),dialog.querySelector('[name=service]').value=button.dataset.service||'')));document.querySelector('[data-close-consultation]').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});const form=document.getElementById('consultation-form'),feedback=document.getElementById('form-feedback');form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;feedback.textContent='Sending your request…';const data=Object.fromEntries(new FormData(form));try{const response=await fetch('/api/consultations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!response.ok)throw Error('Unable to send right now. Please try again.');form.reset();feedback.textContent='Thank you. Your request was received.';feedback.classList.add('success')}catch(error){feedback.textContent=error.message||'Unable to send right now. Please try again.'}finally{button.disabled=false}})})();
;(()=>{const slides=[...document.querySelectorAll('.hero-slide')],dots=[...document.querySelectorAll('[data-slide-to]')],pause=document.querySelector('.slide-pause'),hero=document.querySelector('.hero');if(!slides.length)return;let current=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,timer;function show(i){current=i;slides.forEach((s,n)=>{s.classList.toggle('active',n===i);s.setAttribute('aria-hidden',String(n!==i))});dots.forEach((d,n)=>{d.classList.toggle('active',n===i);d.setAttribute('aria-pressed',String(n===i))});const count=document.querySelector('.slide-count');if(count)count.textContent=String(i+1).padStart(2,'0')+' / 03'}function schedule(){clearInterval(timer);if(!paused)timer=setInterval(()=>{if(!document.hidden&&!hero.matches(':focus-within')&&!document.querySelector('dialog[open]'))show((current+1)%slides.length)},8000)}dots.forEach(d=>d.addEventListener('click',()=>{show(Number(d.dataset.slideTo));schedule()}));function updatePause(){pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-label',paused?'Play slideshow':'Pause slideshow')}pause.addEventListener('click',()=>{paused=!paused;updatePause();schedule()});show(0);updatePause();schedule()})();

(()=>{const hero=document.querySelector('.hero'),bar=document.querySelector('.mobile-action-bar');if(!hero||!bar)return;if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>bar.classList.toggle('is-visible',!entries[0].isIntersecting),{threshold:0});observer.observe(hero)}else{bar.classList.add('is-visible')}})();
/* nav scroll state */
addEventListener('scroll',()=>{document.body.classList.toggle('nav-scrolled',scrollY>10)},{passive:true});
/* Modernization JS: reveal, scroll-spy, hero auto-advance + swipe, lazy imgs */
(()=>{
  // Reveal-on-scroll
  const revealTargets=document.querySelectorAll('section.statement,section.experience,section.people,section.prepare,section.faq,section.final-cta,.hero-bottom-upgraded');
  revealTargets.forEach(el=>el.classList.add('reveal'));
  document.querySelectorAll('.tax-panels,.portrait-grid,.footer-grid,.prep-columns').forEach(el=>el.classList.add('reveal-stagger'));
  if('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    const io=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}})},{rootMargin:'0px 0px -10% 0px',threshold:.05});
    document.querySelectorAll('.reveal,.reveal-stagger').forEach(el=>io.observe(el));
  }else{
    document.querySelectorAll('.reveal,.reveal-stagger').forEach(el=>el.classList.add('visible'));
  }

  // Scroll-spy
  const navLinks=Array.from(document.querySelectorAll('.nav nav>a[href^="#"]'));
  const sections=navLinks.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if(sections.length && 'IntersectionObserver' in window){
    const spy=new IntersectionObserver((entries)=>{
      entries.forEach(e=>{const id='#'+e.target.id;const link=navLinks.find(a=>a.getAttribute('href')===id);if(link){if(e.isIntersecting){navLinks.forEach(a=>a.classList.remove('active'));link.classList.add('active')}}})
    },{rootMargin:'-40% 0px -55% 0px',threshold:0});
    sections.forEach(s=>spy.observe(s));
  }

  // Hero auto-advance + swipe
  const slides=document.querySelectorAll('.hero-slide');
  const dots=document.querySelectorAll('.slide-dot');
  const pauseBtn=document.querySelector('.slide-pause');
  if(slides.length>1 && dots.length===slides.length){
    let i=0, paused=false, timer=null;
    const go=(n)=>{i=(n+slides.length)%slides.length;slides.forEach((s,idx)=>s.classList.toggle('active',idx===i));dots.forEach((d,idx)=>{d.classList.toggle('active',idx===i);d.setAttribute('aria-pressed',String(idx===i))})};
    const start=()=>{stop();if(paused)return;timer=setInterval(()=>go(i+1),5500)};
    const stop=()=>{if(timer){clearInterval(timer);timer=null}};
    dots.forEach((d,idx)=>d.addEventListener('click',()=>{go(idx);start()}));
    if(pauseBtn){pauseBtn.addEventListener('click',()=>{paused=!paused;pauseBtn.setAttribute('aria-label',paused?'Resume slideshow':'Pause slideshow');pauseBtn.textContent=paused?'Resume':'Pause';if(paused)stop();else start()})}
    const hero=document.querySelector('.hero'); if(hero){hero.addEventListener('mouseenter',stop);hero.addEventListener('mouseleave',()=>!paused&&start())}
    // Swipe
    let tx=0;
    if(hero){hero.addEventListener('touchstart',e=>{tx=e.changedTouches[0].clientX;stop()},{passive:true});hero.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>50){go(i+(dx<0?1:-1))}start()},{passive:true})}
    start();
  }

  // Lazy images (except brand logo in header)
  document.querySelectorAll('img').forEach(img=>{if(!img.classList.contains('brand-logo') && !img.hasAttribute('loading')) img.setAttribute('loading','lazy')});
})();
