// ============================================================
// VIEW: Reports — hours by developer / project, CSV export
// ============================================================
window.Views = window.Views || {};

Views.reports = {
  from: null,
  to: null,
  groupBy: 'dev',   // 'dev' | 'project'
  logs: [],

  async render(main){
    if(!App.canReview){ main.innerHTML = ''; return; }
    if(!this.from){
      this.to = todayIso();
      this.from = addDaysIso(this.to, -6);
    }
    main.innerHTML = `
      <div class="fill-page">
      <div class="main-head">
        <div><h1>Reports</h1><p class="sub">Hours logged across the team.</p></div>
        <div class="head-actions">
          <div class="seg" id="rp-range">
            <button data-days="7" class="active">7 days</button>
            <button data-days="30">30 days</button>
            <button data-days="90">90 days</button>
          </div>
        </div>
      </div>
      <div class="toolbar">
        <div class="toolbar-field">
          <label class="toolbar-label">From</label>
          ${dpField('dpw-rfrom', 'rp-from', this.from, ICONS.cal)}
        </div>
        <div class="toolbar-field">
          <label class="toolbar-label">To</label>
          ${dpField('dpw-rto', 'rp-to', this.to, ICONS.flag)}
        </div>
        <div class="toolbar-field">
          <label class="toolbar-label">Group by</label>
          <div class="seg" id="rp-group">
            <button data-g="dev" class="${this.groupBy==='dev'?'active':''}">Developer</button>
            <button data-g="project" class="${this.groupBy==='project'?'active':''}">Project</button>
          </div>
        </div>
        <div class="toolbar-actions">
          <button class="btn btn-secondary" id="rp-csv">${ICONS.download}Export CSV</button>
        </div>
      </div>
      <div id="rp-body" class="fill-flex col-flex"><div class="panel"><div class="skeleton-row"><div class="spinner" style="margin:0 auto;"></div></div></div></div>
      </div>
    `;
    DP.attach('dpw-rfrom', { hiddenId: 'rp-from', placeholder: 'From', required: true, getMax: ()=>document.getElementById('rp-to').value || todayIso() });
    DP.attach('dpw-rto', { hiddenId: 'rp-to', placeholder: 'To', required: true, getMin: ()=>document.getElementById('rp-from').value, getMax: ()=>todayIso() });
    document.getElementById('rp-from').addEventListener('change', ()=>{ this.from = document.getElementById('rp-from').value; this.load(); });
    document.getElementById('rp-to').addEventListener('change', ()=>{ this.to = document.getElementById('rp-to').value; this.load(); });
    document.querySelectorAll('#rp-range button').forEach(b=>b.addEventListener('click', ()=>{
      document.querySelectorAll('#rp-range button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      this.to = todayIso();
      this.from = addDaysIso(this.to, -(Number(b.dataset.days) - 1));
      document.getElementById('rp-from').value = this.from;
      document.getElementById('rp-to').value = this.to;
      DP.refreshTrigger(document.querySelector('#dpw-rfrom .dp-input'), this.from, 'From');
      DP.refreshTrigger(document.querySelector('#dpw-rto .dp-input'), this.to, 'To');
      this.load();
    }));
    document.querySelectorAll('#rp-group button').forEach(b=>b.addEventListener('click', ()=>{
      this.groupBy = b.dataset.g;
      document.querySelectorAll('#rp-group button').forEach(x=>x.classList.toggle('active', x===b));
      this.renderBody();
    }));
    document.getElementById('rp-csv').addEventListener('click', ()=>this.exportCsv());
    await this.load();
  },

  async load(){
    const body = document.getElementById('rp-body');
    body.innerHTML = '<div class="panel"><div class="skeleton-row"><div class="spinner" style="margin:0 auto;"></div></div></div>';
    const teamIds = App.myTeamDevIds;
    this.logs = (await apiLoadLogs({ from: this.from, to: this.to }))
      .filter(l => teamIds.includes(l.devId));
    this.renderBody();
  },

  grouped(){
    const map = new Map();
    this.logs.forEach(l=>{
      const key = this.groupBy === 'dev' ? l.devId : (l.projectId || '__other__');
      if(!map.has(key)) map.set(key, { tasks: 0, entries: 0, days: new Set() });
      const g = map.get(key);
      g.tasks += descLines(l.description).length;
      g.entries += 1;
      g.days.add(l.workDate.slice(0,10));
    });
    let rows = [...map.entries()].map(([key, g])=>{
      let label, sub = '';
      if(this.groupBy === 'dev'){
        const d = getDeveloper(key);
        label = d ? d.name : key;
        sub = key;
      } else if(key === '__other__'){
        label = 'Other work (non-project)';
      } else {
        const p = getProject(key);
        label = p ? p.name : key;
        sub = key;
      }
      return { key, label, sub, tasks: g.tasks, entries: g.entries, days: g.days.size };
    });
    rows.sort((a,b)=>b.tasks - a.tasks);
    return rows;
  },

  renderBody(){
    const body = document.getElementById('rp-body');
    const rows = this.grouped();
    const totalTasks = rows.reduce((s,r)=>s+r.tasks, 0);
    const workDays = calculateWorkingDays(this.from, this.to);
    if(!rows.length){
      body.innerHTML = `<div class="panel"><div class="empty-state">${ICONS.empty}<p>No work logged between ${formatDateLong(this.from)} and ${formatDateLong(this.to)}.</p></div></div>`;
      return;
    }
    const max = rows[0].tasks || 1;
    body.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><span class="stat-ico teal">${ICONS.check}</span><div class="stat-body"><div class="stat-val">${totalTasks}</div><div class="stat-label">Total tasks</div></div></div>
        <div class="stat-card"><span class="stat-ico">${ICONS.clipboard}</span><div class="stat-body"><div class="stat-val">${this.logs.length}</div><div class="stat-label">Entries</div></div></div>
        <div class="stat-card"><span class="stat-ico amber">${ICONS.cal}</span><div class="stat-body"><div class="stat-val">${workDays ?? '—'}</div><div class="stat-label">Working days in range</div></div></div>
      </div>
      <div class="panel fill">
        <div class="panel-head"><h2>${ICONS.chart}Tasks by ${this.groupBy === 'dev' ? 'developer' : 'project'} · ${formatDateLong(this.from)} → ${formatDateLong(this.to)}</h2></div>
        <div class="panel-body flush">
          <div class="table-scroll"><table>
            <thead><tr>
              <th>${this.groupBy === 'dev' ? 'Developer' : 'Project'}</th>
              <th style="width:44%;">Share</th>
              <th style="width:80px;">Tasks</th>
              <th style="width:80px;">Entries</th>
              <th style="width:110px;">Days worked</th>
            </tr></thead>
            <tbody>
              ${rows.map(r=>`
                <tr>
                  <td><span style="font-weight:600;">${escapeHtml(r.label)}</span>${r.sub ? ` <span class="mono muted">${escapeHtml(r.sub)}</span>` : ''}</td>
                  <td><div class="report-bar"><div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.tasks / max * 100)}%;"></div></div><span class="muted" style="font-size:11px;">${Math.round(r.tasks / (totalTasks || 1) * 100)}%</span></div></td>
                  <td><span class="hours-num">${r.tasks}</span></td>
                  <td>${r.entries}</td>
                  <td>${r.days}</td>
                </tr>`).join('')}
            </tbody>
          </table></div>
        </div>
      </div>
    `;
  },

  exportCsv(){
    if(!this.logs.length){
      toast('danger', ICONS.warn, 'Nothing to export for this range.');
      return;
    }
    const rows = [['Date','Developer ID','Developer','Project ID','Project / Other work','Tasks','Status','Work done']];
    [...this.logs].sort((a,b)=>a.workDate < b.workDate ? -1 : 1).forEach(l=>{
      const d = getDeveloper(l.devId);
      const p = l.projectId ? getProject(l.projectId) : null;
      rows.push([
        l.workDate.slice(0,10), l.devId, d ? d.name : '', l.projectId || '',
        p ? p.name : (l.otherWork || 'Other work'),
        descLines(l.description).length, l.status, descLines(l.description).map(x=>'• ' + x).join('\n')
      ]);
    });
    downloadCsv(`argon-worklog_${this.from}_to_${this.to}.csv`, rows);
    toast('success', ICONS.check, 'CSV downloaded.');
  }
};
