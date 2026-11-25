// ============================================================
// VIEW: Overview — one screen: counts, live projects, team load,
// completed by month. Days are working days (Mon–Sat, minus holidays).
// ============================================================
window.Views = window.Views || {};

const OV_ACTIVE = ['in_progress', 'testing'];
const OV_OPEN_MONTHS = 3;   // latest months shown expanded; older ones start collapsed

Views.overview = {
  openMonths: null,         // month keys the user expanded/collapsed (kept while the page lives)

  async render(main){
    const me = App.me;
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const projects = Views.projects.visible();
    const active = projects.filter(p => OV_ACTIVE.includes(p.status));

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
            ${App.canReview ? this.loadPanel(projects) : ''}
          </div>
          <div class="panel ov-panel" id="ov-months">${this.monthsPanel(projects)}</div>
        </div>
      </div>
    `;
    main.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', ()=>{
      Views.projects.statusFilter = el.dataset.go;
      go('projects');
    }));
    this.bindProjectLinks(main.querySelector('.ov-side'));
    this.bindMonths(projects);
  },

  bindProjectLinks(root){
    root.querySelectorAll('[data-proj]').forEach(el => el.addEventListener('click', e=>{
      e.stopPropagation();
      Views.projects.openDetail(el.dataset.proj);
    }));
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
      <div class="panel ov-panel ov-live-panel">
        <div class="panel-head">
          <h2>${ICONS.clock}In progress</h2>
          <span class="ov-head-note">${active.length - testing} building · ${testing} testing</span>
        </div>
        <div class="panel-body flush ov-scroll">${body}</div>
      </div>`;
  },

  // ---------- who is busy, who is free (for assigning the next game) ----------
  loadPanel(projects){
    const devs = App.developers.filter(d => d.active !== false && d.role !== 'admin');
    const rows = devs.map(d => ({
      d,
      live: projects.filter(p => p.developerId === d.id && OV_ACTIVE.includes(p.status)),
      done: projects.filter(p => p.developerId === d.id && p.status === 'completed').length
    })).sort((a,b)=> a.live.length - b.live.length || a.d.name.localeCompare(b.d.name));
    const free = rows.filter(r => !r.live.length).length;
    const body = rows.length ? rows.map(r => `
      <div class="ov-load">
        <span class="ov-load-who">${devAvatar(r.d)}<span class="truncate">${escapeHtml(r.d.name)}</span></span>
        <span class="ov-load-work">
          ${r.live.length
            ? r.live.map(p => `<button type="button" class="ov-pill" data-proj="${p.id}" title="${escapeHtml(p.name)} · ${statusLabel(p.status)}"><span class="ov-pill-dot s-${p.status}"></span><span class="truncate">${escapeHtml(p.name)}</span></button>`).join('')
            : '<span class="ov-free">Free</span>'}
        </span>
        <span class="ov-load-done" title="Completed projects">${r.done} done</span>
      </div>`).join('') : `<div class="ov-empty">No active developers.</div>`;
    return `
      <div class="panel ov-panel ov-load-panel">
        <div class="panel-head">
          <h2>${ICONS.users}Team load</h2>
          <span class="ov-head-note">${free ? `${free} free to take a new game` : 'Everyone is busy'}</span>
        </div>
        <div class="panel-body flush ov-scroll">${body}</div>
      </div>`;
  },

  // ---------- completed by month: latest open, older collapsible ----------
  monthGroups(projects){
    const groups = new Map();
    projects.filter(p => p.status === 'completed' && p.endDate).forEach(p => {
      const key = String(p.endDate).slice(0,7);
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    // always list the current + previous 2 months, even when empty
    const now = new Date();
    for(let i = 0; i < OV_OPEN_MONTHS; i++){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = isoOf(d.getFullYear(), d.getMonth(), 1).slice(0,7);
      if(!groups.has(key)) groups.set(key, []);
    }
    return [...groups.entries()]
      .sort((a,b)=> b[0].localeCompare(a[0]))
      .map(([key, items]) => {
        items.sort((a,b)=> String(b.endDate).localeCompare(String(a.endDate)));
        const days = items.map(p => projectDays(p)).filter(pd => pd && !pd.upcoming).map(pd => pd.days);
        const [y, m] = key.split('-').map(Number);
        return { key, label: `${MONTH_FULL[m - 1]} ${y}`, items, avg: days.length ? Math.round(days.reduce((s,x)=>s+x,0) / days.length) : null };
      });
  },

  monthsPanel(projects){
    const groups = this.monthGroups(projects);
    if(!this.openMonths) this.openMonths = new Set(groups.slice(0, OV_OPEN_MONTHS).map(g => g.key));
    const total = groups.reduce((s,g)=>s + g.items.length, 0);
    const allOpen = groups.every(g => !g.items.length || this.openMonths.has(g.key));
    const body = groups.map(g => {
      const open = this.openMonths.has(g.key) && g.items.length > 0;
      return `<section class="ov-month ${open ? 'open' : ''} ${g.items.length ? '' : 'none'}">
        <button type="button" class="ov-month-head" data-month="${g.key}" ${g.items.length ? `aria-expanded="${open}"` : 'disabled'}>
          <span class="ov-chev">${g.items.length ? ICONS.chevR : ''}</span>
          <span class="ov-month-name">${g.label}</span>
          ${g.avg !== null ? `<span class="ov-month-avg">avg ${daysLabel(g.avg)}</span>` : ''}
          <span class="ov-month-n">${g.items.length || '—'}</span>
        </button>
        ${open ? `<div class="ov-month-list">${g.items.map(p => {
          const dev = getDeveloper(p.developerId);
          const pd = projectDays(p);
          return `<button type="button" class="ov-done${App.canReview ? "" : " no-dev"}" data-proj="${p.id}">
            <span class="ov-done-name truncate">${escapeHtml(p.name)}</span>
            ${App.canReview ? `<span class="ov-done-dev">${dev ? `${devAvatar(dev)}<span class="truncate">${escapeHtml(dev.name)}</span>` : '<span class="muted">Unassigned</span>'}</span>` : ''}
            <span class="ov-done-date">${formatDateShort(p.endDate)}</span>
            <span class="ov-done-days">${pd && !pd.upcoming ? daysLabel(pd.days) : '—'}</span>
          </button>`;
        }).join('')}</div>` : ''}
      </section>`;
    }).join('');
    return `
      <div class="panel-head">
        <h2>${ICONS.check}Completed by month</h2>
        <span class="ov-head-actions">
          <span class="ov-head-note">${total} total</span>
          ${groups.some(g => g.items.length) ? `<button type="button" class="ov-link" id="ov-months-all">${allOpen ? 'Collapse all' : 'Expand all'}</button>` : ''}
        </span>
      </div>
      <div class="panel-body flush ov-scroll">${total ? body : '<div class="ov-empty">No completed projects yet.</div>'}</div>`;
  },

  bindMonths(projects){
    const wrap = document.getElementById('ov-months');
    if(!wrap) return;
    const rerender = ()=>{
      const scroller = wrap.querySelector('.ov-scroll');
      const top = scroller ? scroller.scrollTop : 0;
      wrap.innerHTML = this.monthsPanel(projects);
      const s2 = wrap.querySelector('.ov-scroll');
      if(s2) s2.scrollTop = top;
      this.bindMonths(projects);
    };
    wrap.querySelectorAll('[data-month]').forEach(btn => btn.addEventListener('click', ()=>{
      const k = btn.dataset.month;
      this.openMonths.has(k) ? this.openMonths.delete(k) : this.openMonths.add(k);
      rerender();
    }));
    const all = document.getElementById('ov-months-all');
    if(all) all.addEventListener('click', ()=>{
      const groups = this.monthGroups(projects).filter(g => g.items.length);
      const allOpen = groups.every(g => this.openMonths.has(g.key));
      this.openMonths = new Set(allOpen ? [] : groups.map(g => g.key));
      rerender();
    });
    this.bindProjectLinks(wrap);
  }
};
