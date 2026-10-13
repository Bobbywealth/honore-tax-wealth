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

  // Adaptive header: hidden only after deliberate downward scrolling.
  const header=document.querySelector('header.nav');
  if(header){
    let lastY=Math.max(0,window.scrollY), distance=0, scheduled=false;
    const show=()=>{header.classList.remove('nav-hidden');distance=0;};
    const update=()=>{
      scheduled=false;
      const y=Math.max(0,window.scrollY), delta=y-lastY;
      const locked=header.matches(':focus-within') || menu?.classList.contains('show') || document.querySelector('dialog[open]');
      if(y<100 || locked){show();}
      else if(Math.abs(delta)>2){
        distance=(distance*delta<0)?delta:distance+delta;
        if(distance>36){header.classList.add('nav-hidden');distance=0;}
        else if(distance< -10){show();}
      }
      lastY=y;
    };
    addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(update);}},{passive:true});
    header.addEventListener('focusin',show);
    toggle?.addEventListener('click',show);
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && menu?.classList.contains('show')){
        menu.classList.remove('show');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Open menu');toggle?.focus();show();
      }
    });
    document.addEventListener('click',e=>{
      if(menu?.classList.contains('show') && !header.contains(e.target)){
        menu.classList.remove('show');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Open menu');
      }
    });
    const desktop=matchMedia('(min-width:1025px)');
    desktop.addEventListener('change',()=>{menu?.classList.remove('show');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Open menu');show();});
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
    dialog.dispatchEvent(new Event('consultation-open'));
  }));
  const closeBtn=document.querySelector('[data-close-consultation]');
  if(closeBtn) closeBtn.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog) dialog.close()});

  // Form submit + multi-step
  const form=document.getElementById('consultation-form');
  const feedback=document.getElementById('form-feedback');
  const dialog2=document.getElementById('consultation-dialog');
  if(form && feedback){
    // Service-card selection syncs the hidden select + sets aria-checked
    const cards=form.querySelectorAll('.service-card');
    const serviceSelect=form.querySelector('select[name=service]');
    cards.forEach(card=>{
      card.addEventListener('click',()=>{
        cards.forEach(c=>c.setAttribute('aria-checked','false'));
        card.setAttribute('aria-checked','true');
        if(serviceSelect) serviceSelect.value=card.dataset.value;
      });
    });
    // Stepper — 5 individual steps: name, email, phone, service, notes
    const steps=dialog.querySelectorAll('.form-step');
    const panels=form.querySelectorAll('.form-panel');
    const goStep=(n)=>{
      steps.forEach(s=>{const stepNum=Number(s.dataset.step);const on=stepNum===n;const past=stepNum<n;s.classList.toggle('active',on);s.classList.toggle('done',past);s.setAttribute('aria-selected',String(on));});
      panels.forEach(p=>p.classList.toggle('hidden',Number(p.dataset.panel)!==n));
      const summary=document.getElementById('selected-service-summary');if(summary)summary.textContent='Selected service: '+(serviceSelect?.value||'Not selected');
      const active=form.querySelector('[data-panel="'+n+'"]');
      const field=active?.querySelector('input, select, textarea');
      if(field){field.focus({preventScroll:true});}
      dialog.scrollTop=0;
    };
    // Per-step validation: validate the single field in the current panel before advancing
    const validateCurrentStep=()=>{
      const active=form.querySelector('.form-panel:not(.hidden)');
      if(!active) return true;
      const field=active.querySelector('input, select, textarea');
      if(!field) return true;
      if(!field.checkValidity()){field.reportValidity();return false;}
      return true;
    };
    form.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',()=>{
      if(!validateCurrentStep()) return;
      // For step 4, the next target is step 5 (notes) regardless of button data-next
      const currentPanel=form.querySelector('.form-panel:not(.hidden)');
      const next=Number(b.dataset.next)||Number(currentPanel?.dataset.panel)+1;
      goStep(next);
    }));
    form.querySelectorAll('[data-prev]').forEach(b=>b.addEventListener('click',()=>{
      const currentPanel=form.querySelector('.form-panel:not(.hidden)');
      const prev=Number(b.dataset.prev)||Math.max(1,Number(currentPanel?.dataset.panel)-1);
      goStep(prev);
    }));
    // Enter key advances to the next step (if current field is valid)
    form.addEventListener('keydown',(e)=>{
      if(e.key!=='Enter') return;
      const tag=(e.target?.tagName||'').toLowerCase();
      if(tag==='textarea') return; // allow newlines in notes
      e.preventDefault();
      const active=form.querySelector('.form-panel:not(.hidden)');
      if(!active) return;
      const panelNum=Number(active.dataset.panel);
      if(panelNum<5){
        if(!validateCurrentStep()) return;
        goStep(panelNum+1);
      } else {
        // Step 5 (notes) — submit the form
        form.requestSubmit();
      }
    });
    // Click on a completed step jumps back to it
    steps.forEach(s=>s.addEventListener('click',()=>{
      const stepNum=Number(s.dataset.step);
      if(s.classList.contains('done') || s.classList.contains('active')) goStep(stepNum);
    }));
    dialog.addEventListener('consultation-open',()=>{goStep(1);feedback.textContent='';});
    // Floating-label sync (works for placeholder-based)
    form.querySelectorAll('.float-field input, .float-field select, .float-field textarea').forEach(el=>{
      const sync=()=>el.closest('.float-field')?.classList.toggle('has-value', !!el.value);
      sync(); el.addEventListener('input',sync); el.addEventListener('change',sync); el.addEventListener('blur',sync);
    });
    // Sync card to existing select (e.g. when opened from a data-open-consultation with data-service)
    const syncFromSelect=()=>{
      if(!serviceSelect) return;
      cards.forEach(c=>c.setAttribute('aria-checked', String(c.dataset.value===serviceSelect.value)));
    };
    if(serviceSelect){ syncFromSelect(); serviceSelect.addEventListener('change',syncFromSelect); }
    form.addEventListener('submit',async event=>{
      event.preventDefault(); event.stopPropagation();
      const honeypot=form.querySelector('[name=website]')?.value;
      if(honeypot){ feedback.textContent='Submission blocked.'; feedback.classList.remove('success'); return; }
      // Validate all fields
      const fields=form.querySelectorAll('input, select, textarea');
      let ok=true; fields.forEach(f=>{if(!f.checkValidity()){ok=false;}});
      if(!ok){ goStep(1); feedback.textContent='Please complete the required fields.'; feedback.classList.remove('success'); return; }
      // Service card sync
      const checked=form.querySelector('.service-card[aria-checked="true"]');
      if(checked && serviceSelect) serviceSelect.value=checked.dataset.value;
      const button=form.querySelector('[type=submit]');
      button.disabled=true;
      feedback.textContent='Sending your request…'; feedback.classList.remove('success');
      const data=Object.fromEntries(new FormData(form));
      try{
        const response=await fetch('/api/consultations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
        if(!response.ok){ const err=await response.json().catch(()=>({})); throw new Error(err.error || `Server returned ${response.status}. Please try again.`); }
        form.reset();
        feedback.textContent='Thank you. Redirecting…'; feedback.classList.add('success');
        setTimeout(()=>{location.href="/thank-you"},800);
      }catch(error){
        feedback.textContent=error.message || 'Unable to send right now. Please try again shortly.';
        feedback.classList.remove('success');
      }finally{ button.disabled=false; }
    });
  }

  const requestedService=new URLSearchParams(location.search).get('service');
  if(location.hash==='#consultation'||requestedService){
    const select=dialog.querySelector('[name=service]');
    if(select && Array.from(select.options).some(o=>o.value===requestedService)) select.value=requestedService;
    dialog.showModal();dialog.dispatchEvent(new Event('consultation-open'));
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

  // Past-hero state: the floating consultation pill (mobile) only appears
  // once the hero is scrolled out of view, so it never covers hero content.
  if(hero && 'IntersectionObserver' in window){
    const heroObserver=new IntersectionObserver(entries=>{
      document.body.classList.toggle('htw-past-hero', !entries[0].isIntersecting);
    },{threshold:0, rootMargin:'-80px 0px 0px 0px'});
    heroObserver.observe(hero);
  } else {
    document.body.classList.add('htw-past-hero');
  }

  // Floating consultation pill — tuck it above the footer tagline once the
  // footer enters the viewport so the 'PLAN. PREPARE. MOVE FORWARD.' line
  // isn't ever clipped by the pill.
  const pill=document.querySelector('.honore-floating-cta');
  const footer=document.querySelector('.honore-footer');
  if(pill && footer && 'IntersectionObserver' in window){
    const footerObserver=new IntersectionObserver(entries=>{
      pill.classList.toggle('is-above-footer', entries[0].isIntersecting && entries[0].intersectionRatio > 0.05);
    },{threshold:[0,0.05,0.2]});
    footerObserver.observe(footer);
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

  // Mark dialog as touched on first interaction
  if(dialog2){
    dialog2.addEventListener('input',()=>dialog2.setAttribute('data-touched','1'),{once:true});
    dialog2.addEventListener('change',()=>dialog2.setAttribute('data-touched','1'),{once:true});
  }

})();
