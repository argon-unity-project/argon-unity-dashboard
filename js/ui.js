// ============================================================
// ARGON DASHBOARD — shared UI components
// theme, toasts, modals, copy, custom date picker, background
// ============================================================

// ---------- theme ----------
const KEY_THEME = 'argon:theme';
function applyTheme(theme, updateThumb){
  document.documentElement.setAttribute('data-theme', theme);
  const thumb = document.getElementById('theme-thumb');
  if(thumb){
    thumb.innerHTML = theme === 'dark' ? ICONS.moon : ICONS.sun;
    if(updateThumb){
      thumb.classList.remove('pop');
      void thumb.offsetWidth;
      thumb.classList.add('pop');
    }
  }
}
function setTheme(theme){
  try{ localStorage.setItem(KEY_THEME, theme); }catch(e){}
  applyTheme(theme, true);
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme');
  setTheme(cur === 'dark' ? 'light' : 'dark');
}
function initTheme(){
  let stored = null;
  try{ stored = localStorage.getItem(KEY_THEME); }catch(e){}
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(stored || (prefersDark ? 'dark' : 'light'), false);
  const btn = document.getElementById('btn-theme-toggle');
  if(btn) btn.addEventListener('click', toggleTheme);
}

// ---------- toasts ----------
function toast(type, icon, message){
  const stack = document.getElementById('toast-stack');
  if(!stack) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = icon + '<span>' + escapeHtml(message) + '</span>';
  stack.appendChild(el);
  setTimeout(()=>{
    el.style.transition = 'opacity .2s ease';
    el.style.opacity = '0';
    setTimeout(()=>el.remove(), 200);
  }, 3200);
}

// ---------- copy to clipboard ----------
async function copyText(text, btn){
  let ok = false;
  try{
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  }catch(e){}
  if(!ok){
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand && document.execCommand('copy');
      ta.remove();
    }catch(e){ ok = false; }
  }
  if(ok){
    toast('success', ICONS.check, 'Copied to clipboard.');
    if(btn){
      btn.classList.add('copied');
      btn.innerHTML = ICONS.check;
      setTimeout(()=>{
        btn.classList.remove('copied');
        btn.innerHTML = ICONS.copy;
      }, 1200);
    }
  } else {
    toast('danger', ICONS.warn, "Couldn't copy — select the text manually.");
  }
}

