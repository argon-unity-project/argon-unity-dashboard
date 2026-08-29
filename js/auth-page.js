// ============================================================
// ARGON DASHBOARD — login page logic
// Flows: sign in · first-time admin setup · forgot password ·
//        forced password change (temp password / recovery link)
// ============================================================

const authPanel = document.getElementById('auth-panel');
let isRecovery = false;

function showLoginError(msg){
  const box = document.getElementById('login-error');
  document.getElementById('login-error-text').textContent = msg;
  box.classList.add('show');
}
function clearLoginError(){
  document.getElementById('login-error').classList.remove('show');
}
function pwToggleHtml(inputId){
  return `<button type="button" class="pw-toggle" data-pw="${inputId}" title="Show password" aria-label="Show password">${ICONS.eye}</button>`;
}
function bindPwToggles(){
  authPanel.querySelectorAll('.pw-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const input = document.getElementById(btn.dataset.pw);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
    });
  });
}
function setBusy(btnId, busy, busyText, normalText){
  const b = document.getElementById(btnId);
  if(!b) return;
  b.disabled = busy;
  b.textContent = busy ? busyText : normalText;
}

// ---------------- sign-in panel ----------------
const KEY_REMEMBER = 'argon:rememberEmail';
function renderSignIn(){
  clearLoginError();
  authPanel.innerHTML = `
    <div class="field" id="field-email">
      <div class="input-ico-wrap">${ICONS.mail}<input type="email" id="li-email" placeholder="Email ID" autocomplete="username" /></div>
      <p class="error-text"></p>
    </div>
    <div class="field" id="field-pass">
      <div class="input-ico-wrap pw-wrap">${ICONS.key}<input type="password" id="li-pass" placeholder="Password" autocomplete="current-password" />${pwToggleHtml('li-pass')}</div>
      <p class="error-text"></p>
    </div>
    <div class="remember-row">
      <label class="chk"><input type="checkbox" id="li-remember" /><span class="chk-box">${ICONS.check}</span>Remember me</label>
      <button type="button" class="login-link" id="lnk-forgot">Forgot Password?</button>
    </div>
    <button class="btn btn-primary btn-block" id="btn-signin">LOGIN</button>
  `;
  bindPwToggles();
  // prefill the remembered email
  let saved = null;
  try{ saved = localStorage.getItem(KEY_REMEMBER); }catch(e){}
  if(saved){
    document.getElementById('li-email').value = saved;
    document.getElementById('li-remember').checked = true;
  }
  document.getElementById('lnk-forgot').addEventListener('click', renderForgot);
  const doSignIn = async ()=>{
    clearLoginError();
    const email = document.getElementById('li-email').value.trim();
    const pass = document.getElementById('li-pass').value;
    let ok = true;
    if(!email || !isValidEmail(email)){ setFieldError('field-email', 'Enter a valid email address.'); ok = false; }
    else setFieldError('field-email', '');
    if(!pass){ setFieldError('field-pass', 'Enter your password.'); ok = false; }
    else setFieldError('field-pass', '');
    if(!ok) return;
    setBusy('btn-signin', true, 'Signing in…', 'LOGIN');
    try{
      await apiSignIn(email, pass);
      try{
        if(document.getElementById('li-remember').checked) localStorage.setItem(KEY_REMEMBER, email);
        else localStorage.removeItem(KEY_REMEMBER);
      }catch(e){}
      await afterAuth();
    }catch(err){
      showLoginError(/invalid login credentials/i.test(err.message || '')
        ? 'Wrong email or password. Ask your admin if you don’t have an account yet.'
        : (err.message || 'Sign-in failed.'));
      setBusy('btn-signin', false, '', 'LOGIN');
    }
  };
  document.getElementById('btn-signin').addEventListener('click', doSignIn);
  authPanel.querySelectorAll('input').forEach(i=>i.addEventListener('keydown', e=>{ if(e.key==='Enter') doSignIn(); }));
  setTimeout(()=>{ const el = document.getElementById(saved ? 'li-pass' : 'li-email'); if(el) el.focus(); }, 40);
}

