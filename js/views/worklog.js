// ============================================================
// VIEW: My Daily Work v3
// - One collapsible list: each date expands to show its work
// - Copy button per day
// - Logging allowed only for today or the last working day
// - No hours: work = tasks (bullet lines)
// ============================================================
window.Views = window.Views || {};

Views.worklog = {
  date: null,       // day the panel logs to: today or last working day
  byDate: {},       // date -> entries (last 14 days)
  editingId: null,
  lines: [],
  openDays: null,   // Set of expanded dates

  lastWorkingDay(){
    let d = parseDateOnly(todayIso());
    do { d.setDate(d.getDate() - 1); } while(isOffDay(d));
    return isoOfDate(d);
  },

  editableDates(){
    return [todayIso(), this.lastWorkingDay()];
  },

  async render(main){
    const today = todayIso();
    const lwd = this.lastWorkingDay();
    if(!this.editableDates().includes(this.date)) this.date = today;
    this.editingId = null;
    this.lines = [];
    this.openDays = new Set([today]);
    main.innerHTML = `
      <div class="fill-page">
        <div class="main-head">
          <div><h1>My Daily Work</h1><p class="sub">Log what you worked on, task by task. You can log for today or the last working day only.</p></div>
          <div class="head-actions">
            <div class="seg" id="wl-dayseg">
              <button data-d="${today}" class="${this.date===today?'active':''}">Today</button>
              <button data-d="${lwd}" class="${this.date===lwd?'active':''}">${formatDateFriendly(lwd)}</button>
            </div>
          </div>
        </div>
        <div class="wl-layout fill-flex">
          <div class="panel fill">
            <div class="panel-head">
              <h2>${ICONS.clipboard}My Work · last 14 days</h2>
              <span class="mini-note">Click a date to expand</span>
            </div>
            <div class="panel-body flush" id="wl-days"><div class="skeleton-row"><div class="spinner" style="margin:0 auto;"></div></div></div>
          </div>
          <aside class="panel add-panel" id="wl-addpanel"></aside>
        </div>
      </div>
    `;
    document.querySelectorAll('#wl-dayseg button').forEach(b=>b.addEventListener('click', ()=>{
      this.date = b.dataset.d;
      document.querySelectorAll('#wl-dayseg button').forEach(x=>x.classList.toggle('active', x===b));
      this.openDays.add(this.date);
      this.editingId = null;
      this.lines = [];
      this.renderAddPanel();
      this.renderDays();
    }));
    this.renderAddPanel();
    await this.loadAll();
  },

  async loadAll(){
    const from = addDaysIso(todayIso(), -13);
    const logs = await apiLoadLogs({ from, to: todayIso(), devId: App.me.id });
    this.byDate = {};
    logs.forEach(l=>{
      const k = l.workDate.slice(0,10);
      (this.byDate[k] = this.byDate[k] || []).push(l);
    });
    this.renderDays();
  },

  taskCount(logs){
    return logs.reduce((s,l)=>s + descLines(l.description).length, 0);
  },

  copyTextForDay(d, logs){
    const head = `${formatDateFriendly(d)} (${formatDateLong(d)}) — ${App.me.name}`;
    const blocks = logs.map(l=>{
      const p = l.projectId ? getProject(l.projectId) : null;
      const title = p ? `${p.name} (${p.id})` : (l.otherWork || 'Other work');
      return title + '\n' + descLines(l.description).map(x=>'• ' + x).join('\n');
    });
    return head + '\n' + blocks.join('\n');
  },

  renderDays(){
    const el = document.getElementById('wl-days');
    if(!el) return;
    const editable = this.editableDates();
    let html = '';
    for(let i = 0; i < 14; i++){
      const d = addDaysIso(todayIso(), -i);
      const logs = this.byDate[d] || [];
      const tasks = this.taskCount(logs);
      const off = isOffDay(parseDateOnly(d));
      const open = this.openDays.has(d);
      html += `
        <div class="day-group${open ? ' open' : ''}" data-day="${d}">
          <button type="button" class="day-head" data-toggle="${d}">
            <span class="dh-chev">${ICONS.chevR}</span>
            <span class="dh-date">${formatDateFriendly(d)}</span>
            ${off ? `<span class="offday-chip">Off day</span>` : ''}
            ${logs.length ? `<span class="tasks-chip">${ICONS.check}${tasks} task${tasks===1?'':'s'}</span>` : (off ? '' : `<span class="missing-chip">${ICONS.warn}No update</span>`)}
            <span class="dh-spacer"></span>
            ${logs.length ? `<span class="copy-btn" data-copyday="${d}" title="Copy this day's work" role="button">${ICONS.copy}</span>` : ''}
          </button>
          <div class="day-body">
            ${logs.length
              ? logs.map(l=>this.entryRow(l, editable.includes(d))).join('')
              : `<div class="skeleton-row" style="padding:16px;">${off ? 'Off day — nothing required.' : 'No work was logged on this day.'}</div>`}
          </div>
        </div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-toggle]').forEach(h=>h.addEventListener('click', (e)=>{
      if(e.target.closest('[data-copyday]')) return;
      const d = h.dataset.toggle;
      if(this.openDays.has(d)) this.openDays.delete(d); else this.openDays.add(d);
      h.closest('.day-group').classList.toggle('open');
    }));
    el.querySelectorAll('[data-copyday]').forEach(c=>c.addEventListener('click', (e)=>{
      e.stopPropagation();
      const d = c.dataset.copyday;
      copyText(this.copyTextForDay(d, this.byDate[d] || []), c);
    }));
    el.querySelectorAll('[data-log-action]').forEach(btn=>btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const day = btn.dataset.day;
      const entry = (this.byDate[day] || []).find(l=>l.id===id);
      if(btn.dataset.logAction === 'edit' && entry){
        // logging panel follows the entry's day
        this.date = day;
        document.querySelectorAll('#wl-dayseg button').forEach(x=>x.classList.toggle('active', x.dataset.d === day));
        this.renderAddPanel(entry);
      }
      if(btn.dataset.logAction === 'del') this.confirmDelete(day, id);
    }));
  },

  entryRow(l, canEdit){
    const proj = l.projectId ? getProject(l.projectId) : null;
    const editable = canEdit && l.status === 'pending';
    return `
      <div class="log-entry">
        <div class="log-main">
          <div class="log-top">
            <span class="log-proj ${proj ? '' : 'other'}">${proj ? escapeHtml(proj.name) : escapeHtml(l.otherWork || 'Other work')}</span>
            ${proj ? `<span class="mono muted">${proj.id}</span>` : '<span class="opt-tag" style="margin:0;">Non-project</span>'}
            <span class="approve-chip ${l.status}">${l.status === 'approved' ? ICONS.check : ICONS.clock}${l.status}</span>
          </div>
          <div class="log-desc">${descriptionHtml(l.description)}</div>
        </div>
        <div class="log-actions">
          ${editable ? `<button class="icon-btn" data-log-action="edit" data-id="${l.id}" data-day="${l.workDate.slice(0,10)}" title="Edit">${ICONS.edit}</button>
          <button class="icon-btn danger" data-log-action="del" data-id="${l.id}" data-day="${l.workDate.slice(0,10)}" title="Delete">${ICONS.trash}</button>` : ''}
        </div>
      </div>`;
  },

  myProjects(){
    const mine = App.projects.filter(p => p.developerId === App.me.id);
    return mine.sort((a,b)=>{
      const ac = a.status === 'completed' ? 1 : 0;
      const bc = b.status === 'completed' ? 1 : 0;
      return ac - bc || a.name.localeCompare(b.name);
    });
  },

  // ---------- right panel ----------
  renderAddPanel(editing){
    const el = document.getElementById('wl-addpanel');
    if(!el) return;
    this.editingId = editing ? editing.id : null;
    this.lines = editing ? descLines(editing.description) : [];
    const mine = this.myProjects();
    const selVal = editing ? (editing.projectId || '__other__') : '__other__';
    const extra = (editing && editing.projectId && !mine.some(p=>p.id===editing.projectId)) ? getProject(editing.projectId) : null;

    el.innerHTML = `
      <div class="panel-head">
        <h2>${editing ? ICONS.edit + 'Edit Entry' : ICONS.plus + 'Log Work'}</h2>
        <span class="muted" style="font-size:12px;">${formatDateFriendly(editing ? editing.workDate : this.date)}</span>
      </div>
      <div class="panel-body">
        <div class="field" id="field-wproj" style="margin:0;">
          <label for="we-proj">Project</label>
          <select id="we-proj">
            <option value="__other__" ${selVal==='__other__'?'selected':''}>Other work — name it below</option>
            ${mine.map(p=>`<option value="${p.id}" ${selVal===p.id?'selected':''}>${escapeHtml(p.name)}${p.status==='completed'?' (Completed)':''}</option>`).join('')}
            ${extra ? `<option value="${extra.id}" selected>${escapeHtml(extra.name)} (${extra.id})</option>` : ''}
          </select>
        </div>
        <div class="field" id="field-wother" style="margin:0;display:${selVal==='__other__'?'':'none'};">
          <label for="we-other">Work name <span class="req-star">*</span></label>
          <div class="input-ico-wrap">${ICONS.note}<input type="text" id="we-other" value="${editing ? escapeHtml(editing.otherWork||'') : ''}" placeholder="e.g. R&amp;D, meeting, bug triage" maxlength="80" /></div>
          <p class="error-text"></p>
        </div>
        <div class="field" id="field-wlines" style="margin:0;">
          <label for="we-line">Work done <span class="req-star">*</span></label>
          <div class="line-input">
            <textarea id="we-line" rows="2" placeholder="Write one task, then press +" maxlength="300"></textarea>
            <button type="button" class="btn-square" id="we-addline" title="Add this task to the list">${ICONS.plus}</button>
          </div>
          <div class="work-lines" id="we-lines"></div>
          <p class="hint" id="we-lines-count"></p>
          <p class="error-text"></p>
        </div>
        <div class="add-actions">
          ${editing ? `<button class="btn btn-secondary" id="we-cancel-edit">Cancel</button>` : ''}
          <button class="btn btn-primary" id="we-post">${editing ? ICONS.check + 'Save Changes' : ICONS.send + 'Post Work'}</button>
        </div>
      </div>
    `;

    document.getElementById('we-proj').addEventListener('change', (e)=>{
      document.getElementById('field-wother').style.display = e.target.value === '__other__' ? '' : 'none';
      setFieldError('field-wother','');
    });
    document.getElementById('we-addline').addEventListener('click', ()=>this.addLine());
    document.getElementById('we-line').addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); this.addLine(); }
    });
    document.getElementById('we-post').addEventListener('click', ()=>this.postWork());
    const cancel = document.getElementById('we-cancel-edit');
    if(cancel) cancel.addEventListener('click', ()=>{ this.lines = []; this.renderAddPanel(); });
    this.renderLines();
  },

  addLine(){
    const input = document.getElementById('we-line');
    const text = input.value.trim();
    if(text.length < 3){
      setFieldError('field-wlines', 'Write at least 3 characters, then press +.');
      return;
    }
    this.lines.push(text);
    input.value = '';
    input.focus();
    setFieldError('field-wlines','');
    this.renderLines();
  },

  renderLines(){
    const box = document.getElementById('we-lines');
    if(!box) return;
    box.innerHTML = this.lines.map((l, i)=>`
      <div class="work-line">
        <span class="wl-dot">•</span>
        <span class="wl-text">${escapeHtml(l)}</span>
        <button type="button" class="icon-btn danger" data-rmline="${i}" title="Remove">${ICONS.x}</button>
      </div>`).join('');
    box.querySelectorAll('[data-rmline]').forEach(b=>b.addEventListener('click', ()=>{
      this.lines.splice(Number(b.dataset.rmline), 1);
      this.renderLines();
    }));
    const count = document.getElementById('we-lines-count');
    if(count) count.textContent = this.lines.length
      ? `${this.lines.length} task${this.lines.length===1?'':'s'} — review, then post.`
      : '';
  },

  async postWork(){
    const pendingText = document.getElementById('we-line').value.trim();
    if(pendingText.length >= 3){ this.lines.push(pendingText); document.getElementById('we-line').value = ''; this.renderLines(); }

    const projVal = document.getElementById('we-proj').value;
    const other = document.getElementById('we-other').value.trim();
    let ok = true;
    if(projVal === '__other__' && other.length < 3){ setFieldError('field-wother','Name the work (min 3 characters).'); ok = false; } else setFieldError('field-wother','');
    if(!this.lines.length){ setFieldError('field-wlines','Add at least one task with the + button.'); ok = false; } else setFieldError('field-wlines','');
    if(!this.editableDates().includes(this.date)){
      toast('danger', ICONS.warn, 'You can only log work for today or the last working day.');
      ok = false;
    }
    if(!ok) return;

    const btn = document.getElementById('we-post');
    btn.disabled = true;
    try{
      const payload = {
        projectId: projVal === '__other__' ? null : projVal,
        otherWork: projVal === '__other__' ? other : '',
        description: this.lines.join('\n'),
        hours: 1 // hours are not tracked anymore; kept for schema compatibility
      };
      if(this.editingId){
        await apiUpdateLog(this.editingId, {
          projectId: payload.projectId, otherWork: payload.otherWork, description: payload.description
        });
        toast('success', ICONS.check, 'Entry updated.');
      } else {
        await apiInsertLog(Object.assign({ devId: App.me.id, workDate: this.date }, payload));
        toast('success', ICONS.check, `Posted ${this.lines.length} task${this.lines.length===1?'':'s'}.`);
      }
      this.lines = [];
      this.openDays.add(this.date);
      this.renderAddPanel();
      await this.loadAll();
      updateReviewFlag();
    }catch(err){
      toast('danger', ICONS.warn, `Couldn't save — ${err.message || 'try again.'}`);
      btn.disabled = false;
    }
  },

  confirmDelete(day, logId){
    const l = (this.byDate[day] || []).find(x=>x.id===logId);
    if(!l) return;
    const proj = l.projectId ? getProject(l.projectId) : null;
    confirmModal({
      title: 'Delete Entry?', danger: true, confirmLabel: 'Delete Entry',
      message: `Remove the entry for “${escapeHtml(proj ? proj.name : (l.otherWork || 'Other work'))}”? This can't be undone.`,
      onConfirm: async ()=>{
        try{
          await apiDeleteLog(logId);
          closeModal();
          if(this.editingId === logId){ this.lines = []; this.renderAddPanel(); }
          await this.loadAll();
          toast('success', ICONS.check, 'Entry deleted.');
        }catch(err){
          toast('danger', ICONS.warn, err.message || 'Could not delete.');
        }
      }
    });
  }
};
