// ============================================================
// VIEW: Overview — project pipeline, team speed, live projects
// All numbers are working days (Mon–Sat, minus each project's holidays).
// ============================================================
window.Views = window.Views || {};

const OV_ACTIVE = ['in_progress', 'testing'];
// working days a completed project took, or null if it has no valid start/end dates
function finishedDays(p){
  if(p.status !== 'completed' || !p.startDate || !p.endDate) return null;
  const pd = projectDays(p);
  return pd ? pd.days : null;
}

Views.overview = {
  async render(main){
    const me = App.me;
    const today = todayIso();
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const projects = Views.projects.visible();

    // finished = completed with both dates → how long it really took
    const finished = projects
      .map(p => ({ p, days: finishedDays(p) }))
      .filter(x => x.days !== null);
    const avgDays = finished.length ? finished.reduce((s,x)=>s + x.days, 0) / finished.length : null;
    const fastest = finished.length ? Math.min(...finished.map(x=>x.days)) : null;
    const active = projects.filter(p => OV_ACTIVE.includes(p.status));
    const doneCount = projects.filter(p => p.status === 'completed').length;
    const teamSize = App.developers.filter(d => d.active !== false && d.role !== 'admin').length;

    main.innerHTML = `
      <div class="ov-page">
        <div class="main-head">
          <div>
            <h1>${greet}, ${escapeHtml(me.name.split(' ')[0])}</h1>
            <p class="sub">${formatDateLong(today)} · ${projects.length} project${projects.length===1?'':'s'}${App.canReview ? ` · ${teamSize} developer${teamSize===1?'':'s'}` : ''}</p>
          </div>
          <div class="head-actions">
            <button class="btn btn-secondary" id="ov-all">${ICONS.layers}All projects</button>
          </div>
        </div>

        <div class="ov-kpis">
          ${this.kpi('Total projects', projects.length, `${doneCount} completed`)}
          ${this.kpi('Active now', active.length, active.length
              ? `${active.filter(p=>p.status==='in_progress').length} in progress · ${active.filter(p=>p.status==='testing').length} testing` : 'Nothing running', 'accent')}
          ${this.kpi('Completed', doneCount, projects.length ? `${Math.round(doneCount / projects.length * 100)}% of all` : '—', 'good')}
          ${this.kpi('Avg. time to finish', avgDays === null ? '—' : `${Math.round(avgDays)}<small>days</small>`,
              fastest === null ? 'No finished projects yet' : `Fastest: ${daysLabel(fastest)}`)}
        </div>

        ${this.pipelinePanel(projects)}

        <div class="ov-grid">
          ${App.canReview ? this.teamPanel(projects) : this.minePanel(projects, avgDays)}
          ${this.livePanel(active, avgDays)}
        </div>

        ${this.monthlyPanel(finished)}
      </div>
      <div class="ov-tip" id="ov-tip" role="tooltip"></div>
    `;
    document.getElementById('ov-all').addEventListener('click', ()=>{ Views.projects.statusFilter = ''; go('projects'); });
    main.querySelectorAll('[data-status-link]').forEach(el => el.addEventListener('click', ()=>{
      Views.projects.statusFilter = el.dataset.statusLink;
      go('projects');
    }));
    main.querySelectorAll('[data-proj]').forEach(el => el.addEventListener('click', ()=>Views.projects.openDetail(el.dataset.proj)));
    this.bindTips(main);
  },

  kpi(label, value, sub, tone){
    return `<div class="ov-kpi ${tone || ''}">
      <div class="ov-kpi-label">${label}</div>
      <div class="ov-kpi-val">${value}</div>
      <div class="ov-kpi-sub">${sub}</div>
    </div>`;
  },

  // ---------- one segmented bar: where every project stands ----------
  pipelinePanel(projects){
    const total = projects.length;
    const counts = PROJECT_STATUSES.map(([k, label]) => ({ k, label, n: projects.filter(p => p.status === k).length }));
    const bar = total
      ? counts.filter(c => c.n).map(c => `<button type="button" class="ov-seg s-${c.k}" style="flex-grow:${c.n};" data-status-link="${c.k}"
            data-tip="<b>${c.label}</b> · ${c.n} project${c.n===1?'':'s'} (${Math.round(c.n/total*100)}%)" aria-label="${c.label}: ${c.n}"></button>`).join('')
      : '<div class="ov-seg empty"></div>';
    return `
      <div class="panel ov-panel">
        <div class="panel-head"><h2>${ICONS.layers}Project pipeline</h2><span class="ov-head-note">Click a stage to open those projects</span></div>
        <div class="panel-body">
          <div class="ov-pipe">${bar}</div>
          <div class="ov-legend">
            ${counts.map(c => `<button type="button" class="ov-leg" data-status-link="${c.k}">
              <span class="ov-sw s-${c.k}"></span><span class="ov-leg-label">${c.label}</span>
              <b>${c.n}</b><span class="ov-leg-pct">${total ? Math.round(c.n/total*100) : 0}%</span>
            </button>`).join('')}
          </div>
        </div>
      </div>`;
  },

  // ---------- per developer: finished, running, average speed ----------
  teamPanel(projects){
    const devs = App.developers.filter(d => d.role !== 'admin' && (d.active !== false || projects.some(p => p.developerId === d.id)));
    const rows = devs.map(d => {
      const mine = projects.filter(p => p.developerId === d.id);
      const fin = mine.map(finishedDays).filter(x => x !== null);
      return {
        d, total: mine.length,
        running: mine.filter(p => OV_ACTIVE.includes(p.status)).length,
        done: mine.filter(p => p.status === 'completed').length,
        avg: fin.length ? fin.reduce((s,x)=>s+x,0) / fin.length : null,
        timed: fin.length
      };
    }).filter(r => r.total > 0);
    rows.sort((a,b)=> b.done - a.done || (a.avg ?? 1e9) - (b.avg ?? 1e9) || a.d.name.localeCompare(b.d.name));
    const maxAvg = Math.max(1, ...rows.map(r => r.avg || 0));
    const timedAvgs = rows.filter(r => r.avg !== null).map(r => r.avg);
    const best = timedAvgs.length > 1 ? Math.min(...timedAvgs) : null;

    const body = rows.length ? rows.map(r => `
      <div class="ov-dev">
        <div class="ov-dev-who">${devAvatar(r.d)}<span class="truncate">${escapeHtml(r.d.name)}</span>
          ${best !== null && r.avg === best ? '<span class="ov-fast" title="Fastest average finish">Fastest</span>' : ''}</div>
        <div class="ov-dev-counts">
          <span data-tip="Completed projects"><b>${r.done}</b> done</span>
          <span data-tip="In progress or testing"><b>${r.running}</b> live</span>
        </div>
        <div class="ov-dev-speed" data-tip="${r.avg === null ? 'No completed project with start &amp; end dates yet' : `Avg <b>${r.avg.toFixed(1)} days</b> per project · based on ${r.timed} finished`}">
          <div class="ov-track"><div class="ov-fill" style="width:${r.avg === null ? 0 : Math.max(4, r.avg / maxAvg * 100)}%;"></div></div>
          <span class="ov-dev-avg">${r.avg === null ? '—' : `${Math.round(r.avg)}d`}</span>
        </div>
      </div>`).join('')
      : `<div class="ov-empty">No projects assigned to developers yet.</div>`;
    return `
      <div class="panel ov-panel">
        <div class="panel-head"><h2>${ICONS.users}Team performance</h2><span class="ov-head-note">Avg. days per finished project · shorter is faster</span></div>
        <div class="panel-body flush ov-scroll">${body}</div>
      </div>`;
  },

  // developer's own view: their recent finished projects
  minePanel(projects, avgDays){
    const fin = projects.filter(p => finishedDays(p) !== null)
      .sort((a,b)=> String(b.endDate).localeCompare(String(a.endDate))).slice(0, 8);
    const max = Math.max(1, ...fin.map(finishedDays));
    const body = fin.length ? fin.map(p => {
      const d = finishedDays(p);
      return `<button type="button" class="ov-row" data-proj="${p.id}">
        <span class="ov-row-name truncate">${escapeHtml(p.name)}</span>
        <span class="ov-track"><span class="ov-fill good" style="width:${Math.max(4, d / max * 100)}%;"></span></span>
        <span class="ov-row-val">${daysLabel(d)}</span>
      </button>`;
    }).join('') : `<div class="ov-empty">No finished projects yet.</div>`;
    return `
      <div class="panel ov-panel">
        <div class="panel-head"><h2>${ICONS.check}My finished projects</h2>${avgDays !== null ? `<span class="ov-head-note">Avg ${Math.round(avgDays)} days</span>` : ''}</div>
        <div class="panel-body flush ov-scroll">${body}</div>
      </div>`;
  },

  // ---------- live projects: days so far vs. the usual finish time ----------
  livePanel(active, avgDays){
    const list = active.map(p => ({ p, pd: projectDays(p) }))
      .sort((a,b)=> (b.pd ? b.pd.days : -1) - (a.pd ? a.pd.days : -1));
    const ref = avgDays ? Math.round(avgDays) : null;
    const body = list.length ? list.map(({ p, pd }) => {
      const dev = getDeveloper(p.developerId);
      const days = pd && !pd.upcoming ? pd.days : null;
      const pct = ref && days !== null ? Math.min(100, days / ref * 100) : 0;
      const over = ref && days !== null && days > ref;
      const tip = days === null ? 'No start date set'
        : ref ? `<b>${daysLabel(days)}</b> ${pd.running ? 'so far' : 'taken'} · team avg ${ref} days${over ? ` · <b>${days - ref} over</b>` : ''}`
        : `<b>${daysLabel(days)}</b> ${pd.running ? 'so far' : 'taken'}`;
      return `<button type="button" class="ov-live" data-proj="${p.id}">
        <div class="ov-live-top">
          <span class="ov-live-name truncate">${escapeHtml(p.name)}</span>
          ${p.status === 'testing' ? '<span class="ov-tag testing">Testing</span>' : ''}
          <span class="ov-live-days ${over ? 'over' : ''}">${days === null ? '—' : daysLabel(days)}</span>
        </div>
        <div class="ov-live-bot">
          <span class="ov-live-dev">${dev ? `${devAvatar(dev)}<span class="truncate">${escapeHtml(dev.name)}</span>` : '<span class="muted">Unassigned</span>'}</span>
          ${ref ? `<span class="ov-track" data-tip="${tip}"><span class="ov-fill ${over ? 'over' : ''}" style="width:${Math.max(days ? 4 : 0, pct)}%;"></span></span>` : ''}
        </div>
      </button>`;
    }).join('') : `<div class="ov-empty">No projects in progress right now.</div>`;
    return `
      <div class="panel ov-panel">
        <div class="panel-head"><h2>${ICONS.clock}In progress now</h2>${ref ? `<span class="ov-head-note">Bar fills at the team avg (${ref} days)</span>` : ''}</div>
        <div class="panel-body flush ov-scroll">${body}</div>
      </div>`;
  },

  // ---------- completions per month, last 6 months ----------
  monthlyPanel(finished){
    const now = new Date();
    const months = [];
    for(let i = 5; i >= 0; i--){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: isoOf(d.getFullYear(), d.getMonth(), 1).slice(0,7), label: MONTH_SHORT[d.getMonth()], year: d.getFullYear(), n: 0, days: 0 });
    }
    finished.forEach(({ p, days }) => {
      const m = months.find(x => x.key === String(p.endDate).slice(0,7));
      if(m){ m.n++; m.days += days; }
    });
    const max = Math.max(1, ...months.map(m => m.n));
    const total = months.reduce((s,m)=>s + m.n, 0);
    return `
      <div class="panel ov-panel">
        <div class="panel-head"><h2>${ICONS.chart}Completed per month</h2><span class="ov-head-note">${total} in the last 6 months</span></div>
        <div class="panel-body">
          <div class="ov-cols">
            ${months.map(m => `<div class="ov-col" data-tip="<b>${m.label} ${m.year}</b> · ${m.n} completed${m.n ? ` · avg ${Math.round(m.days / m.n)} days` : ''}">
              <span class="ov-col-val">${m.n || ''}</span>
              <span class="ov-col-bar ${m.n ? '' : 'zero'}" style="height:${m.n ? Math.max(6, m.n / max * 100) : 0}%;"></span>
              <span class="ov-col-label">${m.label}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>`;
  },

  // tiny shared tooltip for anything with data-tip (content is built from escaped values)
  bindTips(root){
    const tip = document.getElementById('ov-tip');
    if(!tip) return;
    const show = (el, x, y) => {
      tip.innerHTML = el.dataset.tip;
      tip.classList.add('on');
      const r = tip.getBoundingClientRect();
      const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
      const top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    };
    root.querySelectorAll('[data-tip]').forEach(el => {
      el.addEventListener('mousemove', e => { e.stopPropagation(); show(el, e.clientX, e.clientY); });
      el.addEventListener('mouseleave', () => tip.classList.remove('on'));
      el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); });
      el.addEventListener('blur', () => tip.classList.remove('on'));
    });
  }
};