// ---------------- first-time admin setup ----------------
function renderBootstrap(){
  clearLoginError();
  authPanel.innerHTML = `
    <div class="inline-note">${ICONS.info}<span><b>First-time setup.</b> No admin account exists yet. Create the admin account for this dashboard — this option disappears once an admin exists.</span></div>
    <div class="field" id="field-bname">
      <label for="bs-name">Your Name <span class="req-star">*</span></label>
      <div class="input-ico-wrap">${ICONS.user}<input type="text" id="bs-name" placeholder="e.g. Jatin" maxlength="60" /></div>
      <p class="error-text"></p>
    </div>
    <div class="field" id="field-bemail">
      <label for="bs-email">Admin Email <span class="req-star">*</span></label>
      <div class="input-ico-wrap">${ICONS.mail}<input type="email" id="bs-email" placeholder="you@example.com" autocomplete="username" /></div>
      <p class="error-text"></p>
    </div>
    <div class="field" id="field-bpass">
      <label for="bs-pass">Password <span class="req-star">*</span></label>
      <div class="pw-wrap"><input type="password" id="bs-pass" placeholder="Min 8 characters" autocomplete="new-password" />${pwToggleHtml('bs-pass')}</div>
      <p class="error-text"></p>
    </div>
    <button class="btn btn-primary btn-block" id="btn-bootstrap">Create Admin Account</button>
    <p class="login-foot"><button type="button" class="login-link" id="lnk-back-signin">Already have an account? Sign in</button></p>
  `;
  bindPwToggles();
  document.getElementById('lnk-back-signin').addEventListener('click', renderSignIn);
  document.getElementById('btn-bootstrap').addEventListener('click', async ()=>{
    clearLoginError();
    const name = document.getElementById('bs-name').value.trim();
    const email = document.getElementById('bs-email').value.trim();
    const pass = document.getElementById('bs-pass').value;
    let ok = true;
    if(!name || name.length < 2){ setFieldError('field-bname', 'Enter your name.'); ok = false; } else setFieldError('field-bname', '');
    if(!isValidEmail(email)){ setFieldError('field-bemail', 'Enter a valid email address.'); ok = false; } else setFieldError('field-bemail', '');
    if(pass.length < 8){ setFieldError('field-bpass', 'Password must be at least 8 characters.'); ok = false; } else setFieldError('field-bpass', '');
    if(!ok) return;
    setBusy('btn-bootstrap', true, 'Creating…', 'Create Admin Account');
    try{
      // sign up on the primary client (signs us in when Confirm email is OFF)
      const data = await apiSignUpPrimary(email, pass);
      if(!data.session){
        // account exists already, or confirm-email is ON — try normal sign-in
        try{ await apiSignIn(email, pass); }
        catch(e){ throw new Error('Could not sign in after signup. In Supabase: Authentication → Sign In / Providers → turn "Confirm email" OFF, then try again.'); }
      }
      await apiBootstrapAdmin(name);
      toast('success', ICONS.check, 'Admin account created.');
      await afterAuth();
    }catch(err){
      showLoginError(err.message || 'Setup failed.');
      setBusy('btn-bootstrap', false, '', 'Create Admin Account');
    }
  });
  setTimeout(()=>document.getElementById('bs-name').focus(), 40);
}

// ---------------- forgot password ----------------
function renderForgot(){
  clearLoginError();
  authPanel.innerHTML = `
    <p class="login-note">Enter your account email — if password reset emails are configured in Supabase, you'll receive a reset link. Otherwise ask your admin to help.</p>
    <div class="field" id="field-femail">
      <label for="fp-email">Email</label>
      <div class="input-ico-wrap">${ICONS.mail}<input type="email" id="fp-email" placeholder="you@example.com" /></div>
      <p class="error-text"></p>
    </div>
    <button class="btn btn-primary btn-block" id="btn-forgot">Send Reset Link</button>
    <p class="login-foot"><button type="button" class="login-link" id="lnk-back2">Back to sign in</button></p>
  `;
  document.getElementById('lnk-back2').addEventListener('click', renderSignIn);
  document.getElementById('btn-forgot').addEventListener('click', async ()=>{
    const email = document.getElementById('fp-email').value.trim();
    if(!isValidEmail(email)){ setFieldError('field-femail', 'Enter a valid email address.'); return; }
    setFieldError('field-femail', '');
    setBusy('btn-forgot', true, 'Sending…', 'Send Reset Link');
    try{
      await apiSendPasswordReset(email);
      toast('success', ICONS.check, 'Reset link sent — check your inbox.');
      renderSignIn();
    }catch(err){
      showLoginError(err.message || 'Could not send the reset email.');
      setBusy('btn-forgot', false, '', 'Send Reset Link');
    }
  });
  setTimeout(()=>document.getElementById('fp-email').focus(), 40);
}

