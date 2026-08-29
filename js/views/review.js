// ============================================================
// VIEW: Review — team's daily updates, missing flags, approval
// (admins see everyone; leaders see their team)
// ============================================================
window.Views = window.Views || {};

Views.review = {
  date: null,

  async render(main){
    if(!App.canReview){ main.innerHTML = ''; return; }
    this.date = this.date || todayIso();
    main.innerHTML = `
      <div class="fill-page">
      <div class="main-head">
        <div><h1>Daily Review</h1><p class="sub">${App.isAdmin ? 'All developers' : "Your team's"} work updates, day by day.</p></div>
        <div class="head-actions">
          <button class="btn btn-secondary btn-sm" id="rv-prev" title="Previous day">${ICONS.chevL}</button>
          <div class="dp-wrap" id="dpw-rv" style="min-width:190px;">
            <input type="hidden" id="rv-date" value="${this.date}" />
            <button type="button" class="dp-input" aria-haspopup="dialog">${ICONS.cal}<span class="dp-value placeholder">Select date</span><span class="dp-caret">${ICONS.chevD}</span></button>
          </div>
          <button class="btn btn-secondary btn-sm" id="rv-next" title="Next day">${ICONS.chevR}</button>
        </div>
      </div>
      <div id="rv-body" class="fill-flex col-flex"><div class="panel"><div class="skeleton-row"><div class="spinner" style="margin:0 auto;"></div></div></div></div>
      </div>
    `;
    DP.attach('dpw-rv', { hiddenId: 'rv-date', placeholder: 'Select date', required: true, getMax: ()=>todayIso() });
    document.getElementById('rv-date').addEventListener('change', ()=>{
      this.date = document.getElementById('rv-date').value || todayIso();
      this.loadDay();
    });
    const shift = (n)=>{
      const next = addDaysIso(this.date, n);
      if(next > todayIso()) return;
      this.date = next;
      document.getElementById('rv-date').value = next;
      DP.refreshTrigger(document.querySelector('#dpw-rv .dp-input'), next, 'Select date');
      this.loadDay();
    };
    document.getElementById('rv-prev').addEventListener('click', ()=>shift(-1));
    document.getElementById('rv-next').addEventListener('click', ()=>shift(1));
    await this.loadDay();
  },

  teamDevs(){
    const ids = App.myTeamDevIds;
    return App.developers
      .filter(d => d.active !== false && ids.includes(d.id))
      .sort((a,b)=>a.name.localeCompare(b.name));
  },

  async loadDay(){
    const body = document.getElementById('rv-body');
    body.innerHTML = '<div class="panel"><div class="skeleton-row"><div class="spinner" style="margin:0 auto;"></div></div></div>';
    const logs = await apiLoadLogs({ from: this.date, to: this.date });
    const off = isOffDay(parseDateOnly(this.date));
    const devs = this.teamDevs();
    const byDev = {};
    logs.forEach(l=>{ (byDev[l.devId] = byDev[l.devId] || []).push(l); });

    const withLogs = devs.filter(d => (byDev[d.id]||[]).length);
    const missing = off ? [] : devs.filter(d => !(byDev[d.id]||[]).length && d.userId);
    const teamLogs = logs.filter(l=>devs.some(d=>d.id===l.devId));
    const totalTasks = teamLogs.reduce((s,l)=>s + descLines(l.description).length, 0);
    const pendingCount = teamLogs.filter(l=>l.status==='pending').length;

    body.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><span class="stat-ico green">${ICONS.check}</span><div class="stat-body"><div class="stat-val">${withLogs.length}/${devs.length}</div><div class="stat-label">Updated</div></div></div>
        <div class="stat-card"><span class="stat-ico ${missing.length?'red':'green'}">${missing.length?ICONS.warn:ICONS.check}</span><div class="stat-body"><div class="stat-val">${missing.length}</div><div class="stat-label">Missing</div></div></div>
        <div class="stat-card"><span class="stat-ico teal">${ICONS.clipboard}</span><div class="stat-body"><div class="stat-val">${totalTasks}</div><div class="stat-label">Team tasks</div></div></div>
        <div class="stat-card"><span class="stat-ico amber">${ICONS.clock}</span><div class="stat-body"><div class="stat-val">${pendingCount}</div><div class="stat-label">Pending approval</div></div></div>
      </div>
      ${off ? `<div class="panel"><div class="panel-body" style="padding:12px 16px;"><div class="inline-note">${ICONS.info}<span><b>${formatDateFriendly(this.date)} is an off day</b> (Sunday or 1st/3rd Saturday) — updates are optional.</span></div></div></div>` : ''}
      <div class="panel fill">
        <div class="panel-head">
          <h2>${ICONS.users}${formatDateFriendly(this.date)}</h2>
          ${pendingCount ? `<button class="btn btn-primary btn-sm" id="rv-approve-all">${ICONS.check}Approve all (${pendingCount})</button>` : ''}
        </div>
        <div class="panel-body flush">
          ${devs.map(d=>this.devBlock(d, byDev[d.id]||[], off)).join('') || '<div class="skeleton-row">No active developers.</div>'}
        </div>
      </div>
    `;
    const all = document.getElementById('rv-approve-all');
    if(all) all.addEventListener('click', ()=>this.approveAll(logs.filter(l=>l.status==='pending' && devs.some(d=>d.id===l.devId))));
    body.querySelectorAll('[data-approve]').forEach(b=>b.addEventListener('click', ()=>this.approve(Number(b.dataset.approve), b)));
  },

  devBlock(d, logs, off){
    const tasks = logs.reduce((s,l)=>s + descLines(l.description).length, 0);
    return `
      <div class="review-dev">
        <div class="review-dev-head">
          <span class="u-avatar ${avClass(d.name)}">${escapeHtml(initialsOf(d.name))}</span>
          <span class="rd-name">${escapeHtml(d.name)}</span>
          ${roleBadge(d.role)}
          <span class="rd-spacer"></span>
          ${logs.length
            ? `<span class="tasks-chip">${ICONS.check}${tasks} task${tasks===1?'':'s'}</span>`
            : off
              ? `<span class="offday-chip">Off day</span>`
              : d.userId
                ? `<span class="missing-chip">${ICONS.warn}No update</span>`
                : `<span class="offday-chip" title="No login account — can't log work yet">No account</span>`}
        </div>
        ${logs.map(l=>{
          const proj = l.projectId ? getProject(l.projectId) : null;
          return `
          <div class="log-entry">
            <div class="log-main">
              <div class="log-top">
                <span class="log-proj ${proj?'':'other'}">${proj ? escapeHtml(proj.name) : escapeHtml(l.otherWork || 'Other work')}</span>
                ${proj ? `<span class="mono muted">${proj.id}</span>` : '<span class="opt-tag" style="margin:0;">Non-project</span>'}
                <span class="approve-chip ${l.status}">${l.status==='approved'?ICONS.check:ICONS.clock}${l.status}</span>
              </div>
              <div class="log-desc">${descriptionHtml(l.description)}</div>
            </div>
            <div class="log-actions">
              ${l.status==='pending' ? `<button class="btn btn-secondary btn-sm" data-approve="${l.id}">${ICONS.check}Approve</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  },

  async approve(logId, btn){
    if(btn){ btn.disabled = true; btn.textContent = '…'; }
    try{
      await apiUpdateLog(logId, { status: 'approved', approvedBy: App.me.id });
      toast('success', ICONS.check, 'Entry approved.');
      this.loadDay();
    }catch(err){
      toast('danger', ICONS.warn, err.message || 'Could not approve.');
      if(btn){ btn.disabled = false; btn.innerHTML = ICONS.check + 'Approve'; }
    }
  },

  async approveAll(pending){
    const btn = document.getElementById('rv-approve-all');
    if(btn) btn.disabled = true;
    try{
      for(const l of pending){
        await apiUpdateLog(l.id, { status: 'approved', approvedBy: App.me.id });
      }
      toast('success', ICONS.check, `Approved ${pending.length} entr${pending.length===1?'y':'ies'}.`);
      this.loadDay();
    }catch(err){
      toast('danger', ICONS.warn, err.message || 'Could not approve everything.');
      this.loadDay();
    }
  }
};
