// ============================================================
// VIEW: Overview — one screen: counts, live projects, monthly finishes
// Days are working days (Mon–Sat, minus each project's holidays).
// ============================================================
window.Views = window.Views || {};

const OV_ACTIVE = ['in_progress', 'testing'];
const OV_MONTHS = 6;

Views.overview = {
  async render(main){
    const me = App.me;
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const projects = Views.projects.visible();
    const active = projects.filter(p => OV_ACTIVE.includes(p.status));
    const waiting = projects.filter(p => p.status === 'planned' || p.status === 'on_hold');

    main.innerHTML = `
      <div class="fill-page ov-page">
        <div class="main-head">
          <div>
            <h1>${greet}, ${escapeHtml(me.name.split(' ')[0])}</h1>
            <p class="sub">${formatDateLong(todayIso())}</p>
          </div>
          <div class="ov-counts">
            <button type="button" class="ov-count" data-go="">
              <b>${projects.length}</b><span>Total projects</span>
            </button>
            <button type="button" class="ov-count live" data-go="in_progress">
              <b><span class="live-dot"></span>${active.length}</b><span>Active now</span>
            </button>
          </div>
        </div>

        <div class="ov-grid">
          <div class="ov-side">
            ${this.livePanel(active)}
            ${this.waitingPanel(waiting)}
          </div>
          ${this.monthsPanel(projects)}
        </div>
      </div>
    `;
    main.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', ()=>{
      Views.projects.statusFilter = el.dataset.go;
      go('projects');
    }));
    main.querySelectorAll('[data-proj]').forEach(el => el.addEventListener('click', ()=>Views.projects.openDetail(el.dataset.proj)));
  },

  // ---------- what is being worked on right now ----------
  livePanel(active){
    const list = active.map(p => ({ p, pd: projectDays(p) }))
      .sort((a,b)=> (b.pd ? b.pd.days : -1) - (a.pd ? a.pd.days : -1));
    const testing = active.filter(p => p.status === 'testing').length;
    const body = list.length ? `
      <table class="ov-table">
        <thead><tr>
          <th>Game</th>
          ${App.canReview ? '<th>Developer</th>' : ''}
          <th>Stage</th>
          <th>Started</th>
          <th class="num">Days</th>
        </tr></thead>
        <tbody>
          ${list.map(({ p }) => {
            const dev = getDeveloper(p.developerId);
            return `<tr data-proj="${p.id}">
              <td><div class="ov-game"><span class="truncate">${escapeHtml(p.name)}</span><span class="ov-id">${p.id}</span></div></td>
              ${App.canReview ? `<td>${dev ? `<span class="dev-name-wrap">${devAvatar(dev)}<span class="truncate">${escapeHtml(dev.name)}</span></span>` : '<span class="muted">Unassigned</span>'}</td>` : ''}
              <td>${statusChip(p.status)}</td>
              <td class="date-cell">${p.startDate ? formatDateShort(p.startDate) : '—'}</td>
              <td class="num">${daysChip(p)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : `<div class="ov-empty">Nothing in progress right now.</div>`;
    return `
      <div class="panel ov-panel">
        <div class="panel-head">
          <h2>${ICONS.clock}In progress</h2>
          <span class="ov-head-note">${active.length - testing} building · ${testing} testing</span>
        </div>
        <div class="panel-body flush ov-scroll">${body}</div>
      </div>`;
  },

  // ---------- completed per month, as a plain list ----------
  monthsPanel(projects){
    const now = new Date();
    const months = [];
    for(let i = 0; i < OV_MONTHS; i++){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: isoOf(d.getFullYear(), d.getMonth(), 1).slice(0,7), label: `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`, items: [] });
    }
    projects.filter(p => p.status === 'completed' && p.endDate).forEach(p => {
      const m = months.find(x => x.key === String(p.endDate).slice(0,7));
      if(m) m.items.push(p);
    });
    const total = months.reduce((s,m)=>s + m.items.length, 0);
    const body = months.map(m => {
      m.items.sort((a,b)=> String(b.endDate).localeCompare(String(a.endDate)));
      return `<div class="ov-month ${m.items.length ? '' : 'none'}">
        <div class="ov-month-head">
          <span class="ov-month-name">${m.label}</span>
          <span class="ov-month-n">${m.items.length ? `${m.items.length} completed` : 'None'}</span>
        </div>
        ${m.items.length ? `<div class="ov-month-items">${m.items.map(p => {
          const pd = projectDays(p);
          return `<button type="button" class="ov-pill" data-proj="${p.id}" title="${escapeHtml(p.name)} · finished ${formatDateLong(p.endDate)}">
            <span class="truncate">${escapeHtml(p.name)}</span>${pd && !pd.upcoming ? `<span class="ov-pill-days">${pd.days}d</span>` : ''}
          </button>`;
        }).join('')}</div>` : ''}
      </div>`;
    }).join('');
    return `
      <div class="panel ov-panel">
        <div class="panel-head">
          <h2>${ICONS.check}Completed by month</h2>
          <span class="ov-head-note">${total} in ${OV_MONTHS} months</span>
        </div>
        <div class="panel-body flush ov-scroll">${body}</div>
      </div>`;
  },

  // ---------- not started yet / paused ----------
  waitingPanel(waiting){
    const order = { on_hold: 0, planned: 1 };
    const list = [...waiting].sort((a,b)=> order[a.status] - order[b.status] || a.name.localeCompare(b.name));
    const body = list.length ? list.map(p => {
      const dev = getDeveloper(p.developerId);
      return `<button type="button" class="ov-wait" data-proj="${p.id}">
        <span class="ov-wait-name truncate">${escapeHtml(p.name)}</span>
        <span class="ov-wait-dev truncate">${dev ? escapeHtml(dev.name) : 'Unassigned'}</span>
        ${statusChip(p.status)}
      </button>`;
    }).join('') : `<div class="ov-empty">No planned or paused projects.</div>`;
    return `
      <div class="panel ov-panel ov-panel-sm">
        <div class="panel-head">
          <h2>${ICONS.flag}Up next &amp; on hold</h2>
          <span class="ov-head-note">${list.length}</span>
        </div>
        <div class="panel-body flush ov-scroll">${body}</div>
      </div>`;
  }
};