// ---------- modal ----------
function closeModal(){
  DP.close();
  if(typeof CS !== 'undefined') CS.close();
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function openModalShell(innerHtml, opts){
  opts = opts || {};
  const cls = opts.form ? ' modal-form' : (opts.wide ? ' modal-wide' : '');
  document.getElementById('modal-root').innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal${cls}"><div class="modal-accent-bar"></div><div class="modal-scroll">${innerHtml}</div></div></div>`;
  document.getElementById('modal-overlay').addEventListener('click', (e)=>{
    if(e.target.id === 'modal-overlay'){ closeModal(); return; }
    const copyBtn = e.target.closest('.copy-btn[data-copy]');
    if(copyBtn) copyText(copyBtn.getAttribute('data-copy'), copyBtn);
  });
  document.querySelectorAll('.modal-close').forEach(b=>b.addEventListener('click', closeModal));
  document.addEventListener('keydown', escCloseOnce);
  const scroller = document.querySelector('#modal-overlay .modal-scroll');
  if(scroller) scroller.addEventListener('scroll', ()=>{ DP.close(); if(typeof CS !== 'undefined') CS.close(); });
}
function escCloseOnce(e){
  if(e.key === 'Escape'){
    if(typeof CS !== 'undefined' && CS.isOpen()){ CS.close(); return; }
    if(DP.isOpen()){ DP.close(); return; }
    closeModal();
    document.removeEventListener('keydown', escCloseOnce);
  }
}
function confirmModal(opts){
  // opts: {title, message, danger, confirmLabel, onConfirm}
  const html = `
    <div class="modal-header">
      <div><h2>${escapeHtml(opts.title)}</h2></div>
      <button class="modal-close" aria-label="Close">${ICONS.x}</button>
    </div>
    <div class="modal-body">
      <div class="inline-note ${opts.danger ? 'danger' : 'warn'}">${ICONS.warn}<span>${opts.message}</span></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="cm-cancel">Cancel</button>
      <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" id="cm-confirm">${escapeHtml(opts.confirmLabel || 'Confirm')}</button>
    </div>
  `;
  openModalShell(html);
  document.getElementById('cm-cancel').addEventListener('click', closeModal);
  document.getElementById('cm-confirm').addEventListener('click', ()=>opts.onConfirm());
}

// ---------- detail card builder ----------
function detailCard(opts){
  const valHtml = opts.html ? opts.html : (opts.value
    ? escapeHtml(opts.value)
    : `<span class="d-val muted">${escapeHtml(opts.emptyText || 'Not set')}</span>`);
  const inner = opts.html || opts.value
    ? `<span class="d-val">${valHtml}</span>`
    : valHtml;
  return `
    <div class="detail-card${opts.span2 ? ' span-2' : ''}">
      <span class="d-ico${opts.tone ? ' ' + opts.tone : ''}">${opts.icon}</span>
      <span class="d-body">
        <span class="d-label">${opts.label}</span>
        ${inner}
        ${opts.sub ? `<span class="d-sub">${opts.sub}</span>` : ''}
      </span>
      ${opts.copy ? `<button type="button" class="copy-btn" data-copy="${escapeHtml(opts.copy)}" title="Copy ${escapeHtml(opts.label)}" aria-label="Copy ${escapeHtml(opts.label)}">${ICONS.copy}</button>` : ''}
    </div>`;
}

// ---------- custom date picker ----------
const DP_DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const DP = (function(){
  let pop = null, trigger = null, cleanup = null;

  function isOpen(){ return !!pop; }

  function close(){
    if(pop){ pop.remove(); pop = null; }
    if(trigger){ trigger.classList.remove('open'); trigger = null; }
    if(cleanup){ cleanup(); cleanup = null; }
  }

  function refreshTrigger(btn, iso, placeholder){
    if(!btn) return;
    const valEl = btn.querySelector('.dp-value');
    if(!valEl) return;
    if(iso){
      valEl.textContent = formatDateLong(iso);
      valEl.classList.remove('placeholder');
    } else {
      valEl.textContent = placeholder;
      valEl.classList.add('placeholder');
    }
  }

  function open(btn, cfg){
    if(pop && trigger === btn){ close(); return; }
    close();
    trigger = btn;
    btn.classList.add('open');
    pop = document.createElement('div');
    pop.className = 'dp-pop';
    document.body.appendChild(pop);

    const hidden = document.getElementById(cfg.hiddenId);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sel = parseDateOnly(hidden.value);
    let vy, vm;
    if(sel){
      vy = sel.getFullYear(); vm = sel.getMonth();
    } else {
      const min = parseDateOnly(cfg.getMin ? cfg.getMin() : null);
      const base = (min && min > today) ? min : today;
      vy = base.getFullYear(); vm = base.getMonth();
    }

    function setValue(iso){
      hidden.value = iso;
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
      refreshTrigger(btn, iso, cfg.placeholder);
    }

    function position(){
      const r = btn.getBoundingClientRect();
      const pw = pop.offsetWidth || 272;
      const ph = pop.offsetHeight || 320;
      let left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
      let top = r.bottom + 6;
      if(top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    }

    function render(){
      const minIso = cfg.getMin ? (cfg.getMin() || '') : '';
      const maxIso = cfg.getMax ? (cfg.getMax() || '') : '';
      const rangeA = cfg.getRangeStart ? (cfg.getRangeStart() || '') : '';
      const rangeB = cfg.getRangeEnd ? (cfg.getRangeEnd() || '') : '';
      const startDow = new Date(vy, vm, 1).getDay();
      const daysInMonth = new Date(vy, vm + 1, 0).getDate();
      const daysPrev = new Date(vy, vm, 0).getDate();
      let cells = '';
      for(let i = 0; i < 42; i++){
        const dayNum = i - startDow + 1;
        let y = vy, m = vm, d = dayNum, other = false;
        if(dayNum < 1){ m = vm - 1; d = daysPrev + dayNum; other = true; if(m < 0){ m = 11; y--; } }
        else if(dayNum > daysInMonth){ m = vm + 1; d = dayNum - daysInMonth; other = true; if(m > 11){ m = 0; y++; } }
        const dt = new Date(y, m, d);
        const iso = isoOf(y, m, d);
        const off = isOffDay(dt);
        const isSel = hidden.value && iso === hidden.value;
        const isToday = dt.getTime() === today.getTime();
        const disabled = (minIso && iso < minIso) || (maxIso && iso > maxIso);
        const inRange = rangeA && rangeB && iso > rangeA && iso < rangeB;
        cells += `<button type="button" class="dp-day${other ? ' other' : ''}${off ? ' off' : ''}${isToday ? ' today' : ''}${isSel ? ' sel' : ''}${inRange ? ' inrange' : ''}" data-iso="${iso}"${disabled ? ' disabled' : ''} aria-label="${iso}">${d}</button>`;
      }
      pop.innerHTML = `
        <div class="dp-head">
          <button type="button" class="dp-nav" data-nav="-1" aria-label="Previous month">${ICONS.chevL}</button>
          <span class="dp-title">${MONTH_FULL[vm]} ${vy}</span>
          <button type="button" class="dp-nav" data-nav="1" aria-label="Next month">${ICONS.chevR}</button>
        </div>
        <div class="dp-dow">${DP_DOW.map(d => `<span>${d}</span>`).join('')}</div>
        <div class="dp-grid">${cells}</div>
        <div class="dp-foot">
          <span class="dp-legend"><span class="dot"></span>Off day</span>
          <span class="dp-foot-btns">
            ${cfg.required ? '' : '<button type="button" class="dp-link muted" data-act="clear">Clear</button>'}
            <button type="button" class="dp-link" data-act="today">Today</button>
          </span>
        </div>`;
      position();
    }

    pop.addEventListener('click', (e)=>{
      const nav = e.target.closest('[data-nav]');
      if(nav){
        vm += parseInt(nav.dataset.nav, 10);
        if(vm < 0){ vm = 11; vy--; }
        if(vm > 11){ vm = 0; vy++; }
        render();
        return;
      }
      const day = e.target.closest('.dp-day');
      if(day && !day.disabled){ setValue(day.dataset.iso); close(); return; }
      const act = e.target.closest('[data-act]');
      if(act){
        if(act.dataset.act === 'clear'){ setValue(''); close(); }
        else {
          const iso = isoOf(today.getFullYear(), today.getMonth(), today.getDate());
          const minIso = cfg.getMin ? (cfg.getMin() || '') : '';
          const maxIso = cfg.getMax ? (cfg.getMax() || '') : '';
          if(!(minIso && iso < minIso) && !(maxIso && iso > maxIso)){ setValue(iso); close(); }
        }
      }
    });

    const onOutside = (e)=>{
      if(pop && !pop.contains(e.target) && !btn.contains(e.target)) close();
    };
    const onResize = ()=>close();
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', onResize);
    cleanup = ()=>{
      document.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('resize', onResize);
    };
    render();
  }

  function attach(wrapId, cfg){
    const wrap = document.getElementById(wrapId);
    if(!wrap) return;
    const btn = wrap.querySelector('.dp-input');
    const hidden = document.getElementById(cfg.hiddenId);
    if(!btn || !hidden) return;
    refreshTrigger(btn, hidden.value, cfg.placeholder);
    btn.addEventListener('click', ()=>open(btn, cfg));
  }

  return { attach, close, isOpen, refreshTrigger };
})();

// Date-picker field markup helper
function dpField(wrapId, hiddenId, value, icon){
  return `
    <div class="dp-wrap" id="${wrapId}">
      <input type="hidden" id="${hiddenId}" value="${escapeHtml(value || '')}" />
      <button type="button" class="dp-input" aria-haspopup="dialog">${icon || ICONS.cal}<span class="dp-value placeholder">Select date</span><span class="dp-caret">${ICONS.chevD}</span></button>
    </div>`;
}

// ---------- animated particle background ----------
function initParticles(){
  const canvas = document.getElementById('bg-particles');
  if(!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let particles = [], W = 0, H = 0, DPR = 1, rafId = null;

  function currentColors(){
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark ? { a: '139,107,255', b: '34,211,238' } : { a: '108,76,241', b: '6,174,196' };
  }
  function spawn(){
    return {
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-0.5)*0.2, vy: (Math.random()-0.5)*0.2,
      r: Math.random()*2+1.1, mix: Math.random(), phase: Math.random()*Math.PI*2
    };
  }
  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W*DPR); canvas.height = Math.round(H*DPR);
    canvas.style.width = W+'px'; canvas.style.height = H+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
    const count = Math.min(70, Math.max(30, Math.round((W*H)/20000)));
    particles = Array.from({length:count}, spawn);
  }
  function draw(){
    ctx.clearRect(0,0,W,H);
    const c = currentColors();
    const maxDist = 150;
    for(let i=0;i<particles.length;i++){
      for(let j=i+1;j<particles.length;j++){
        const a = particles[i], b = particles[j];
        const dx = a.x-b.x, dy = a.y-b.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if(dist < maxDist){
          ctx.strokeStyle = `rgba(${c.a},${(1 - dist/maxDist) * 0.3})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
        }
      }
    }
    particles.forEach(p=>{
      const tw = (Math.sin(p.phase)+1)/2;
      const col = p.mix > 0.5 ? c.b : c.a;
      ctx.shadowColor = `rgba(${col},0.9)`; ctx.shadowBlur = 7;
      ctx.fillStyle = `rgba(${col},${0.45 + tw*0.5})`;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    });
  }
  function step(){
    particles.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.phase += 0.012;
      if(p.x < -10) p.x = W+10; else if(p.x > W+10) p.x = -10;
      if(p.y < -10) p.y = H+10; else if(p.y > H+10) p.y = -10;
    });
    draw();
    rafId = requestAnimationFrame(step);
  }
  let resizeTimer;
  window.addEventListener('resize', ()=>{ clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){ if(rafId){ cancelAnimationFrame(rafId); rafId = null; } }
    else if(!rafId && !prefersReduced) step();
  });
  resize();
  if(prefersReduced) draw(); else step();
}

// ---------- themed dropdowns (custom select skin) ----------
// Native <select> popups can't be styled, so every select gets a themed
// trigger + glass popup. The native element stays in the DOM (hidden) as
// the source of truth for value/change, so all existing logic keeps working.
const CS = (function(){
  let pop = null, trig = null, sel = null, cleanup = null;

  function isOpen(){ return !!pop; }

  function close(){
    if(pop){ pop.remove(); pop = null; }
    if(trig) trig.classList.remove('open');
    trig = null; sel = null;
    if(cleanup){ cleanup(); cleanup = null; }
  }

  function labelFor(select){
    const o = select.selectedOptions && select.selectedOptions[0];
    return o ? o.textContent : '';
  }

  function syncTrigger(select){
    const t = select._csTrigger;
    if(!t) return;
    t.querySelector('.cs-value').textContent = labelFor(select) || '—';
    t.disabled = select.disabled;
  }

  function open(select){
    if(pop && sel === select){ close(); return; }
    close();
    DP.close();
    sel = select;
    trig = select._csTrigger;
    trig.classList.add('open');
    pop = document.createElement('div');
    pop.className = 'cs-pop';
    const optHtml = (o)=>`<button type="button" class="cs-opt${o.value === select.value ? ' sel' : ''}${o.disabled ? ' dis' : ''}" data-v="${escapeHtml(o.value)}"><span class="cs-opt-label">${escapeHtml(o.textContent)}</span>${o.value === select.value ? ICONS.check : ''}</button>`;
    let html = '';
    [...select.children].forEach(node=>{
      if(node.tagName === 'OPTGROUP'){
        html += `<div class="cs-group">${escapeHtml(node.label)}</div>`;
        [...node.children].forEach(o=>{ html += optHtml(o); });
      } else if(node.tagName === 'OPTION'){
        html += optHtml(node);
      }
    });
    pop.innerHTML = html;
    document.body.appendChild(pop);

    const r = trig.getBoundingClientRect();
    pop.style.minWidth = Math.max(r.width, 190) + 'px';
    pop.style.maxHeight = '280px';
    const pw = pop.offsetWidth || Math.max(r.width, 190);
    const ph = Math.min(pop.offsetHeight || 200, 280);
    let top = r.bottom + 6;
    if(top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8)) + 'px';
    pop.style.top = top + 'px';
    const cur = pop.querySelector('.cs-opt.sel');
    if(cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });

    pop.addEventListener('click', (e)=>{
      const b = e.target.closest('.cs-opt');
      if(!b || b.classList.contains('dis')) return;
      select.value = b.dataset.v;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncTrigger(select);
      close();
    });
    const onOutside = (e)=>{ if(pop && !pop.contains(e.target) && !trig.contains(e.target)) close(); };
    const onResize = ()=>close();
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', onResize);
    cleanup = ()=>{
      document.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('resize', onResize);
    };
  }

  function enhance(select){
    if(select._csTrigger) return;
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'cs-trigger ' + select.className;
    t.setAttribute('aria-haspopup', 'listbox');
    t.innerHTML = `<span class="cs-value"></span><span class="cs-caret">${ICONS.chevD}</span>`;
    select._csTrigger = t;
    select.classList.add('cs-hidden');
    select.insertAdjacentElement('afterend', t);
    syncTrigger(select);
    t.addEventListener('click', ()=>{ if(!select.disabled) open(select); });
    t.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); if(!select.disabled) open(select); }
    });
    select.addEventListener('change', ()=>syncTrigger(select));
  }

  function scan(root){
    (root || document).querySelectorAll('select:not(.cs-hidden)').forEach(enhance);
  }

  function init(){
    scan(document);
    const mo = new MutationObserver((muts)=>{
      for(const m of muts){
        for(const n of m.addedNodes){
          if(n.nodeType === 1 && (n.tagName === 'SELECT' || (n.querySelector && n.querySelector('select')))){
            scan(document);
            return;
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  return { init, scan, close, isOpen };
})();
