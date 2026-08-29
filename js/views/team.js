// ============================================================
// VIEW: Team — roster, roles, login accounts (admin manages)
// ============================================================
window.Views = window.Views || {};

Views.team = {
  search: '',

  async render(main){
    main.innerHTML = `
      <div class="fill-page">
      <div class="main-head">
        <div><h1>Team</h1><p class="sub">${App.developers.length} member${App.developers.length===1?'':'s'} on the roster</p></div>
        <div class="head-actions">
          ${App.isAdmin ? `<button class="btn btn-primary" id="tm-add">${ICONS.plus}Add Developer</button>` : ''}
        </div>
      </div>
      <div class="toolbar">
        <div class="toolbar-field toolbar-search">
          <label class="toolbar-label" for="tm-search">Search</label>
          <div class="search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
            <input type="search" id="tm-search" placeholder="Name, email, role…" value="${escapeHtml(this.search)}" />
          </div>
        </div>
      </div>
      <div class="table-card" id="tm-table"></div>
      </div>
    `;
    if(App.isAdmin) document.getElementById('tm-add').addEventListener('click', ()=>this.openModal(null));
    document.getElementById('tm-search').addEventListener('input', debounce(e=>{ this.search = e.target.value; this.renderTable(); }, 150));
    this.renderTable();
  },

  filtered(){
    const q = this.search.trim().toLowerCase();
    let list = [...App.developers].sort((a,b)=>a.name.localeCompare(b.name));
    if(q){
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
        || (d.email||'').toLowerCase().includes(q) || (ROLE_LABELS[d.role]||'').toLowerCase().includes(q));
    }
    return list;
  },

  renderTable(){
    const card = document.getElementById('tm-table');
    const list = this.filtered();
    if(!list.length){
      card.innerHTML = `<div class="empty-state">${ICONS.empty}<p>No team members match.</p></div>`;
      return;
    }
    card.innerHTML = `
      <div class="table-scroll"><table>
        <thead><tr>
          <th style="width:90px;">ID</th>
          <th>Name</th>
          <th style="width:130px;">Role</th>
          <th>Email</th>
          <th style="width:110px;">Login</th>
          <th style="width:90px;">Projects</th>
          <th style="width:96px;">Status</th>
          <th style="width:${App.isAdmin ? 150 : 60}px;"></th>
        </tr></thead>
        <tbody>
          ${list.map(d=>{
            const count = projectCountFor(d.id);
            const isMe = App.me && d.id === App.me.id;
            return `<tr data-id="${d.id}" class="${d.active===false?'is-inactive':''}">
              <td><span class="id-badge">${d.id}</span></td>
              <td><span class="dev-name-wrap">${devAvatar(d)}<span class="truncate" style="font-weight:600;">${escapeHtml(d.name)}${isMe ? ' <span class="muted" style="font-weight:400;">(you)</span>' : ''}</span></span></td>
              <td>${roleBadge(d.role)}</td>
              <td class="dev-cell ${d.email?'':'unassigned'}"><span class="truncate">${d.email ? escapeHtml(d.email) : 'No email'}</span></td>
              <td>${d.userId
                ? `<span class="status-inline active"><span class="dot"></span>Active</span>`
                : `<span class="status-inline inactive" title="No login account yet"><span class="dot"></span>None</span>`}</td>
              <td><span class="count-badge">${count}</span></td>
              <td>${d.active===false ? '<span class="status-inline inactive"><span class="dot"></span>Inactive</span>' : '<span class="status-inline active"><span class="dot"></span>Active</span>'}</td>
              <td><div class="actions-cell">
                <button class="icon-btn accent" data-action="view" title="View details">${ICONS.view}</button>
                ${(App.isAdmin || isMe) ? `<button class="icon-btn" data-action="edit" title="Edit">${ICONS.edit}</button>` : ''}
                ${App.isAdmin ? `<button class="icon-btn warn" data-action="toggle" title="${d.active===false?'Reactivate':'Mark inactive'}">${ICONS.power}</button>` : ''}
                ${App.isAdmin ? `<button class="icon-btn danger" data-action="del" title="Delete">${ICONS.trash}</button>` : ''}
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;
    card.querySelectorAll('tbody tr').forEach(tr=>{
      const id = tr.dataset.id;
      tr.addEventListener('dblclick', ()=>this.openDetail(id));
      tr.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const a = btn.dataset.action;
        if(a==='view') this.openDetail(id);
        if(a==='edit') this.openModal(id);
        if(a==='toggle') this.toggleActive(id);
        if(a==='del') this.confirmDelete(id);
      }));
    });
  },

  openDetail(id){
    const d = getDeveloper(id);
    if(!d) return;
    const count = projectCountFor(d.id);
    const isActive = d.active !== false;
    const html = `
      <div class="modal-header">
        <div class="detail-hero">
          <span class="detail-avatar ${avClass(d.name)}${isActive ? '' : ' inactive'}">${escapeHtml(initialsOf(d.name))}</span>
          <div class="detail-hero-text">
            <h2>${escapeHtml(d.name)}</h2>
            <div class="hero-sub">
              <span class="id-badge">${d.id}</span>
              ${roleBadge(d.role)}
              <span class="status-inline ${isActive ? 'active' : 'inactive'}"><span class="dot"></span>${isActive ? 'Active' : 'Inactive'}</span>
              <span class="hero-count" title="Projects assigned">${ICONS.briefcase}${count}</span>
            </div>
          </div>
        </div>
        <button class="modal-close" aria-label="Close">${ICONS.x}</button>
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          ${detailCard({ span2: true, icon: ICONS.mail, label: 'Login Email', tone: 'teal', value: d.email || '', copy: d.email || '',
            sub: d.userId ? 'Login account active' : 'No login account yet' })}
          ${detailCard({ icon: ICONS.mail, label: 'Gmail', value: d.gmail || '', copy: d.gmail || '' })}
          ${detailCard({ icon: ICONS.chat, label: 'Discord', value: d.discordUsername || '', copy: d.discordUsername || '' })}
          ${detailCard({ span2: true, icon: ICONS.phone, label: 'Contact Details', tone: 'green', value: d.contactDetails || '', copy: d.contactDetails || '' })}
        </div>
        ${App.isAdmin && d.userId ? `<div class="mini-note" style="margin-top:10px;">Forgot password? Use “Send reset email” below (needs email configured in Supabase) or set a new password from the Supabase dashboard → Authentication → Users.</div>` : ''}
      </div>
      <div class="modal-footer">
        ${App.isAdmin && d.userId && d.email ? `<button class="btn btn-ghost" id="dd-reset">${ICONS.key}Send reset email</button>` : ''}
        <button class="btn btn-secondary" id="detail-close">Close</button>
        ${(App.isAdmin || (App.me && App.me.id === d.id)) ? `<button class="btn btn-primary" id="detail-edit">${ICONS.edit}Edit</button>` : ''}
      </div>
    `;
    openModalShell(html, { wide: true });
    document.getElementById('detail-close').addEventListener('click', closeModal);
    const eb = document.getElementById('detail-edit');
    if(eb) eb.addEventListener('click', ()=>{ closeModal(); this.openModal(d.id); });
    const rb = document.getElementById('dd-reset');
    if(rb) rb.addEventListener('click', async ()=>{
      rb.disabled = true;
      try{
        await apiSendPasswordReset(d.email);
        toast('success', ICONS.check, `Reset link sent to ${d.email}.`);
      }catch(err){
        toast('danger', ICONS.warn, err.message || 'Could not send the reset email.');
        rb.disabled = false;
      }
    });
  },

  openModal(devId){
    const editing = devId ? getDeveloper(devId) : null;
    const isSelf = editing && App.me && editing.id === App.me.id;
    if(editing && !App.isAdmin && !isSelf) return;
    const adminEdit = App.isAdmin;
    const needsAccount = !editing || !editing.userId;

    const html = `
      <div class="modal-header">
        <div>
          <h2>${editing ? (isSelf && !adminEdit ? 'My Profile' : 'Edit Developer') : 'Add Developer'}</h2>
          <p>${editing ? `${editing.id} · ${projectCountFor(editing.id)} project(s) assigned` : 'Creates a roster entry and a login account with a temporary password.'}</p>
        </div>
        <button class="modal-close" aria-label="Close">${ICONS.x}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field${adminEdit ? '' : ' span-2'}" id="field-devname">
            <label for="df-name">Full Name <span class="req-star">*</span></label>
            <div class="input-ico-wrap">${ICONS.user}<input type="text" id="df-name" value="${editing ? escapeHtml(editing.name) : ''}" placeholder="e.g. Priya Shah" maxlength="60" autocomplete="off" ${adminEdit || !editing ? '' : 'disabled'} /></div>
            <p class="error-text"></p>
          </div>
          ${adminEdit ? `
          <div class="field" id="field-role">
            <label for="df-role">Role</label>
            <select id="df-role" ${isSelf ? 'disabled title="You cannot change your own role."' : ''}>
              <option value="developer" ${(!editing || editing.role==='developer')?'selected':''}>Developer</option>
              <option value="leader" ${editing && editing.role==='leader'?'selected':''}>Team Leader</option>
              <option value="admin" ${editing && editing.role==='admin'?'selected':''}>Admin</option>
            </select>
            <p class="hint">Admins manage &amp; review only — they can't be assigned projects or log daily work.</p>
          </div>` : ''}
          ${adminEdit && needsAccount ? `
          <div class="divider-label span-2">Login account</div>
          <div class="field" id="field-email">
            <label for="df-email">Login Email <span class="req-star">*</span></label>
            <div class="input-ico-wrap">${ICONS.mail}<input type="email" id="df-email" value="${editing ? escapeHtml(editing.email||'') : ''}" placeholder="dev@example.com" maxlength="120" autocomplete="off" /></div>
            <p class="error-text"></p>
          </div>
          <div class="field" id="field-temppass">
            <label for="df-temppass">Temporary Password <span class="req-star">*</span></label>
            <div class="input-ico-wrap">${ICONS.key}<input type="text" id="df-temppass" value="" placeholder="Min 8 chars — share it with them" maxlength="60" autocomplete="off" /></div>
            <p class="error-text"></p>
          </div>
          ${editing ? '' : `<div class="field span-2" style="margin-top:-4px;"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500;"><input type="checkbox" id="df-skip-account" style="width:auto;" /> Add to roster only (create the login later) — otherwise they'll set their own password on first sign-in</label></div>`}
          <div class="divider-label span-2">Contact info</div>` : ''}
          <div class="field" id="field-gmail">
            <label for="df-gmail">Gmail <span class="opt-tag">Optional</span></label>
            <div class="input-ico-wrap">${ICONS.mail}<input type="email" id="df-gmail" value="${editing ? escapeHtml(editing.gmail||'') : ''}" placeholder="name@gmail.com" maxlength="120" autocomplete="off" /></div>
            <p class="error-text"></p>
          </div>
          <div class="field" id="field-discord">
            <label for="df-discord">Discord Username <span class="opt-tag">Optional</span></label>
            <div class="input-ico-wrap">${ICONS.chat}<input type="text" id="df-discord" value="${editing ? escapeHtml(editing.discordUsername||'') : ''}" placeholder="e.g. priya.dev" maxlength="32" autocomplete="off" /></div>
            <p class="error-text"></p>
          </div>
          <div class="field span-2" id="field-contact">
            <label for="df-contact">Contact Details <span class="opt-tag">Optional</span></label>
            <div class="input-ico-wrap">${ICONS.phone}<input type="text" id="df-contact" value="${editing ? escapeHtml(editing.contactDetails||'') : ''}" placeholder="Phone number or other contact info" maxlength="120" autocomplete="off" /></div>
            <p class="error-text"></p>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="df-cancel">Cancel</button>
        <button class="btn btn-primary" id="df-save">${editing ? 'Save Changes' : 'Add Developer'}</button>
      </div>
    `;
    openModalShell(html, { form: true });
    document.getElementById('df-cancel').addEventListener('click', closeModal);
    document.getElementById('df-save').addEventListener('click', ()=>this.save(devId));
    const skip = document.getElementById('df-skip-account');
    if(skip) skip.addEventListener('change', ()=>{
      const dis = skip.checked;
      ['df-email','df-temppass'].forEach(i=>{ const el = document.getElementById(i); if(el) el.disabled = dis; });
      if(dis){ setFieldError('field-email',''); setFieldError('field-temppass',''); }
    });
    setTimeout(()=>{ const el = document.getElementById('df-name'); if(el && !el.disabled) el.focus(); }, 30);
  },

  validate(devId){
    const editing = devId ? getDeveloper(devId) : null;
    const adminEdit = App.isAdmin;
    const needsAccount = adminEdit && (!editing || !editing.userId);
    const skipEl = document.getElementById('df-skip-account');
    const skipAccount = skipEl ? skipEl.checked : false;
    let ok = true;

    const nameEl = document.getElementById('df-name');
    const name = nameEl.value.trim();
    if(!nameEl.disabled){
      if(!name){ setFieldError('field-devname','Enter a name.'); ok = false; }
      else if(name.length < 2){ setFieldError('field-devname','Name must be at least 2 characters.'); ok = false; }
      else {
        const dupe = App.developers.find(d=>d.name.toLowerCase()===name.toLowerCase() && d.id!==devId);
        if(dupe){ setFieldError('field-devname', `${dupe.name} is already on the roster.`); ok = false; }
        else setFieldError('field-devname','');
      }
    }
    if(needsAccount && !skipAccount){
      const email = document.getElementById('df-email').value.trim();
      const pass = document.getElementById('df-temppass').value;
      if(!isValidEmail(email)){ setFieldError('field-email','Enter a valid email address.'); ok = false; }
      else {
        const dupeE = App.developers.find(d=>(d.email||'').toLowerCase()===email.toLowerCase() && d.id!==devId);
        if(dupeE){ setFieldError('field-email', `${dupeE.name} already uses this email.`); ok = false; }
        else setFieldError('field-email','');
      }
      if(pass.length < 8){ setFieldError('field-temppass','Temporary password must be at least 8 characters.'); ok = false; }
      else setFieldError('field-temppass','');
    }
    const gmail = document.getElementById('df-gmail').value.trim();
    if(gmail && !isValidEmail(gmail)){ setFieldError('field-gmail','Enter a valid email address.'); ok = false; } else setFieldError('field-gmail','');
    const discord = document.getElementById('df-discord').value.trim();
    if(discord && !isValidDiscord(discord)){ setFieldError('field-discord','2–32 characters: letters, numbers, underscores and periods only.'); ok = false; } else setFieldError('field-discord','');
    const contact = document.getElementById('df-contact').value.trim();
    if(contact && !isValidContact(contact)){ setFieldError('field-contact','Enter a valid phone number (7–15 digits) or contact info.'); ok = false; } else setFieldError('field-contact','');
    return ok;
  },

  async save(devId){
    if(!this.validate(devId)) return;
    const editing = devId ? getDeveloper(devId) : null;
    const adminEdit = App.isAdmin;
    const skipEl = document.getElementById('df-skip-account');
    const skipAccount = skipEl ? skipEl.checked : false;
    const btn = document.getElementById('df-save');
    btn.disabled = true;
    try{
      const name = document.getElementById('df-name').value.trim();
      const gmail = document.getElementById('df-gmail').value.trim();
      const discordUsername = document.getElementById('df-discord').value.trim();
      const contactDetails = document.getElementById('df-contact').value.trim();
      const roleEl = document.getElementById('df-role');
      const role = roleEl ? roleEl.value : (editing ? editing.role : 'developer');

      if(editing){
        const fields = { gmail, discordUsername, contactDetails };
        if(adminEdit){
          fields.name = name;
          if(!(App.me && App.me.id === editing.id)) fields.role = role;
        }
        // create a login for an existing roster member
        if(adminEdit && !editing.userId && !skipAccount){
          const emailEl = document.getElementById('df-email');
          if(emailEl && emailEl.value.trim()){
            const email = emailEl.value.trim();
            const pass = document.getElementById('df-temppass').value;
            const user = await apiCreateAuthAccount(email, pass);
            fields.userId = user.id;
            fields.email = email;
            fields.mustChangePassword = true;
          }
        }
        await apiUpdateDeveloper(editing.id, fields);
        Object.assign(editing, fields);
        toast('success', ICONS.check, `Updated ${editing.name}.`);
      } else {
        const newId = await apiNextDevId();
        let userId = null, email = '';
        if(!skipAccount){
          email = document.getElementById('df-email').value.trim();
          const pass = document.getElementById('df-temppass').value;
          const user = await apiCreateAuthAccount(email, pass);
          userId = user.id;
        }
        const d = await apiInsertDeveloper({
          id: newId, name, active: true, gmail, discordUsername, contactDetails,
          userId, email, role, mustChangePassword: !!userId
        });
        App.developers.push(d);
        toast('success', ICONS.check, userId
          ? `Added ${name}. Share the temporary password with them.`
          : `Added ${name} to the roster (no login yet).`);
      }
      closeModal();
      this.renderTable();
    }catch(err){
      toast('danger', ICONS.warn, `Couldn't save — ${err.message || 'try again.'}`);
    }finally{
      btn.disabled = false;
    }
  },

  toggleActive(id){
    const d = getDeveloper(id);
    if(!d || !App.isAdmin) return;
    const makeInactive = d.active !== false;
    confirmModal({
      title: makeInactive ? 'Mark Inactive?' : 'Reactivate?',
      danger: makeInactive,
      confirmLabel: makeInactive ? 'Mark Inactive' : 'Reactivate',
      message: makeInactive
        ? `${escapeHtml(d.name)} won't be able to sign in and won't appear in assignment lists. Their history stays.`
        : `${escapeHtml(d.name)} will be able to sign in and receive assignments again.`,
      onConfirm: async ()=>{
        try{
          await apiUpdateDeveloper(id, { active: !makeInactive });
          d.active = !makeInactive;
          closeModal();
          this.renderTable();
          toast('success', ICONS.check, `${d.name} is now ${d.active ? 'active' : 'inactive'}.`);
        }catch(err){
          toast('danger', ICONS.warn, err.message || 'Could not update.');
        }
      }
    });
  },

  confirmDelete(id){
    const d = getDeveloper(id);
    if(!d || !App.isAdmin) return;
    const count = projectCountFor(id);
    if(count > 0){
      confirmModal({
        title: "Can't Delete Yet", confirmLabel: 'OK',
        message: `${escapeHtml(d.name)} still has ${count} project${count===1?'':'s'} assigned. Reassign those first. Tip: mark them inactive instead to keep history.`,
        onConfirm: closeModal
      });
      return;
    }
    confirmModal({
      title: 'Delete Developer?', danger: true, confirmLabel: 'Delete Developer',
      message: `${escapeHtml(d.name)} and all their work-log entries will be permanently removed. Their login account (if any) should also be deleted in Supabase → Authentication → Users. Consider marking them inactive instead.`,
      onConfirm: async ()=>{
        try{
          await apiDeleteDeveloper(id);
          App.developers = App.developers.filter(x=>x.id!==id);
          closeModal();
          this.renderTable();
          toast('success', ICONS.check, `Removed ${d.name}.`);
        }catch(err){
          toast('danger', ICONS.warn, err.message || 'Could not delete.');
        }
      }
    });
  }
};
