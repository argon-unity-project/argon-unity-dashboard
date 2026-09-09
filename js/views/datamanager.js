// ============================================================
// VIEW: App Data Manager (nav label "ADM") — Firebase webapp
// registry + live Remote Config browser (admin-only). Each card
// stores one webapp's public client config (apiKey, projectId,
// appId, ...); viewing one swaps the whole page for a detail
// screen with its Remote Config, with a Back button to return.
// ============================================================
window.Views = window.Views || {};

const FIREBASE_SDK_VERSION = '10.14.1';
let _fbSdkPromise = null;

function loadFirebaseSdk(){
  if(window.firebase && window.firebase.remoteConfig) return Promise.resolve();
  if(_fbSdkPromise) return _fbSdkPromise;
  function loadScript(src){
    return new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = src;
      s.onload = ()=>resolve();
      s.onerror = ()=>reject(new Error('Could not load the Firebase SDK — check your network connection.'));
      document.head.appendChild(s);
    });
  }
  _fbSdkPromise = loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`)
    .then(()=>loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-remote-config-compat.js`))
    .catch(err=>{ _fbSdkPromise = null; throw err; });
  return _fbSdkPromise;
}

// Accepts raw JSON, or a pasted `const firebaseConfig = { ... };` snippet
// straight from the Firebase Console SDK setup screen.
function parseFirebaseConfigInput(raw){
  let text = String(raw || '').trim();
  if(!text) throw new Error('Paste the Firebase config first.');
  text = text.replace(/^\s*(export\s+default\s+|export\s+const\s+\w+\s*=\s*|const\s+\w+\s*=\s*|let\s+\w+\s*=\s*|var\s+\w+\s*=\s*)/, '');
  text = text.replace(/;\s*$/, '');
  let obj;
  try{
    obj = JSON.parse(text);
  }catch(e1){
    try{
      obj = new Function('"use strict";return (' + text + ')')();
    }catch(e2){
      throw new Error('Could not parse that as a Firebase config object. Paste it exactly as shown in Firebase Console.');
    }
  }
  if(!obj || typeof obj !== 'object' || Array.isArray(obj)){
    throw new Error('That does not look like a Firebase config object.');
  }
  const required = ['apiKey', 'projectId', 'appId'];
  const missing = required.filter(k => !obj[k]);
  if(missing.length){
    throw new Error(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  }
  return obj;
}

// Connects to one Firebase project with just its public web config and
// returns the Remote Config parameters as that webapp's users would see
// them (default-condition values). Always re-initializes the underlying
// Firebase app so edited configs and manual refreshes pick up changes.
async function fetchRemoteConfigFor(webapp){
  await loadFirebaseSdk();
  const appName = 'fbw_' + webapp.id;
  const existing = firebase.apps.find(a => a.name === appName);
  if(existing){
    try{ await existing.delete(); }catch(e){ /* ignore */ }
  }
  const app = firebase.initializeApp(webapp.config, appName);
  const rc = firebase.remoteConfig(app);
  rc.settings.minimumFetchIntervalMillis = 0;
  rc.settings.fetchTimeoutMillis = 30000;
  await rc.fetchAndActivate();
  const all = rc.getAll();
  return Object.keys(all).sort((a, b) => a.localeCompare(b)).map(key => {
    const v = all[key];
    let source = 'default';
    try{ source = v.getSource(); }catch(e){ /* ignore */ }
    return { key, value: v.asString(), source };
  });
}

// A Remote Config value is treated as "structured" only when it parses to
// a JSON object or array — a plain string/number that happens to be valid
// JSON (e.g. "42") still displays as a single value, not as JSON.
function tryParseStructured(value){
  if(typeof value !== 'string') return null;
  const trimmed = value.trim();
  if(!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try{
    const parsed = JSON.parse(trimmed);
    if(parsed && typeof parsed === 'object') return parsed;
  }catch(e){ /* not JSON */ }
  return null;
}

function truncatePreview(str, max){
  max = max || 90;
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

Views.datamanager = {
  webapps: [],
  search: '',
  screen: 'list',   // 'list' | 'detail'
  activeId: null,
  _rcRows: null,
  _rcSearch: '',

  async render(main){
    if(!App.isAdmin){ main.innerHTML = ''; return; }
    this.screen = 'list';
    this.activeId = null;
    main.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><span>Loading…</span></div>';
    try{
      this.webapps = await apiLoadFirebaseWebapps();
    }catch(err){
      main.innerHTML = `<div class="panel"><div class="panel-body"><div class="inline-note danger">${ICONS.warn}
        <span><b>ADM table missing.</b> Run the "FIREBASE WEBAPPS" block at the bottom of supabase-setup.sql in the Supabase SQL editor, then reload.</span></div></div></div>`;
      return;
    }
    this.renderList();
  },

  // Cards, newest-added first.
  filteredSorted(){
    let list = [...this.webapps];
    const q = this.search.trim().toLowerCase();
    if(q){
      list = list.filter(w => w.name.toLowerCase().includes(q) ||
        String((w.config || {}).projectId || '').toLowerCase().includes(q));
    }
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return list;
  },

  renderList(){
    const main = document.getElementById('main');
    if(!main) return;
    main.innerHTML = `
      <div class="fill-page">
        <div class="main-head">
          <div><h1>App Data Manager</h1><p class="sub">${this.webapps.length} app${this.webapps.length === 1 ? '' : 's'} connected</p></div>
          <div class="head-actions">
            <button class="btn btn-primary" id="dm-add">${ICONS.plus}Add App</button>
          </div>
        </div>
        <div class="toolbar">
          <div class="toolbar-field toolbar-search">
            <label class="toolbar-label" for="dm-search">Search</label>
            <div class="search-wrap">${ICONS.search}
              <input type="search" id="dm-search" placeholder="Project name or Firebase project ID…" value="${escapeHtml(this.search)}" />
            </div>
          </div>
        </div>
        <div class="dm-grid-wrap fill-flex" id="dm-grid"></div>
      </div>`;
    document.getElementById('dm-add').addEventListener('click', () => this.openModal(null));
    document.getElementById('dm-search').addEventListener('input', debounce(e => {
      this.search = e.target.value;
      this.renderGrid();
    }, 150));
    this.renderGrid();
  },

  renderGrid(){
    const wrap = document.getElementById('dm-grid');
    if(!wrap) return;
    const list = this.filteredSorted();
    if(!list.length){
      wrap.innerHTML = `<div class="empty-state">${ICONS.empty}
        <p>${this.webapps.length ? 'No apps match your search.' : 'No apps added yet — add one to browse its Remote Config.'}</p>
        ${!this.webapps.length ? `<button class="btn btn-primary btn-sm" id="dm-empty-add">${ICONS.plus}Add App</button>` : ''}</div>`;
      const emptyBtn = document.getElementById('dm-empty-add');
      if(emptyBtn) emptyBtn.addEventListener('click', () => this.openModal(null));
      return;
    }
    wrap.innerHTML = `<div class="dm-card-grid">${list.map(w => {
      const pid = (w.config && w.config.projectId) || '—';
      return `<div class="dm-card" data-id="${w.id}">
        <div class="dm-card-main">
          <span class="dm-card-name" title="${escapeHtml(w.name)}">${escapeHtml(w.name)}</span>
          <span class="dm-card-pid mono" title="${escapeHtml(pid)}">${escapeHtml(pid)}</span>
        </div>
        <div class="dm-card-actions">
          <button class="icon-btn accent" data-action="view" title="View Remote Config">${ICONS.view}</button>
          <button class="icon-btn" data-action="edit" title="Edit">${ICONS.edit}</button>
          <button class="icon-btn danger" data-action="del" title="Delete">${ICONS.trash}</button>
        </div>
      </div>`;
    }).join('')}</div>`;
    wrap.querySelectorAll('.dm-card').forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('dblclick', () => this.openDetail(id));
      card.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const a = btn.dataset.action;
        if(a === 'view') this.openDetail(id);
        if(a === 'edit') this.openModal(id);
        if(a === 'del') this.confirmDelete(id);
      }));
    });
  },

  openModal(webappId){
    const editing = webappId ? this.webapps.find(w => w.id === webappId) : null;
    const nextId = 'FBW' + String(Math.max(0, ...this.webapps.map(w => parseInt(String(w.id).replace(/\D/g, ''), 10) || 0)) + 1).padStart(3, '0');
    const configText = editing ? JSON.stringify(editing.config, null, 2) : '';
    const html = `
      <div class="modal-header">
        <div>
          <h2>${editing ? 'Edit App' : 'Add App'}</h2>
          <p>${editing ? 'Update the name or paste a fresh config.' : 'Paste the Firebase config for one app.'}</p>
        </div>
        <button class="modal-close" aria-label="Close">${ICONS.x}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field" id="field-name">
            <label for="dm-name">Project Name <span class="req-star">*</span></label>
            <input type="text" id="dm-name" value="${editing ? escapeHtml(editing.name) : ''}" placeholder="e.g. Sheep Doku — Web" maxlength="80" autocomplete="off" />
            <p class="error-text"></p>
          </div>
          <div class="field span-2" id="field-config">
            <label for="dm-config">Firebase Config <span class="req-star">*</span></label>
            <textarea id="dm-config" rows="10" placeholder="Paste the firebaseConfig object — e.g.&#10;{&#10;  &quot;apiKey&quot;: &quot;...&quot;,&#10;  &quot;authDomain&quot;: &quot;your-app.firebaseapp.com&quot;,&#10;  &quot;projectId&quot;: &quot;your-app&quot;,&#10;  &quot;appId&quot;: &quot;1:...:web:...&quot;&#10;}" style="font-family:var(--font-mono);font-size:12.5px;">${editing ? escapeHtml(configText) : ''}</textarea>
            <p class="hint">From Firebase Console → Project settings → General → Your apps → SDK setup and configuration. The whole "const firebaseConfig = { ... }" snippet works too.</p>
            <p class="error-text"></p>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="dm-cancel">Cancel</button>
        <button class="btn btn-primary" id="dm-save">${editing ? 'Save Changes' : 'Add App'}</button>
      </div>`;
    openModalShell(html, { form: true });
    document.getElementById('dm-cancel').addEventListener('click', closeModal);
    document.getElementById('dm-save').addEventListener('click', () => this.save(webappId, nextId));
    document.getElementById('dm-name').addEventListener('input', () => {
      if(document.getElementById('dm-name').value.trim()) setFieldError('field-name', '');
    });
    document.getElementById('dm-config').addEventListener('input', () => setFieldError('field-config', ''));
    setTimeout(() => { const el = document.getElementById('dm-name'); if(el) el.focus(); }, 30);
  },

  async save(webappId, nextId){
    const name = document.getElementById('dm-name').value.trim();
    const rawConfig = document.getElementById('dm-config').value;
    let valid = true;
    if(!name){ setFieldError('field-name', 'Enter a project name.'); valid = false; }
    else setFieldError('field-name', '');
    let config = null;
    try{
      config = parseFirebaseConfigInput(rawConfig);
      setFieldError('field-config', '');
    }catch(err){
      setFieldError('field-config', err.message);
      valid = false;
    }
    if(!valid) return;

    const btn = document.getElementById('dm-save');
    btn.disabled = true;
    try{
      if(webappId){
        await apiUpdateFirebaseWebapp(webappId, { name, config });
        const row = this.webapps.find(w => w.id === webappId);
        if(row){ row.name = name; row.config = config; }
        toast('success', ICONS.check, `Saved "${name}".`);
      } else {
        const w = await apiInsertFirebaseWebapp({ id: nextId, name, config, createdBy: App.me ? App.me.id : null });
        this.webapps.push(w);
        toast('success', ICONS.check, `Added "${name}".`);
      }
      closeModal();
      this.renderGrid();
    }catch(err){
      toast('danger', ICONS.warn, `Couldn't save — ${err.message || 'try again.'}`);
    }finally{
      btn.disabled = false;
    }
  },

  confirmDelete(id){
    const w = this.webapps.find(x => x.id === id);
    if(!w) return;
    confirmModal({
      title: 'Delete App?', danger: true, confirmLabel: 'Delete App',
      message: `“${escapeHtml(w.name)}” will be removed from ADM. This can't be undone.`,
      onConfirm: async () => {
        try{
          await apiDeleteFirebaseWebapp(id);
          this.webapps = this.webapps.filter(x => x.id !== id);
          closeModal();
          this.renderGrid();
          toast('success', ICONS.check, `Deleted "${w.name}".`);
        }catch(err){
          toast('danger', ICONS.warn, `Couldn't delete — ${err.message || 'try again.'}`);
        }
      }
    });
  },

  // ---------- detail screen: replaces the list page, Back returns to it ----------
  openDetail(id){
    const w = this.webapps.find(x => x.id === id);
    if(!w) return;
    this.screen = 'detail';
    this.activeId = id;
    this._rcRows = null;
    this._rcSearch = '';
    this.renderDetail(w);
  },

  goBack(){
    this.screen = 'list';
    this.activeId = null;
    this.renderList();
  },

  renderDetail(w){
    const main = document.getElementById('main');
    if(!main) return;
    const pid = (w.config && w.config.projectId) || w.id;
    main.innerHTML = `
      <div class="fill-page">
        <div class="main-head">
          <div class="dm-detail-head">
            <button class="btn btn-secondary btn-sm" id="dm-back">${ICONS.chevL}Back</button>
            <h1>${escapeHtml(w.name)} <span class="dm-detail-id">(${escapeHtml(pid)})</span></h1>
          </div>
          <div class="head-actions">
            <button class="btn btn-secondary" id="rc-refresh-btn">${ICONS.refresh}Refresh</button>
          </div>
        </div>
        <div class="toolbar">
          <div class="toolbar-field toolbar-search">
            <label class="toolbar-label" for="rc-search">Search</label>
            <div class="search-wrap">${ICONS.search}
              <input type="search" id="rc-search" placeholder="Filter parameters…" />
            </div>
          </div>
          <span class="mini-note dm-rc-count" id="rc-count"></span>
        </div>
        <div class="table-card fill-flex" id="rc-table-wrap"></div>
      </div>`;
    document.getElementById('dm-back').addEventListener('click', () => this.goBack());
    document.getElementById('rc-refresh-btn').addEventListener('click', () => this.loadRemoteConfig(w));
    document.getElementById('rc-search').addEventListener('input', debounce(e => {
      this._rcSearch = e.target.value;
      this.renderRcRows();
    }, 120));
    this.loadRemoteConfig(w);
  },

  async loadRemoteConfig(w){
    const wrap = document.getElementById('rc-table-wrap');
    if(!wrap) return;
    const countEl = document.getElementById('rc-count');
    if(countEl) countEl.textContent = '';
    wrap.innerHTML = `<div class="loading-wrap" style="padding:46px 20px;"><div class="spinner"></div><span>Connecting to ${escapeHtml((w.config && w.config.projectId) || 'Firebase')}…</span></div>`;
    try{
      this._rcRows = await fetchRemoteConfigFor(w);
      this.renderRcRows();
    }catch(err){
      this._rcRows = null;
      const wrap2 = document.getElementById('rc-table-wrap');
      if(wrap2){
        wrap2.innerHTML = `<div class="inline-note danger">${ICONS.warn}<span><b>Couldn't load Remote Config.</b> ${escapeHtml(err.message || 'Check the config and that Remote Config is enabled for this Firebase project.')}</span></div>`;
      }
    }
  },

  renderRcRows(){
    const wrap = document.getElementById('rc-table-wrap');
    if(!wrap || !this._rcRows) return;
    const q = (this._rcSearch || '').trim().toLowerCase();
    const rows = q ? this._rcRows.filter(r => r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)) : this._rcRows;
    const countEl = document.getElementById('rc-count');
    if(countEl) countEl.textContent = this._rcRows.length ? `${rows.length} of ${this._rcRows.length} parameter${this._rcRows.length === 1 ? '' : 's'}` : '';
    if(!this._rcRows.length){
      wrap.innerHTML = `<div class="empty-state">${ICONS.empty}<p>This Firebase project has no Remote Config parameters yet.</p></div>`;
      return;
    }
    if(!rows.length){
      wrap.innerHTML = `<div class="empty-state">${ICONS.empty}<p>No parameters match “${escapeHtml(this._rcSearch)}”.</p></div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="table-scroll"><table>
        <thead><tr>
          <th style="width:240px;">Parameter</th>
          <th>Value</th>
          <th style="width:48px;"></th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const parsed = tryParseStructured(r.value);
            const isJson = parsed !== null;
            const preview = isJson ? JSON.stringify(parsed) : r.value;
            const copyVal = isJson ? JSON.stringify(parsed, null, 2) : r.value;
            return `<tr data-key="${escapeHtml(r.key)}">
              <td><span class="mono">${escapeHtml(r.key)}</span></td>
              <td>
                <span class="rc-value" title="Double-click to view the full value">
                  ${isJson ? '<span class="rc-json-tag">JSON</span>' : ''}${escapeHtml(truncatePreview(preview, 90))}
                </span>
              </td>
              <td><button type="button" class="copy-btn" data-copy="${escapeHtml(copyVal)}" title="Copy value">${ICONS.copy}</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;
    // This table lives on a full page now (not inside a modal), so the
    // modal-overlay's delegated copy-button handler doesn't reach it here —
    // bind copy directly. Double-click a row to see the full value.
    wrap.querySelectorAll('tbody tr').forEach(tr => {
      const key = tr.dataset.key;
      tr.addEventListener('dblclick', () => {
        const row = this._rcRows.find(x => x.key === key);
        if(row) this.openValueDetail(row);
      });
    });
    wrap.querySelectorAll('.copy-btn[data-copy]').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        copyText(b.getAttribute('data-copy'), b);
      });
    });
  },

  openValueDetail(row){
    const parsed = tryParseStructured(row.value);
    const isJson = parsed !== null;
    const pretty = isJson ? JSON.stringify(parsed, null, 2) : row.value;
    const html = `
      <div class="modal-header">
        <div>
          <h2>${escapeHtml(row.key)}</h2>
          <p class="mono" style="display:flex;align-items:center;gap:6px;">
            ${isJson ? '<span class="rc-json-tag">JSON</span>' : 'Value'}
            <button type="button" class="copy-btn" data-copy="${escapeHtml(pretty)}" title="Copy value">${ICONS.copy}</button>
          </p>
        </div>
        <button class="modal-close" aria-label="Close">${ICONS.x}</button>
      </div>
      <div class="modal-body">
        <pre class="status-code${isJson ? '' : ' wrap'}">${escapeHtml(pretty)}</pre>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="rcv-close">Close</button>
      </div>`;
    openModalShell(html, { wide: true });
    document.getElementById('rcv-close').addEventListener('click', closeModal);
  }
};
