// ============================================================
// VIEW: Calendar — admin-managed holidays (stored in Supabase)
// Click a working day to toggle it as a holiday, then Save.
// Sundays + 1st/3rd Saturdays are automatic off days (locked).
// ============================================================
window.Views = window.Views || {};

Views.calendar = {
  y: null, m: null,        // viewed month
  sel: null,               // Set of holiday ISO dates (working copy)
  saved: null,             // Set as last saved

  async render(main){
    if(!App.isAdmin){ main.innerHTML = ''; return; }
    const now = new Date();
    if(this.y === null){ this.y = now.getFullYear(); this.m = now.getMonth(); }
    let stored = null;
    try{ stored = await apiGetSetting('holidays'); }
    catch(e){
      main.innerHTML = `<div class="panel"><div class="panel-body"><div class="inline-note danger">${ICONS.warn}
        <span><b>Settings table missing.</b> Run the "APP SETTINGS" block at the bottom of supabase-setup.sql in the Supabase SQL editor, then reload.</span></div></div></div>`;
      return;
    }
    this.saved = new Set((stored && stored.dates) || []);
    this.sel = new Set(this.saved);

    main.innerHTML = `
      <div class="fill-page">
        <div class="main-head">
          <div><h1>Holiday Calendar</h1><p class="sub">Click a working day to toggle it as a holiday. Sundays &amp; 1st/3rd Saturdays are always off.</p></div>
          <div class="head-actions">
            <button class="btn btn-secondary btn-sm" id="cal-today">Today</button>
            <button class="icon-btn" id="cal-prev" title="Previous month">${ICONS.chevL}</button>
            <b class="cal-label" id="cal-label"></b>
            <button class="icon-btn" id="cal-next" title="Next month">${ICONS.chevR}</button>
            <button class="btn btn-primary" id="cal-save">${ICONS.check}<span>Save</span></button>
          </div>
        </div>
        <div class="cal-layout fill-flex">
          <div class="panel col-flex">
            <div class="cal-dow">${DOW_SHORT.map(d=>`<span>${d}</span>`).join('')}</div>
            <div class="cal-grid" id="cal-grid"></div>
          </div>
          <div class="panel col-flex">
            <div class="panel-head"><h2>Holidays · <span id="cal-list-year"></span></h2><span class="count-badge" id="cal-count">0</span></div>
            <div class="panel-body theme-panel-body" id="cal-list"></div>
            <div class="cal-legend">
              <span><i class="lg-auto"></i>Weekly off</span>
              <span><i class="lg-holiday"></i>Holiday</span>
              <span><i class="lg-today"></i>Today</span>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('cal-prev').addEventListener('click', ()=>this.shift(-1));
    document.getElementById('cal-next').addEventListener('click', ()=>this.shift(1));
    document.getElementById('cal-today').addEventListener('click', ()=>{
      this.y = now.getFullYear(); this.m = now.getMonth(); this.draw();
    });
    document.getElementById('cal-save').addEventListener('click', ()=>this.save());
    this.draw();
  },

  shift(n){
    this.m += n;
    if(this.m < 0){ this.m = 11; this.y--; }
    if(this.m > 11){ this.m = 0; this.y++; }
    this.draw();
  },

  draw(){
    document.getElementById('cal-label').textContent = `${MONTH_FULL[this.m]} ${this.y}`;
    const grid = document.getElementById('cal-grid');
    const first = new Date(this.y, this.m, 1);
    const start = new Date(first); start.setDate(1 - first.getDay());   // back to Sunday
    const today = todayIso();
    let html = '';
    const d = new Date(start);
    for(let i = 0; i < 42; i++){
      const iso = isoOfDate(d);
      const inMonth = d.getMonth() === this.m;
      const auto = isAutoOffDay(d);
      const holiday = this.sel.has(iso);
      const cls = ['cal-cell'];
      if(!inMonth) cls.push('other');
      if(auto) cls.push('auto');
      if(holiday) cls.push('holiday');
      if(iso === today) cls.push('today');
      html += `
        <div class="${cls.join(' ')}" ${inMonth && !auto ? `data-iso="${iso}"` : ''}>
          <span class="cal-num">${d.getDate()}</span>
          ${auto ? '<span class="cal-tag">Off</span>' : holiday ? '<span class="cal-tag">Holiday</span>' : ''}
        </div>`;
      d.setDate(d.getDate() + 1);
    }
    grid.innerHTML = html;
    grid.querySelectorAll('[data-iso]').forEach(c=>c.addEventListener('click', ()=>{
      const iso = c.dataset.iso;
      this.sel.has(iso) ? this.sel.delete(iso) : this.sel.add(iso);
      this.draw();
    }));
    this.drawList();
    this.markDirty();
  },

  drawList(){
    document.getElementById('cal-list-year').textContent = this.y;
    const dates = [...this.sel].filter(iso => iso.startsWith(String(this.y))).sort();
    document.getElementById('cal-count').textContent = dates.length;
    document.getElementById('cal-list').innerHTML = dates.length
      ? dates.map(iso=>`
          <div class="cal-list-row">
            <span>${formatDateFriendly(iso)}</span>
            <button class="icon-btn danger" data-del="${iso}" title="Remove">${ICONS.x}</button>
          </div>`).join('')
      : `<div class="mini-note" style="padding:8px 4px;">No holidays marked for ${this.y} yet. Click a date on the calendar to add one.</div>`;
    document.querySelectorAll('#cal-list [data-del]').forEach(b=>b.addEventListener('click', ()=>{
      this.sel.delete(b.dataset.del);
      this.draw();
    }));
  },

  markDirty(){
    const dirty = this.sel.size !== this.saved.size || [...this.sel].some(x=>!this.saved.has(x));
    const btn = document.getElementById('cal-save');
    if(btn) btn.querySelector('span').textContent = dirty ? 'Save changes' : 'Saved';
  },

  async save(){
    const btn = document.getElementById('cal-save');
    btn.disabled = true;
    try{
      const dates = [...this.sel].sort();
      await apiSaveSetting('holidays', { dates });
      this.saved = new Set(dates);
      setCustomHolidays(dates);                 // apply everywhere immediately
      this.markDirty();
      toast('success', ICONS.check, 'Holidays saved for the whole team.');
      updateReviewFlag();
    }catch(err){
      toast('danger', ICONS.warn, err.message || 'Could not save holidays.');
    }finally{
      btn.disabled = false;
    }
  }
};
