// ============================================================
// ARGON DASHBOARD — app shell: session guard, nav, routing
// ============================================================

const App = {
  me: null,          // signed-in user's roster row
  developers: [],
  projects: [],
  section: null,
  get isAdmin(){ return this.me && this.me.role === 'admin'; },
  get isLeader(){ return this.me && this.me.role === 'leader'; },
  get canReview(){ return this.isAdmin || this.isLeader; },
  // projects this user leads
  get myLeadProjects(){ return this.projects.filter(p => p.leadId === (this.me && this.me.id)); },
  // developers whose daily work this user reviews.
  // Admins are managers, not developers — they're never in anyone's review list.
  get myTeamDevIds(){
    if(this.isAdmin) return this.developers.filter(d => d.role !== 'admin').map(d => d.id);
    const ids = new Set();
    this.myLeadProjects.forEach(p => { if(p.developerId) ids.add(p.developerId); });
    if(this.me) ids.add(this.me.id);
    return [...ids].filter(id => { const d = getDeveloper(id); return d && d.role !== 'admin'; });
  }
};

function getDeveloper(id){ return App.developers.find(d => d.id === id) || null; }
function getProject(id){ return App.projects.find(p => p.id === id) || null; }
function projectCountFor(devId){ return App.projects.filter(p => p.developerId === devId).length; }
function canEditProject(p){
  return App.isAdmin || (App.isLeader && p.leadId === App.me.id);
}
function devAvatar(dev, cls){
  const inactive = dev && dev.active === false;
  return `<span class="${cls || 'avatar-sm'} ${avClass(dev ? dev.name : '?')}${inactive ? ' inactive' : ''}">${escapeHtml(initialsOf(dev ? dev.name : '?'))}</span>`;
}

// ---------- navigation ----------
const SECTIONS = [
  { key: 'overview', label: 'Overview', icon: 'home',      show: () => true },
  { key: 'projects', label: 'Projects', icon: 'layers',    show: () => true },
  { key: 'team',     label: 'Team',     icon: 'users',     show: () => App.canReview },
  { key: 'worklog',  label: 'My Daily Work', icon: 'clipboard', show: () => !App.isAdmin },
  { key: 'review',   label: 'Review',   icon: 'check',     show: () => App.canReview },
  { key: 'reports',  label: 'Reports',  icon: 'chart',     show: () => App.canReview }
];

function renderNav(){
  const nav = document.getElementById('nav');
  nav.innerHTML = SECTIONS.filter(s => s.show()).map(s => `
    <button class="nav-item${App.section === s.key ? ' active' : ''}" data-section="${s.key}">
      ${ICONS[s.icon]}<span class="nav-label">${s.label}</span>
      ${s.key === 'review' ? '<span class="nav-flag" id="nav-review-flag" style="display:none;"></span>' : ''}
    </button>`).join('')
    + `<button class="nav-item" id="nav-logout">${ICONS.logout}<span class="nav-label">Sign Out</span></button>`;
  nav.querySelectorAll('[data-section]').forEach(b => b.addEventListener('click', () => go(b.dataset.section)));
  document.getElementById('nav-logout').addEventListener('click', async ()=>{
    await apiSignOut();
    window.location.href = 'index.html';
  });
}

function renderSidebarUser(){
  const el = document.getElementById('sidebar-user');
  const me = App.me;
  el.classList.add('clickable');
  el.title = 'Edit my profile';
  el.innerHTML = `
    <span class="u-avatar ${avClass(me.name)}">${escapeHtml(initialsOf(me.name))}</span>
    <div class="u-info">
      <div class="u-name">${escapeHtml(me.name)}</div>
      <div class="u-role">${escapeHtml(ROLE_LABELS[me.role] || me.role)}</div>
    </div>`;
  el.onclick = ()=>Views.team.openModal(me.id);
}

function go(section){
  App.section = section;
  try{ localStorage.setItem('argon:section', section); }catch(e){}
  renderNav();
  const main = document.getElementById('main');
  main.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
  DP.close();
  const view = Views[section];
  if(view) view.render(main).catch(err => {
    main.innerHTML = `<div class="panel"><div class="panel-body"><div class="inline-note danger">${ICONS.warn}<span>${escapeHtml(err.message || 'Something went wrong.')}</span></div></div></div>`;
  });
}

async function refreshCore(){
  const [devs, projects] = await Promise.all([apiLoadDevelopers(), apiLoadProjects()]);
  App.developers = devs;
  App.projects = projects;
}

// Badge on the Review nav item: number of team devs with no entry today (working days only)
async function updateReviewFlag(){
  if(!App.canReview) return;
  try{
    const today = todayIso();
    if(isOffDay(parseDateOnly(today))) return; // off day: no flags
    const logs = await apiLoadLogs({ from: today, to: today });
    const logged = new Set(logs.map(l => l.devId));
    const missing = App.developers.filter(d =>
      d.active !== false && d.userId && App.myTeamDevIds.includes(d.id) && !logged.has(d.id)
    ).length;
    const flag = document.getElementById('nav-review-flag');
    if(flag && missing > 0){ flag.style.display = ''; flag.textContent = missing; }
  }catch(e){ /* non-critical */ }
}

// ---------- boot ----------
(async function boot(){
  initTheme();
  const bootEl = document.getElementById('boot-loading');
  if(!SUPABASE_CONFIGURED || !window.supabase){
    bootEl.innerHTML = '<div class="inline-note danger" style="max-width:420px;">' + ICONS.warn + '<span>Supabase is not configured. Open js/config.js.</span></div>';
    return;
  }
  try{
    const session = await apiGetSession();
    if(!session){ window.location.href = 'index.html'; return; }
    const me = await apiMyProfile();
    if(!me || me.mustChangePassword || me.active === false){
      window.location.href = 'index.html';
      return;
    }
    App.me = me;
    await refreshCore();
    bootEl.style.display = 'none';
    document.getElementById('shell').style.display = '';
    renderSidebarUser();
    // date-picker popups are fixed-position: close them when the content scrolls
    document.getElementById('main').addEventListener('scroll', ()=>{ DP.close(); CS.close(); });
    CS.init();
    let start = 'overview';
    try{
      const stored = localStorage.getItem('argon:section');
      if(stored && SECTIONS.some(s => s.key === stored && s.show())) start = stored;
    }catch(e){}
    go(start);
    updateReviewFlag();
  }catch(err){
    bootEl.innerHTML = '<div class="inline-note danger" style="max-width:460px;">' + ICONS.warn + '<span>' + escapeHtml(err.message || 'Could not load the dashboard.') + '</span></div>';
  }
})();