// ---------------- forced password change ----------------
function renderChangePassword(profile){
  clearLoginError();
  authPanel.innerHTML = `
    <div class="inline-note warn">${ICONS.key}<span>${isRecovery
      ? 'Set a new password for your account.'
      : `Welcome${profile ? ', <b>' + escapeHtml(profile.name) + '</b>' : ''}! You signed in with a temporary password — set your own to continue.`}</span></div>
    <div class="field" id="field-np1">
      <label for="np-1">New Password <span class="req-star">*</span></label>
      <div class="pw-wrap"><input type="password" id="np-1" placeholder="Min 8 characters" autocomplete="new-password" />${pwToggleHtml('np-1')}</div>
      <p class="error-text"></p>
    </div>
    <div class="field" id="field-np2">
      <label for="np-2">Confirm New Password <span class="req-star">*</span></label>
      <div class="pw-wrap"><input type="password" id="np-2" placeholder="Repeat the password" autocomplete="new-password" />${pwToggleHtml('np-2')}</div>
      <p class="error-text"></p>
    </div>
    <button class="btn btn-primary btn-block" id="btn-setpass">Set Password &amp; Continue</button>
  `;
  bindPwToggles();
  document.getElementById('btn-setpass').addEventListener('click', async ()=>{
    clearLoginError();
    const p1 = document.getElementById('np-1').value;
    const p2 = document.getElementById('np-2').value;
    let ok = true;
    if(p1.length < 8){ setFieldError('field-np1', 'Password must be at least 8 characters.'); ok = false; } else setFieldError('field-np1', '');
    if(p1 !== p2){ setFieldError('field-np2', 'Passwords do not match.'); ok = false; } else setFieldError('field-np2', '');
    if(!ok) return;
    setBusy('btn-setpass', true, 'Saving…', 'Set Password & Continue');
    try{
      await apiChangeMyPassword(p1);
      if(profile && profile.mustChangePassword){
        await apiUpdateDeveloper(profile.id, { mustChangePassword: false });
      }
      isRecovery = false;
      toast('success', ICONS.check, 'Password updated.');
      window.location.href = 'app.html';
    }catch(err){
      showLoginError(err.message || 'Could not update the password.');
      setBusy('btn-setpass', false, '', 'Set Password & Continue');
    }
  });
  setTimeout(()=>document.getElementById('np-1').focus(), 40);
}

// ---------------- routing after auth ----------------
async function afterAuth(){
  const profile = await apiMyProfile();
  if(isRecovery){
    renderChangePassword(profile);
    return;
  }
  if(profile && profile.mustChangePassword){
    renderChangePassword(profile);
    return;
  }
  if(!profile){
    // Signed in but not on the roster: either bootstrap case handled elsewhere,
    // or admin deleted the roster row.
    const hasAdmin = await apiHasAdmin();
    if(!hasAdmin){
      renderBootstrap();
      return;
    }
    await apiSignOut();
    showLoginError('Your account is not linked to the team roster. Ask your admin to add you.');
    renderSignIn();
    return;
  }
  if(!profile.active){
    await apiSignOut();
    showLoginError('Your account is marked inactive. Contact your admin.');
    renderSignIn();
    return;
  }
  window.location.href = 'app.html';
}

// ---------------- boot ----------------
(async function boot(){
  initTheme();
  if(!SUPABASE_CONFIGURED || !window.supabase){
    authPanel.innerHTML = '';
    showLoginError('Supabase is not configured. Open js/config.js and paste your project URL and anon key.');
    return;
  }
  // supabase-js emits PASSWORD_RECOVERY when the user lands from a reset link
  sb.auth.onAuthStateChange((event)=>{
    if(event === 'PASSWORD_RECOVERY'){
      isRecovery = true;
      apiMyProfile().then(p=>renderChangePassword(p)).catch(()=>renderChangePassword(null));
    }
  });
  try{
    const session = await apiGetSession();
    if(session){
      await afterAuth();
      return;
    }
    const hasAdmin = await apiHasAdmin();
    if(!hasAdmin) renderBootstrap();
    else renderSignIn();
  }catch(err){
    authPanel.innerHTML = '';
    showLoginError((err.message || 'Could not reach Supabase.') + ' — check js/config.js and that you ran supabase-setup.sql.');
  }
})();
