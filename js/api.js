// ============================================================
// ARGON DASHBOARD — Supabase data layer (auth + CRUD)
// ============================================================

const SUPABASE_CONFIGURED = /^https:\/\/.+\.supabase\.co/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
const sb = (SUPABASE_CONFIGURED && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function requireSb(){
  if(!sb) throw new Error('Supabase is not configured — check js/config.js');
}

// ---------- row mappers ----------
function rowToProject(row){
  return {
    id: row.id, name: row.name, developerId: row.developer_id, createdAt: row.created_at,
    startDate: row.start_date || null, endDate: row.end_date || null, remarks: row.remarks || '',
    status: row.status || 'in_progress', leadId: row.lead_id || null,
    holidays: Math.max(0, parseInt(row.holidays, 10) || 0)
  };
}
function rowToDeveloper(row){
  return {
    id: row.id, name: row.name, active: row.active !== false,
    gmail: row.gmail || '', discordUsername: row.discord_username || '', contactDetails: row.contact_details || '',
    userId: row.user_id || null, email: row.email || '', role: row.role || 'developer',
    mustChangePassword: row.must_change_password === true
  };
}
function isDuplicateKeyError(err){
  return !!err && (err.code === '23505' || /duplicate key/i.test(err.message || ''));
}

// ---------- auth ----------
async function apiGetSession(){
  requireSb();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}
async function apiSignIn(email, password){
  requireSb();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error) throw error;
  return data;
}
async function apiSignOut(){
  requireSb();
  await sb.auth.signOut();
}
async function apiChangeMyPassword(newPassword){
  requireSb();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if(error) throw error;
}
async function apiHasAdmin(){
  requireSb();
  const { data, error } = await sb.rpc('has_admin');
  if(error) throw error;
  return data === true;
}
async function apiBootstrapAdmin(name){
  requireSb();
  const { data, error } = await sb.rpc('bootstrap_admin', { p_name: name });
  if(error) throw error;
  return data;
}
async function apiSignUpPrimary(email, password){
  requireSb();
  const { data, error } = await sb.auth.signUp({ email, password });
  if(error) throw error;
  return data;
}
// Creates an auth account WITHOUT touching the admin's current session,
// by using a throwaway second client (its session is never persisted).
async function apiCreateAuthAccount(email, password){
  requireSb();
  const tmp = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await tmp.auth.signUp({ email, password });
  if(error) throw error;
  if(!data.user) throw new Error('Account was not created — check that "Confirm email" is OFF in Supabase Auth settings.');
  try{ await tmp.auth.signOut(); }catch(e){}
  return data.user; // { id, email, ... }
}
async function apiSendPasswordReset(email){
  requireSb();
  const redirectTo = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'index.html';
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if(error) throw error;
}

// Load the signed-in user's roster row (their profile)
async function apiMyProfile(){
  requireSb();
  const { data: sess } = await sb.auth.getSession();
  if(!sess.session) return null;
  const uid = sess.session.user.id;
  const { data, error } = await sb.from('developers').select('*').eq('user_id', uid).limit(1);
  if(error) throw error;
  return data && data.length ? rowToDeveloper(data[0]) : null;
}

