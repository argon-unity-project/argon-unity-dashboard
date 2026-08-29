// ============================================================
// VIEW: Overview — greeting, task-based stats, activity
// ============================================================
window.Views = window.Views || {};

function logTasks(logs){
  return logs.reduce((s,l)=>s + descLines(l.description).length, 0);
}

Views.overview = {
  async render(main){
    const me = App.me;
    const today = todayIso();
    const offToday = isOffDay(parseDateOnly(today));
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    if(App.isAdmin) return this.renderAdmin(main, { today, offToday, greet });

    const weekStart = addDaysIso(today, -6);
    const [myWeekLogs, recentLogs] = await Promise.all([
      apiLoadLogs({ from: weekStart, to: today, devId: me.id }),
      apiLoadLogs({ limit: 12 })
    ]);
    let missingCount = null;
    if(App.canReview && !offToday){
      const todayTeamLogs = await apiLoadLogs({ from: today, to: today });
      const logged = new Set(todayTeamLogs.map(l => l.devId));
      missingCount = App.developers.filter(d =>
        d.active !== false && d.userId && App.myTeamDevIds.includes(d.id) && !logged.has(d.id)
      ).length;
    }

    const myToday = myWeekLogs.filter(l => l.workDate.slice(0,10) === today);
    const myProjects = App.projects.filter(p => p.developerId === me.id && p.status !== 'completed');
    const activeProjects = App.projects.filter(p => p.status === 'in_progress').length;

    main.innerHTML = `
      <div class="fill-page">
      <div class="main-head">
        <div>
          <h1>${greet}, ${escapeHtml(me.name.split(' ')[0])} 👋</h1>
          <p class="sub">${formatDateFriendly(today)} · ${offToday ? 'Off day — enjoy!' : 'Working day'}</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary" id="ov-log-btn">${ICONS.plus}Log Today's Work</button>
        </div>
      </div>

      ${!offToday && myToday.length === 0 ? `
        <div class="panel" style="flex:0 0 auto;"><div class="panel-body" style="padding:12px 16px;">
          <div class="inline-note warn">${ICONS.warn}<span><b>You haven't logged today's work yet.</b> Add what you worked on before the day ends.</span></div>
        </div></div>` : ''}

      <div class="stat-grid">
        <div class="stat-card"><span class="stat-ico">${ICONS.check}</span><div class="stat-body"><div class="stat-val">${logTasks(myToday)}</div><div class="stat-label">My tasks today</div></div></div>
        <div class="stat-card"><span class="stat-ico teal">${ICONS.chart}</span><div class="stat-body"><div class="stat-val">${logTasks(myWeekLogs)}</div><div class="stat-label">Tasks · last 7 days</div></div></div>
        <div class="stat-card"><span class="stat-ico amber">${ICONS.layers}</span><div class="stat-body"><div class="stat-val">${myProjects.length}</div><div class="stat-label">My open projects</div></div></div>
        <div class="stat-card"><span class="stat-ico green">${ICONS.gamepad}</span><div class="stat-body"><div class="stat-val">${activeProjects}</div><div class="stat-label">Projects in progress</div></div></div>
        ${missingCount !== null ? `
        <div class="stat-card"><span class="stat-ico ${missingCount ? 'red' : 'green'}">${missingCount ? ICONS.warn : ICONS.check}</span><div class="stat-body"><div class="stat-val">${missingCount}</div><div class="stat-label">Missing updates today</div></div></div>` : ''}
      </div>

      ${this.statusPanel()}
      ${this.activityPanel(recentLogs)}
      </div>
    `;
    document.getElementById('ov-log-btn').addEventListener('click', ()=>go('worklog'));
  },

  // Admin overview — management focus
  async renderAdmin(main, ctx){
    const { today, offToday, greet } = ctx;
    const [todayLogs, recentLogs] = await Promise.all([
      apiLoadLogs({ from: today, to: today }),
      apiLoadLogs({ limit: 12 })
    ]);
    const teamIds = App.myTeamDevIds;
    const teamLogs = todayLogs.filter(l => teamIds.includes(l.devId));
    const pending = teamLogs.filter(l => l.status === 'pending').length;
    const teamDevs = App.developers.filter(d => d.active !== false && d.role !== 'admin');
    const withAccount = teamDevs.filter(d => d.userId);
    const logged = new Set(teamLogs.map(l => l.devId));
    const updated = withAccount.filter(d => logged.has(d.id)).length;
    const missing = offToday ? 0 : withAccount.length - updated;
    const activeProjects = App.projects.filter(p => p.status === 'in_progress').length;

    main.innerHTML = `
      <div class="fill-page">
      <div class="main-head">
        <div>
          <h1>${greet}, ${escapeHtml(App.me.name.split(' ')[0])} 👋</h1>
          <p class="sub">${formatDateFriendly(today)} · ${offToday ? 'Off day' : 'Working day'} · ${teamDevs.length} developer${teamDevs.length===1?'':'s'} on the team</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary" id="ov-review-btn">${ICONS.check}Review Today's Updates</button>
        </div>
      </div>

      ${!offToday && missing > 0 ? `
        <div class="panel" style="flex:0 0 auto;"><div class="panel-body" style="padding:12px 16px;">
          <div class="inline-note warn">${ICONS.warn}<span><b>${missing} developer${missing===1?' hasn’t' : 's haven’t'} logged today's work yet.</b> Check the Review section.</span></div>
        </div></div>` : ''}

      <div class="stat-grid">
        <div class="stat-card"><span class="stat-ico teal">${ICONS.check}</span><div class="stat-body"><div class="stat-val">${logTasks(teamLogs)}</div><div class="stat-label">Team tasks today</div></div></div>
        <div class="stat-card"><span class="stat-ico green">${ICONS.users}</span><div class="stat-body"><div class="stat-val">${updated}/${withAccount.length}</div><div class="stat-label">Updated today</div></div></div>
        <div class="stat-card"><span class="stat-ico ${missing ? 'red' : 'green'}">${missing ? ICONS.warn : ICONS.check}</span><div class="stat-body"><div class="stat-val">${missing}</div><div class="stat-label">Missing updates</div></div></div>
        <div class="stat-card"><span class="stat-ico amber">${ICONS.clipboard}</span><div class="stat-body"><div class="stat-val">${pending}</div><div class="stat-label">Pending approval</div></div></div>
        <div class="stat-card"><span class="stat-ico">${ICONS.gamepad}</span><div class="stat-body"><div class="stat-val">${activeProjects}</div><div class="stat-label">Projects in progress</div></div></div>
      </div>

      ${this.statusPanel()}
      ${this.activityPanel(recentLogs)}
      </div>
    `;
    document.getElementById('ov-review-btn').addEventListener('click', ()=>go('review'));
  },

  statusPanel(){
    const statusCounts = {};
    PROJECT_STATUSES.forEach(([k]) => statusCounts[k] = 0);
    App.projects.forEach(p => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });
    return `
      <div class="panel" style="flex:0 0 auto;">
        <div class="panel-head"><h2>${ICONS.layers}Projects by status</h2></div>
        <div class="panel-body"><div class="chip-row">
          ${PROJECT_STATUSES.map(([k, label]) => `<span class="proj-status ${k}"><span class="dot"></span>${label}: <b style="margin-left:3px;">${statusCounts[k] || 0}</b></span>`).join('')}
        </div></div>
      </div>`;
  },

  activityPanel(recentLogs){
    return `
      <div class="panel fill">
        <div class="panel-head"><h2>${ICONS.clipboard}${App.canReview ? 'Recent team activity' : 'My recent activity'}</h2></div>
        <div class="panel-body flush" id="ov-activity">
          ${recentLogs.length ? recentLogs.map(l => Views.overview.activityRow(l)).join('') : '<div class="skeleton-row">No work has been logged yet.</div>'}
        </div>
      </div>`;
  },

  activityRow(l){
    const dev = getDeveloper(l.devId);
    const proj = l.projectId ? getProject(l.projectId) : null;
    const tasks = descLines(l.description).length;
    return `
      <div class="log-entry">
        <div class="log-main">
          <div class="log-top">
            ${devAvatar(dev)}
            <span class="log-proj">${escapeHtml(dev ? dev.name : l.devId)}</span>
            <span class="muted" style="font-size:12px;">→</span>
            <span class="log-proj ${proj ? '' : 'other'}">${proj ? escapeHtml(proj.name) : escapeHtml(l.otherWork || 'Other work')}</span>
            <span class="tasks-chip">${tasks} task${tasks===1?'':'s'}</span>
            <span class="approve-chip ${l.status}">${l.status === 'approved' ? ICONS.check : ICONS.clock}${l.status}</span>
          </div>
          <div class="log-desc">${descriptionHtml(l.description)}</div>
          <div class="log-meta"><span>${formatDateFriendly(l.workDate)}</span>${proj ? `<span class="mono">${proj.id}</span>` : ''}</div>
        </div>
      </div>`;
  }
};
