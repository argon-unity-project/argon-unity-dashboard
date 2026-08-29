// ============================================================
// VIEW: Theme — admin-managed site colors (presets + custom)
// Saved in Supabase (app_settings.theme) → applies for everyone.
// ============================================================
window.Views = window.Views || {};

Views.theme = {
  cfg: null,       // working copy being edited
  saved: null,     // last saved copy (for revert on leave)

  async render(main){
    if(!App.isAdmin){ main.innerHTML = ''; return; }
    let stored = null;
    try{ stored = await apiGetSetting('theme'); }
    catch(e){
      main.innerHTML = `<div class="panel"><div class="panel-body"><div class="inline-note danger">${ICONS.warn}
        <span><b>Theme settings table missing.</b> Run the "APP SETTINGS" block at the bottom of supabase-setup.sql in the Supabase SQL editor, then reload.</span></div></div></div>`;
      return;
    }
    this.saved = stored || Object.assign({}, DEFAULT_THEME_CFG);
    this.cfg = JSON.parse(JSON.stringify(this.saved));

    main.innerHTML = `
      <div class="main-head">
        <div><h1>Theme</h1><p class="sub">Site colors for every user — no code changes needed.</p></div>
        <div class="head-actions">
          <button class="btn btn-secondary" id="th-reset">Reset to default</button>
          <button class="btn btn-primary" id="th-save">${ICONS.check}Save theme</button>
        </div>
      </div>
      <div class="panel" style="margin-bottom:16px;">
        <div class="panel-head"><h2>Presets</h2></div>
        <div class="panel-body"><div class="theme-preset-grid" id="th-presets"></div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Custom colors</h2></div>
        <div class="panel-body">
          <div class="theme-custom-grid">
            ${this.modeBlock('light','Light mode')}
            ${this.modeBlock('dark','Dark mode')}
          </div>
          <div class="mini-note" style="margin-top:12px;">Changes preview live on this screen. They only go live for everyone after you press <b>Save theme</b>.</div>
        </div>
      </div>`;

    this.renderPresets();
    this.bindPickers();
    document.getElementById('th-save').addEventListener('click', ()=>this.save());
    document.getElementById('th-reset').addEventListener('click', ()=>this.reset());
  },

  modeBlock(mode, label){
    const fields = [
      ['accent','Primary accent'],
      ['accent2','Secondary accent'],
      ['bg','Background']
    ];
    return `
      <div class="theme-mode-block">
        <div class="divider-label">${label}</div>
        ${fields.map(([k,lab])=>`
          <label class="theme-color-row">
            <span>${lab}</span>
            <input type="color" data-mode="${mode}" data-key="${k}">
          </label>`).join('')}
      </div>`;
  },

  renderPresets(){
    const wrap = document.getElementById('th-presets');
    wrap.innerHTML = THEME_PRESETS.map(p=>`
      <button class="pick-card theme-preset${this.cfg.preset===p.id && !this.cfg.light && !this.cfg.dark ? ' active':''}" data-preset="${p.id}">
        <span class="theme-dots">
          <i style="background:${p.dark.bg}"></i>
          <i style="background:${p.light.accent}"></i>
          <i style="background:${p.light.accent2}"></i>
        </span>
        <span class="pick-name">${p.name}</span>
      </button>`).join('');
    wrap.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click', ()=>{
      this.cfg = { preset: b.dataset.preset };   // drop custom overrides
      this.applyPreview();
      this.renderPresets();
      this.syncPickers();
    }));
  },

  bindPickers(){
    this.syncPickers();
    document.querySelectorAll('#main input[type=color]').forEach(inp=>{
      inp.addEventListener('input', ()=>{
        const { mode, key } = inp.dataset;
        this.cfg[mode] = this.cfg[mode] || {};
        this.cfg[mode][key] = inp.value;
        this.applyPreview();
        this.renderPresets();  // custom edits deselect preset cards
      });
    });
  },

  syncPickers(){
    const colors = resolveThemeColors(this.cfg);
    document.querySelectorAll('#main input[type=color]').forEach(inp=>{
      inp.value = colors[inp.dataset.mode][inp.dataset.key];
    });
  },

  applyPreview(){ applyCustomTheme(this.cfg); },

  async save(){
    const btn = document.getElementById('th-save');
    btn.disabled = true;
    try{
      await apiSaveSetting('theme', this.cfg);
      this.saved = JSON.parse(JSON.stringify(this.cfg));
      try{ localStorage.setItem(KEY_THEME_CFG, JSON.stringify(this.cfg)); }catch(e){}
      toast('success', ICONS.check, 'Theme saved — applies to everyone.');
    }catch(err){
      toast('danger', ICONS.warn, err.message || 'Could not save the theme.');
    }finally{
      btn.disabled = false;
    }
  },

  async reset(){
    this.cfg = Object.assign({}, DEFAULT_THEME_CFG);
    this.applyPreview();
    this.renderPresets();
    this.syncPickers();
    try{
      await apiDeleteSetting('theme');
      try{ localStorage.removeItem(KEY_THEME_CFG); }catch(e){}
      this.saved = Object.assign({}, DEFAULT_THEME_CFG);
      toast('success', ICONS.check, 'Theme reset to default.');
    }catch(err){
      toast('danger', ICONS.warn, err.message || 'Could not reset the theme.');
    }
  }
};