// ---------- developers ----------
async function apiLoadDevelopers(){
  const { data, error } = await sb.from('developers').select('*');
  if(error) throw error;
  return data.map(rowToDeveloper);
}
async function apiNextDevId(){
  const { data, error } = await sb.rpc('next_dev_id');
  if(error) throw error;
  return data;
}
async function apiInsertDeveloper(d){
  const { data, error } = await sb.from('developers').insert({
    id: d.id, name: d.name, active: d.active !== false,
    gmail: d.gmail || '', discord_username: d.discordUsername || '', contact_details: d.contactDetails || '',
    user_id: d.userId || null, email: d.email || '', role: d.role || 'developer',
    must_change_password: d.mustChangePassword === true
  }).select().single();
  if(error) throw error;
  return rowToDeveloper(data);
}
async function apiUpdateDeveloper(id, fields){
  const patch = {};
  if('name' in fields) patch.name = fields.name;
  if('active' in fields) patch.active = fields.active;
  if('gmail' in fields) patch.gmail = fields.gmail || '';
  if('discordUsername' in fields) patch.discord_username = fields.discordUsername || '';
  if('contactDetails' in fields) patch.contact_details = fields.contactDetails || '';
  if('userId' in fields) patch.user_id = fields.userId;
  if('email' in fields) patch.email = fields.email || '';
  if('role' in fields) patch.role = fields.role;
  if('mustChangePassword' in fields) patch.must_change_password = fields.mustChangePassword;
  const { error } = await sb.from('developers').update(patch).eq('id', id);
  if(error) throw error;
}
async function apiDeleteDeveloper(id){
  const { error } = await sb.from('developers').delete().eq('id', id);
  if(error) throw error;
}

// ---------- projects ----------
async function apiLoadProjects(){
  const { data, error } = await sb.from('projects').select('*');
  if(error) throw error;
  return data.map(rowToProject);
}
// projects.holidays is added by supabase-project-holidays.sql. Until that runs,
// saves still work (holidays is dropped) unless a non-zero holiday count was entered.
function isMissingHolidaysColumn(err){
  return !!err && (err.code === 'PGRST204' || err.code === '42703') && /holidays/i.test(err.message || '');
}
const HOLIDAYS_SQL_HINT = 'Holidays column missing — run supabase-project-holidays.sql in the Supabase SQL editor.';
async function withHolidaysFallback(row, run){
  let res = await run(row);
  if(res.error && 'holidays' in row && isMissingHolidaysColumn(res.error)){
    if(row.holidays > 0) throw new Error(HOLIDAYS_SQL_HINT);
    const rest = Object.assign({}, row); delete rest.holidays;
    res = await run(rest);
  }
  if(res.error) throw res.error;
  return res.data;
}
async function apiInsertProject(p){
  const data = await withHolidaysFallback({
    id: p.id, name: p.name, developer_id: p.developerId, created_at: p.createdAt,
    start_date: p.startDate, end_date: p.endDate, remarks: p.remarks || '',
    status: p.status || 'in_progress', lead_id: p.leadId || null,
    holidays: Math.max(0, parseInt(p.holidays, 10) || 0)
  }, row => sb.from('projects').insert(row).select().single());
  return rowToProject(data);
}
async function apiUpdateProject(id, fields){
  const patch = {};
  if('name' in fields) patch.name = fields.name;
  if('developerId' in fields) patch.developer_id = fields.developerId;
  if('startDate' in fields) patch.start_date = fields.startDate;
  if('endDate' in fields) patch.end_date = fields.endDate;
  if('remarks' in fields) patch.remarks = fields.remarks || '';
  if('status' in fields) patch.status = fields.status;
  if('leadId' in fields) patch.lead_id = fields.leadId;
  if('holidays' in fields) patch.holidays = Math.max(0, parseInt(fields.holidays, 10) || 0);
  await withHolidaysFallback(patch, row => sb.from('projects').update(row).eq('id', id));
}
async function apiDeleteProject(id){
  const { error } = await sb.from('projects').delete().eq('id', id);
  if(error) throw error;
}

// ---------- app settings (theme, etc.) ----------
async function apiGetSetting(key){
  requireSb();
  const { data, error } = await sb.from('app_settings').select('value').eq('key', key).limit(1);
  if(error) throw error;
  return data && data.length ? data[0].value : null;
}
async function apiSaveSetting(key, value){
  requireSb();
  const { error } = await sb.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if(error) throw error;
}
async function apiDeleteSetting(key){
  requireSb();
  const { error } = await sb.from('app_settings').delete().eq('key', key);
  if(error) throw error;
}
