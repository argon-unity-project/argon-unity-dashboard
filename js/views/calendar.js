// ============================================================
// VIEW: Calendar — admin-managed workdays (stored in Supabase)
// Full-year grid: one row per month, one column per day.
// Click ANY day to toggle working/off — weekends included.
// ============================================================
window.Views = window.Views || {};

Views.calendar = {
  y: null,
  hol: null,    // Set: extra holidays (working days marked off)
  work: null,   // Set: weekly-off days forced to working
  savedHol: null, savedWork: null,

  async render(main){
    if(!App.isAdmin){ main.innerHTML = ''; return; }
    if(this.y === null) this.y = new Date().getFullYear();
    let stored = null;
    try{ stored = await apiGetSetting('holidays'); }
    catch(e){
      main.innerHTML = `<div class="panel"><div class="panel-body"><div class="inline-note danger">${ICONS.warn}
        <span><b>Settings table missing.</b> Run the "APP SETTINGS" block at the bottom of supabase-setup.sql in the Supabase SQL editor, then reload.</span></div></div></div>`;
      return;
    }
    this.savedHol  = new Set((stored && stored.dates) || []);
    this.savedWork = new Set((stored && stored.work)  || []);
    this.hol  = new Set(this.savedHol);
    this.work = new Set(this.savedWork);

    main.innerHTML = `
      <div class="fill-page">
        <div class="main-head">
          <div><h1>Work Calendar</h1><p class="sub">Click any day to toggle working / off. Sundays start as off; all Saturdays are working until you mark them off.</p></div>
          <div class="head-actions">
            <button class="icon-btn" id="cal-prev" title="Previous year">${ICONS.chevL}</button>
            <b class="cal-label" id="cal-label"></b>
            <button class="icon-btn" id="cal-next" title="Next year">${ICONS.chevR}</button>
            <button class="btn btn-primary" id="cal-save">${ICONS.check}<span>Saved</span></button>
          </div>
        </div>
        <div class="panel col-flex fill-flex">
          <div class="calyear-wrap" id="cal-grid"></div>
          <div class="cal-legend">
            <span><i class="lg-auto"></i>Sunday (weekly off)</span>
            <span><i class="lg-holiday"></i>Holiday — you marked it off</span>
            <span><i class="lg-work"></i>Sunday forced working</span>
            <span><i class="lg-today"></i>Today</span>
            <span id="cal-count" style="margin-left:auto;"></span>
          </div>
        </div>
      </div>`;

    document.getElementById('cal-prev').addEventListener('click', ()=>{ this.y--; this.draw(); });
    document.getElementById('cal-next').addEventListener('click', ()=>{ this.y++; this.draw(); });
    document.getElementById('cal-save').addEventListener('click', ()=>this.save());
    this.draw();
  },

  draw(){
    document.getElementById('cal-label').textContent = this.y;
    const today = todayIso();
    const DOW = ['S','M','T','W','T','F','S'];
    const nowD = new Date();
    const curM = this.y === nowD.getFullYear() ? nowD.getMonth() : -1;
    let html = `<div class="calyear-grid">
      <span class="cy-corner"></span>
      ${Array.from({length:31},(_,i)=>`<span class="cy-daynum" data-d="${i+1}">${i+1}</span>`).join('')}`;
    for(let m = 0; m < 12; m++){
      const days = new Date(this.y, m + 1, 0).getDate();
      const cur = m === curM;
      html += `<span class="cy-mon${cur?' cur':''}" data-m="${m}">${MONTH_SHORT[m]}</span>`;
      for(let dd = 1; dd <= 31; dd++){
        if(dd > days){ html += `<span class="cy-cell empty${cur?' cur-row':''}"></span>`; continue; }
        const date = new Date(this.y, m, dd);
        const iso = isoOf(this.y, m, dd);
        const auto = isAutoOffDay(date);
        const off = auto ? !this.work.has(iso) : this.hol.has(iso);
        const cls = ['cy-cell'];
        if(cur) cls.push('cur-row');
        if(off) cls.push('off');
        if(off && !auto) cls.push('holiday');
        if(auto && !off) cls.push('work-override');
        if(iso === today) cls.push('today');
        html += `<span class="${cls.join(' ')}" data-iso="${iso}" data-auto="${auto?1:0}" data-m="${m}" data-d="${dd}" title="${DOW_SHORT[date.getDay()]}, ${dd} ${MONTH_SHORT[m]} ${this.y}${off?' — OFF':' — working'}">${DOW[date.getDay()]}</span>`;
      }
    }
    html += '</div>';
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = html;
    grid.querySelectorAll('.cy-cell[data-iso]').forEach(c=>c.addEventListener('click', ()=>{
      this.toggle(c.dataset.iso, c.dataset.auto === '1');
    }));
    // Excel-style cross highlight: light up the row + column of the hovered cell
    const gEl = grid.querySelector('.calyear-grid');
    gEl.addEventListener('mouseover', e=>{
      const cell = e.target.closest('.cy-cell[data-iso]');
      if(!cell) return;
      this.clearHl(gEl);
      const mh = gEl.querySelector(`.cy-mon[data-m="${cell.dataset.m}"]`);
      const dh = gEl.querySelector(`.cy-daynum[data-d="${cell.dataset.d}"]`);
      if(mh) mh.classList.add('hl');
      if(dh) dh.classList.add('hl');
      gEl.querySelectorAll(`.cy-cell[data-m="${cell.dataset.m}"],.cy-cell[data-d="${cell.dataset.d}"]`)
        .forEach(c=>{ if(c !== cell) c.classList.add('hl-line'); });
    });
    gEl.addEventListener('mouseleave', ()=>this.clearHl(gEl));
    this.refreshMeta();
  },

  clearHl(gEl){
    gEl.querySelectorAll('.hl,.hl-line').forEach(el=>el.classList.remove('hl','hl-line'));
  },

  toggle(iso, auto){
    if(auto){
      // weekly-off day: toggle forced-working override
      this.work.has(iso) ? this.work.delete(iso) : this.work.add(iso);
    }else{
      // normal working day: toggle holiday
      this.hol.has(iso) ? this.hol.delete(iso) : this.hol.add(iso);
    }
    this.draw();
  },

  refreshMeta(){
    const holYear = [...this.hol].filter(i=>i.startsWith(String(this.y))).length;
    const workYear = [...this.work].filter(i=>i.startsWith(String(this.y))).length;
    document.getElementById('cal-count').textContent =
      `${this.y}: ${holYear} holiday${holYear===1?'':'s'} · ${workYear} Sunday${workYear===1?'':'s'} working`;
    const dirty =
      this.hol.size !== this.savedHol.size || [...this.hol].some(x=>!this.savedHol.has(x)) ||
      this.work.size !== this.savedWork.size || [...this.work].some(x=>!this.savedWork.has(x));
    const btn = document.getElementById('cal-save');
    if(btn) btn.querySelector('span').textContent = dirty ? 'Save changes' : 'Saved';
  },

  async save(){
    const btn = document.getElementById('cal-save');
    btn.disabled = true;
    try{
      const dates = [...this.hol].sort();
      const work = [...this.work].sort();
      await apiSaveSetting('holidays', { dates, work });
      this.savedHol = new Set(dates);
      this.savedWork = new Set(work);
      setCustomHolidays(dates, work);            // apply everywhere immediately
      this.refreshMeta();
      toast('success', ICONS.check, 'Work calendar saved for the whole team.');
      updateReviewFlag();
    }catch(err){
      toast('danger', ICONS.warn, err.message || 'Could not save the calendar.');
    }finally{
      btn.disabled = false;
    }
  }
};
