(()=>{
  const year=document.getElementById('year');
  if(year) year.textContent=new Date().getFullYear();

  // Mobile menu toggle
  const menu=document.getElementById('menu');
  const toggle=document.querySelector('.mobile-menu');
  if(menu && toggle){
    const closeMenu=()=>{menu.classList.remove('show');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open menu')};
    toggle.addEventListener('click',()=>{const open=menu.classList.toggle('show');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close menu':'Open menu')});
    // Close menu when any link, book button, login, or admin link is tapped
    menu.querySelectorAll('a, .nav-book').forEach(link=>link.addEventListener('click',()=>closeMenu()));
  }

  // Consultation dialog
  const dialog=document.getElementById('consultation-dialog');
  if(!dialog) return;
  document.querySelectorAll('[data-open-consultation]').forEach(button=>button.addEventListener('click',(e)=>{
    if(dialog.open) return; // already open
    e.preventDefault();
    try { dialog.showModal(); } catch(_){}
    const sel=dialog.querySelector('[name=service]');
    if(sel) sel.value=button.dataset.service||'';
  }));
  const closeBtn=document.querySelector('[data-close-consultation]');
  if(closeBtn) closeBtn.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog) dialog.close()});

  // Form submit
  const form=document.getElementById('consultation-form');
  const feedback=document.getElementById('form-feedback');
  if(form && feedback){
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      event.stopPropagation();
      const button=form.querySelector('[type=submit]');
      const honeypot=form.querySelector('[name=website]')?.value;
      if(honeypot){ feedback.textContent='Submission blocked.'; feedback.classList.remove('success'); return; }
      button.disabled=true;
      feedback.textContent='Sending your request…';
      feedback.classList.remove('success');
      const data=Object.fromEntries(new FormData(form));
      try{
        const response=await fetch('/api/consultations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
        if(!response.ok){
          const err=await response.json().catch(()=>({}));
          throw new Error(err.error || `Server returned ${response.status}. Please try again.`);
        }
        form.reset();
        feedback.textContent='Thank you. Redirecting…';
        feedback.classList.add('success');
        setTimeout(()=>{location.href="/thank-you"},800);
      }catch(error){
        feedback.textContent=error.message || 'Unable to send right now. Please try again, or call us directly.';
        feedback.classList.remove('success');
        // Keep dialog open so user can retry
      }finally{
        button.disabled=false;
      }
    });
  }

  // Hero slideshow — single source of truth
  const slides=document.querySelectorAll('.hero-slide');
  const dots=document.querySelectorAll('[data-slide-to]');
  const pauseBtn=document.querySelector('.slide-pause');
  const hero=document.querySelector('.hero');
  const countEl=document.querySelector('.slide-count');
  if(slides.length>1 && dots.length===slides.length){
    let i=0, paused=matchMedia('(prefers-reduced-motion: reduce)').matches, timer=null;
    const total=slides.length;
    const go=(n)=>{
      i=(n+total)%total;
      slides.forEach((s,idx)=>{s.classList.toggle('active',idx===i);s.setAttribute('aria-hidden',String(idx!==i))});
      dots.forEach((d,idx)=>{d.classList.toggle('active',idx===i);d.setAttribute('aria-pressed',String(idx===i))});
      if(countEl) countEl.textContent=String(i+1).padStart(2,'0')+' / '+String(total).padStart(2,'0');
    };
    const start=()=>{stop();if(paused||document.hidden)return;timer=setInterval(()=>{if(!hero.matches(':focus-within')&&!dialog.open) go(i+1)},5500)};
    const stop=()=>{if(timer){clearInterval(timer);timer=null}};
    dots.forEach((d,idx)=>d.addEventListener('click',()=>{go(idx);start()}));
    if(pauseBtn){pauseBtn.addEventListener('click',()=>{paused=!paused;pauseBtn.setAttribute('aria-label',paused?'Resume slideshow':'Pause slideshow');pauseBtn.textContent=paused?'Play':'Pause';if(paused)stop();else start()})}
    if(hero){
      hero.addEventListener('mouseenter',stop);
      hero.addEventListener('mouseleave',()=>{if(!paused) start()});
      let tx=0;
      hero.addEventListener('touchstart',e=>{tx=e.changedTouches[0].clientX;stop()},{passive:true});
      hero.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>50) go(i+(dx<0?1:-1));start()},{passive:true});
    }
    go(0);start();
  }

  // Mobile action bar visibility — only show after scrolling past hero
  const bar=document.querySelector('.mobile-action-bar');
  if(bar && hero && 'IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      bar.classList.toggle('is-visible',!entries[0].isIntersecting);
    },{threshold:0, rootMargin:'-80px 0px 0px 0px'});
    observer.observe(hero);
  }

  // Nav scroll state
  addEventListener('scroll',()=>{document.body.classList.toggle('nav-scrolled',scrollY>10)},{passive:true});

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
      entries.forEach(e=>{
        const id='#'+e.target.id;
        const link=navLinks.find(a=>a.getAttribute('href')===id);
        if(link && e.isIntersecting){navLinks.forEach(a=>a.classList.remove('active'));link.classList.add('active')}
      });
    },{rootMargin:'-40% 0px -55% 0px',threshold:0});
    sections.forEach(s=>spy.observe(s));
  }

  // Lazy images
  document.querySelectorAll('img').forEach(img=>{if(!img.classList.contains('brand-logo') && !img.hasAttribute('loading')) img.setAttribute('loading','lazy')});
})();
