// ============================================================
// VIEW: Projects — catalog with status, working days, CRUD (role-gated)
// ============================================================
window.Views = window.Views || {};

// "12 days" (done) · "8 days" + live dot (still running) · "—" (no start date)
function daysChip(p){
  const pd = projectDays(p);
  if(!pd) return '<span class="days-chip none">—</span>';
  if(pd.upcoming) return '<span class="days-chip upcoming" title="Starts in the future">Upcoming</span>';
  const hol = p.holidays ? ` · −${p.holidays} holiday${p.holidays===1?'':'s'}` : '';
  if(pd.running && !['in_progress','testing'].includes(p.status))
    return `<span class="days-chip paused" title="Not active · working days since start (Mon–Sat${hol})">${daysLabel(pd.days)}</span>`;
  return pd.running
    ? `<span class="days-chip running" title="Working days so far (Mon–Sat${hol})"><span class="live-dot"></span>${daysLabel(pd.days)}</span>`
    : `<span class="days-chip done" title="Working days taken (Mon–Sat${hol})">${daysLabel(pd.days)}</span>`;
}

Views.projects = {
  search: '',
  statusFilter: '',
  sort: 'id-desc',

  // Developers only see the projects assigned to them; admins & leaders see everything.
  visible(){
    return App.canReview ? App.projects : App.projects.filter(p => p.developerId === App.me.id);
  },

  async render(main){
    const vis = this.visible();
    main.innerHTML = `
      <div class="fill-page">
      <div class="main-head">
        <div><h1>${App.canReview ? 'Projects' : 'My Projects'}</h1><p class="sub">${App.canReview
          ? `${vis.length} game${vis.length===1?'':'s'} in the catalog`
          : `${vis.length} project${vis.length===1?'':'s'} assigned to you`}</p></div>
        <div class="head-actions">
          ${App.isAdmin ? `<button class="btn btn-primary" id="pj-add">${ICONS.plus}Add Project</button>` : ''}
        </div>
      </div>
      <div class="toolbar">
        <div class="toolbar-field toolbar-search">
          <label class="toolbar-label" for="pj-search">Search</label>
          <div class="search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
            <input type="search" id="pj-search" placeholder="ID, game name, developer…" value="${escapeHtml(this.search)}" />
          </div>
        </div>
        <div class="toolbar-field">
          <label class="toolbar-label" for="pj-status">Status</label>
          <select id="pj-status" class="filter-select">
            <option value="">All statuses</option>
            ${PROJECT_STATUSES.map(([k,l])=>`<option value="${k}" ${this.statusFilter===k?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="table-card" id="pj-table"></div>
      </div>
    `;
    if(App.isAdmin) document.getElementById('pj-add').addEventListener('click', ()=>this.openModal(null));
    document.getElementById('pj-search').addEventListener('input', debounce(e=>{ this.search = e.target.value; this.renderTable(); }, 150));
    document.getElementById('pj-status').addEventListener('change', e=>{ this.statusFilter = e.target.value; this.renderTable(); });
    this.renderTable();
  },

  filtered(){
    let list = [...this.visible()];
    const q = this.search.trim().toLowerCase();
    if(q){
      list = list.filter(p => {
        const dev = getDeveloper(p.developerId);
        return p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
          || (dev && dev.name.toLowerCase().includes(q));
      });
    }
    if(this.statusFilter) list = list.filter(p => p.status === this.statusFilter);
    const dir = this.sort.endsWith('desc') ? -1 : 1;
    const key = this.sort.split('-')[0];
    const daysOf = p => { const d = projectDays(p); return d ? d.days : -1; };
    list.sort((a,b)=>{
      if(key==='id') return a.id.localeCompare(b.id, undefined, {numeric:true}) * dir;
      if(key==='name') return a.name.localeCompare(b.name) * dir;
      if(key==='days') return (daysOf(a) - daysOf(b)) * dir;
      return 0;
    });
    return list;
  },

  arrow(col){
    const [k, d] = this.sort.split('-');
    return k === col ? `<span class="arrow">${d==='asc'?'▲':'▼'}</span>` : '';
  },

  renderTable(){
    const card = document.getElementById('pj-table');
    const list = this.filtered();
    if(!list.length){
      card.innerHTML = `<div class="empty-state">${ICONS.empty}<p>${App.canReview ? 'No projects match.' : (this.search || this.statusFilter ? 'No projects match.' : 'No projects assigned to you yet.')}</p></div>`;
      return;
    }
    const showDevCol = App.canReview; // a developer's list is all their own — the column is noise
    card.innerHTML = `
      <div class="table-scroll"><table>
        <thead><tr>
          <th class="sortable" data-sort="id" style="width:126px;">ID${this.arrow('id')}</th>
          <th class="sortable" data-sort="name">Game${this.arrow('name')}</th>
          <th style="width:128px;">Status</th>
          ${showDevCol ? '<th style="width:150px;">Developer</th>' : ''}
          <th style="width:100px;">Start</th>
          <th style="width:100px;">End</th>
          <th class="sortable" data-sort="days" style="width:120px;">Days${this.arrow('days')}</th>
          <th style="width:110px;"></th>
        </tr></thead>
        <tbody>
          ${list.map(p=>{
            const dev = getDeveloper(p.developerId);
            return `<tr data-id="${p.id}">
              <td><span class="id-badge">${p.id}</span></td>
              <td><span class="game-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span></td>
              <td>${statusChip(p.status)}</td>
              ${showDevCol ? `<td class="dev-cell ${dev?'':'unassigned'}">${dev ? `<span class="dev-name-wrap">${devAvatar(dev)}<span class="truncate">${escapeHtml(dev.name)}</span></span>` : 'Unassigned'}</td>` : ''}
              <td class="date-cell">${p.startDate ? formatDateShort(p.startDate) : '—'}</td>
              <td class="date-cell">${p.endDate ? formatDateShort(p.endDate) : '—'}</td>
              <td>${daysChip(p)}</td>
              <td><div class="actions-cell">
                <button class="icon-btn accent" data-action="view" title="View details">${ICONS.view}</button>
                ${canEditProject(p) ? `<button class="icon-btn" data-action="edit" title="Edit">${ICONS.edit}</button>` : ''}
                ${App.isAdmin ? `<button class="icon-btn danger" data-action="del" title="Delete">${ICONS.trash}</button>` : ''}
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;
    card.querySelectorAll('th.sortable').forEach(th=>th.addEventListener('click', ()=>{
      const col = th.dataset.sort;
      const [k, d] = this.sort.split('-');
      this.sort = k === col ? `${col}-${d==='asc'?'desc':'asc'}` : `${col}-asc`;
      this.renderTable();
    }));
    card.querySelectorAll('tbody tr').forEach(tr=>{
      const id = tr.dataset.id;
      tr.addEventListener('dblclick', ()=>this.openDetail(id));
      tr.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const a = btn.dataset.action;
        if(a==='view') this.openDetail(id);
        if(a==='edit') this.openModal(id);
        if(a==='del') this.confirmDelete(id);
      }));
    });
  },

  async openDetail(id){
    const p = getProject(id);
    if(!p) return;
    const dev = getDeveloper(p.developerId);
    const lead = getDeveloper(p.leadId);
    const pd = projectDays(p);
    const daysSub = pd ? `Mon–Sat${p.holidays ? ` · −${p.holidays} holiday${p.holidays===1?'':'s'}` : ''}${pd.running ? ' · so far' : ''}` : '';
    const html = `
      <div class="modal-header">
        <div class="detail-hero">
          <span class="detail-avatar ${avClass(p.name)}">${escapeHtml(initialsOf(p.name))}</span>
          <div class="detail-hero-text">
            <h2>${escapeHtml(p.name)}</h2>
            <div class="hero-sub">
              <span class="id-copy-wrap">
                <span class="id-badge">${p.id}</span>
                <button type="button" class="copy-btn" data-copy="${p.id}" title="Copy Project ID">${ICONS.copy}</button>
              </span>
              ${statusChip(p.status)}
              ${daysChip(p)}
            </div>
          </div>
        </div>
        <button class="modal-close" aria-label="Close">${ICONS.x}</button>
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          ${detailCard({ icon: ICONS.user, label: 'Developer', value: dev ? dev.name : '', emptyText: 'Unassigned' })}
          ${detailCard({ icon: ICONS.star, label: 'Team Leader', tone: 'amber', value: lead ? lead.name : '', emptyText: 'Not set' })}
          <div class="detail-row-3">
            ${detailCard({ icon: ICONS.cal, label: 'Start Date', value: p.startDate ? formatDateLong(p.startDate) : '', tone: 'teal' })}
            ${detailCard({ icon: ICONS.flag, label: 'End Date', value: p.endDate ? formatDateLong(p.endDate) : '', tone: 'teal' })}
            ${detailCard({ icon: ICONS.clock, label: pd && pd.running ? 'Days so far' : 'Total Days', tone: 'amber',
              value: pd ? `${pd.days} working day${pd.days===1?'':'s'}` : '',
              emptyText: 'Set a start date', sub: daysSub })}
          </div>
          ${detailCard({ span2: true, icon: ICONS.note, label: 'Remarks',
            html: p.remarks ? escapeHtml(p.remarks).replace(/\n/g,'<br>') : '', value: p.remarks || '', emptyText: 'No remarks' })}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="detail-close">Close</button>
        ${canEditProject(p) ? `<button class="btn btn-primary" id="detail-edit">${ICONS.edit}Edit Project</button>` : ''}
      </div>
    `;
    openModalShell(html, { wide: true });
    document.getElementById('detail-close').addEventListener('click', closeModal);
    const editBtn = document.getElementById('detail-edit');
    if(editBtn) editBtn.addEventListener('click', ()=>{ closeModal(); this.openModal(p.id); });
  },

  openModal(projectId){
    const editing = projectId ? getProject(projectId) : null;
    if(editing && !canEditProject(editing)) return;
    // Admins manage — they are not developers, so they can't be assigned work.
    let assignableDevs = App.developers.filter(d=>d.active !== false && d.role !== 'admin');
    // keep the current assignee visible even if inactive/admin, so editing doesn't silently unassign
    if(editing && editing.developerId && !assignableDevs.some(d=>d.id===editing.developerId)){
      const cur = getDeveloper(editing.developerId);
      if(cur) assignableDevs = assignableDevs.concat([cur]);
    }
    assignableDevs.sort((a,b)=>a.name.localeCompare(b.name));
    const leaders = App.developers.filter(d=>d.active !== false && d.role === 'leader').sort((a,b)=>a.name.localeCompare(b.name));
    const devOptions = assignableDevs.map(d=>`<option value="${d.id}" ${editing && editing.developerId===d.id?'selected':''}>${escapeHtml(d.name)}${d.active===false?' (Inactive)':''}${d.role==='admin'?' (Admin)':''}</option>`).join('');
    const leadOptions = leaders.map(d=>`<option value="${d.id}" ${editing && editing.leadId===d.id?'selected':''}>${escapeHtml(d.name)}</option>`).join('');
    // Project IDs follow the studio format: ARGN00231, ARGN00232, …
    const nextId = 'ARGN' + String(Math.max(0, ...App.projects.map(p=>parseInt(String(p.id).replace(/\D/g,''),10)||0)) + 1).padStart(5,'0');

    const html = `
      <div class="modal-header">
        <div>
          <h2>${editing ? 'Edit Project' : 'Add Project'}</h2>
          <p>${editing ? 'Update details, status, or assignments.' : 'New games get the next catalog ID automatically.'}</p>
        </div>
        <button class="modal-close" aria-label="Close">${ICONS.x}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field"><label>Project ID</label><div class="readonly-id">${editing ? editing.id : nextId + '  (assigned on save)'}</div></div>
          <div class="field" id="field-name">
            <label for="pf-name">Game Name <span class="req-star">*</span></label>
            <div class="input-ico-wrap">${ICONS.gamepad}<input type="text" id="pf-name" value="${editing ? escapeHtml(editing.name) : ''}" placeholder="e.g. Bubble Shooter" maxlength="80" autocomplete="off" /></div>
            <p class="error-text"></p>
          </div>
          <div class="field">
            <label for="pf-status">Status</label>
            <select id="pf-status">${PROJECT_STATUSES.map(([k,l])=>`<option value="${k}" ${(editing?editing.status:'in_progress')===k?'selected':''}>${l}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label for="pf-lead">Team Leader ${App.isAdmin ? '' : '<span class="opt-tag">Admin only</span>'}</label>
            <select id="pf-lead" ${App.isAdmin ? '' : 'disabled'}>
              <option value="">No leader</option>
              ${leadOptions}
            </select>
          </div>
          <div class="field" id="field-dev">
            <label for="pf-dev">Developer</label>
            <select id="pf-dev">
              <option value="">Unassigned</option>
              ${devOptions}
            </select>
          </div>
          <div class="field-pair">
            <div class="field" id="field-start">
              <label>Start Date <span class="opt-tag">Optional</span></label>
              ${dpField('dpw-start', 'pf-start', editing ? editing.startDate : '', ICONS.cal)}
              <p class="error-text"></p>
            </div>
            <div class="field" id="field-end">
              <label>End Date <span class="opt-tag">Optional</span></label>
              ${dpField('dpw-end', 'pf-end', editing ? editing.endDate : '', ICONS.flag)}
              <p class="error-text"></p>
            </div>
          </div>
          <div class="field span-2 hol-field" id="field-hol">
            <label for="pf-hol">Holidays <span class="opt-tag">Deducted from working days</span></label>
            <div class="hol-row">
              <div class="hol-stepper">
                <button type="button" class="hol-step" data-step="-1" aria-label="One less holiday">−</button>
                <input type="number" id="pf-hol" min="0" max="365" step="1" inputmode="numeric" value="${editing ? (editing.holidays || 0) : 0}" />
                <button type="button" class="hol-step" data-step="1" aria-label="One more holiday">+</button>
              </div>
              <div id="pf-workdays-hint" class="dp-summary"></div>
            </div>
            <p class="error-text"></p>
          </div>
          <div class="field span-2">
            <label for="pf-remarks">Remarks <span class="opt-tag">Optional</span></label>
            <textarea id="pf-remarks" rows="2" placeholder="Optional notes…" maxlength="500">${editing ? escapeHtml(editing.remarks||'') : ''}</textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="pf-cancel">Cancel</button>
        <button class="btn btn-primary" id="pf-save">${editing ? 'Save Changes' : 'Add Project'}</button>
      </div>
    `;
    openModalShell(html, { form: true });
    document.getElementById('pf-cancel').addEventListener('click', closeModal);
    document.getElementById('pf-save').addEventListener('click', ()=>this.save(projectId, nextId));

    const rangeCfg = {
      getRangeStart: ()=>document.getElementById('pf-start').value,
      getRangeEnd: ()=>document.getElementById('pf-end').value
    };
    DP.attach('dpw-start', Object.assign({ hiddenId:'pf-start', placeholder:'Select date' }, rangeCfg));
    DP.attach('dpw-end', Object.assign({ hiddenId:'pf-end', placeholder:'Select date', getMin: ()=>document.getElementById('pf-start').value }, rangeCfg));

    const updateHint = ()=>{
      const s = document.getElementById('pf-start').value;
      const e2 = document.getElementById('pf-end').value;
      const hol = Math.max(0, parseInt(document.getElementById('pf-hol').value, 10) || 0);
      const hintEl = document.getElementById('pf-workdays-hint');
      if(!s){ hintEl.innerHTML = `<span class="dp-summary-note">Set a start date to see working days.</span>`; return; }
      const days = calculateWorkingDays(s, e2 || todayIso(), hol);
      hintEl.innerHTML = days === null
        ? (e2 ? `<span class="workdays-chip danger">${ICONS.warn}<span>End date must be on or after the start date.</span></span>`
              : `<span class="dp-summary-note">Starts in the future.</span>`)
        : `<span class="workdays-chip">${ICONS.clock}<span>${days} working day${days===1?'':'s'}${e2 ? '' : ' so far'}</span></span><span class="dp-summary-note">Mon–Sat${hol ? ` − ${hol} holiday${hol===1?'':'s'}` : ''}</span>`;
    };
    const holEl = document.getElementById('pf-hol');
    holEl.addEventListener('input', ()=>{ setFieldError('field-hol',''); updateHint(); });
    document.querySelectorAll('.hol-step').forEach(b => b.addEventListener('click', ()=>{
      const v = Math.max(0, Math.min(365, (parseInt(holEl.value, 10) || 0) + Number(b.dataset.step)));
      holEl.value = v;
      setFieldError('field-hol','');
      updateHint();
    }));
    document.getElementById('pf-start').addEventListener('change', ()=>{
      const s = document.getElementById('pf-start').value;
      const endHidden = document.getElementById('pf-end');
      if(s && endHidden.value && endHidden.value < s){
        endHidden.value = '';
        DP.refreshTrigger(document.querySelector('#dpw-end .dp-input'), '', 'Select date');
      }
      setFieldError('field-start',''); setFieldError('field-end','');
      updateHint();
    });
    document.getElementById('pf-end').addEventListener('change', ()=>{ setFieldError('field-start',''); setFieldError('field-end',''); updateHint(); });
    updateHint();
    document.getElementById('pf-name').addEventListener('input', ()=>{
      if(document.getElementById('pf-name').value.trim()) setFieldError('field-name','');
    });
    setTimeout(()=>{ const el = document.getElementById('pf-name'); if(el) el.focus(); }, 30);
  },

  async save(projectId, nextId){
    const name = document.getElementById('pf-name').value.trim();
    const status = document.getElementById('pf-status').value;
    const leadSel = document.getElementById('pf-lead');
    const developerId = document.getElementById('pf-dev').value || null;
    const startDate = document.getElementById('pf-start').value || null;
    const endDate = document.getElementById('pf-end').value || null;
    const remarks = document.getElementById('pf-remarks').value.trim();
    const holRaw = document.getElementById('pf-hol').value.trim();
    const holidays = holRaw === '' ? 0 : Number(holRaw);
    let valid = true;
    if(!Number.isInteger(holidays) || holidays < 0 || holidays > 365){
      setFieldError('field-hol', 'Enter a whole number from 0 to 365.'); valid = false;
    } else if(startDate && endDate && holidays > 0){
      const raw = calculateWorkingDays(startDate, endDate || todayIso(), 0);
      if(raw !== null && holidays > raw){ setFieldError('field-hol', `Can't be more than the ${raw} working days in this range.`); valid = false; }
      else setFieldError('field-hol', '');
    } else setFieldError('field-hol', '');
    if(!name){ setFieldError('field-name', 'Enter a game name.'); valid = false; }
    else if(name.length < 2){ setFieldError('field-name', 'Game name must be at least 2 characters.'); valid = false; }
    else setFieldError('field-name', '');
    if(startDate && endDate && endDate < startDate){
      setFieldError('field-end', 'Must be on or after the start date.'); valid = false;
    } else { setFieldError('field-end', ''); }
    if(!valid) return;

    const btn = document.getElementById('pf-save');
    btn.disabled = true;
    try{
      const fields = { name, status, developerId, startDate, endDate, remarks, holidays };
      if(App.isAdmin) fields.leadId = leadSel.value || null;
      if(projectId){
        await apiUpdateProject(projectId, fields);
        Object.assign(getProject(projectId), fields);
        toast('success', ICONS.check, `Saved “${name}”.`);
      } else {
        const p = await apiInsertProject(Object.assign({ id: nextId, createdAt: new Date().toISOString() }, fields));
        App.projects.push(p);
        toast('success', ICONS.check, `Added ${p.id} — “${name}”.`);
      }
      closeModal();
      this.renderTable();
    }catch(err){
      toast('danger', ICONS.warn, `Couldn't save — ${err.message || 'try again.'}`);
    }finally{
      btn.disabled = false;
    }
  },

  confirmDelete(id){
    const p = getProject(id);
    if(!p) return;
    confirmModal({
      title: 'Delete Project?', danger: true, confirmLabel: 'Delete Project',
      message: `“${escapeHtml(p.name)}” (${p.id}) will be permanently removed. This can't be undone.`,
      onConfirm: async ()=>{
        try{
          await apiDeleteProject(id);
          App.projects = App.projects.filter(x=>x.id!==id);
          closeModal();
          this.renderTable();
          toast('success', ICONS.check, `Deleted ${p.id}.`);
        }catch(err){
          toast('danger', ICONS.warn, `Couldn't delete — ${err.message || 'try again.'}`);
        }
      }
    });
  }
};
