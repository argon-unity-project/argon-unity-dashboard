// ============================================================
// ARGON DASHBOARD — shared utilities
// ============================================================

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function debounce(fn, ms){
  let t;
  return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

function initialsOf(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return '?';
  return parts.slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ---------- dates & working-day calculation ----------
// Off days: every Sunday, plus the 1st and 3rd Saturday of each month.
// Recurring off days: Sundays only (Saturdays are working by default —
// the admin marks specific ones off in the Work Calendar)
function isAutoOffDay(date){
  return date.getDay() === 0;
}
// Admin-managed calendar (loaded from Supabase app_settings at boot):
// CUSTOM_HOLIDAYS = extra off days; CUSTOM_WORKDAYS = weekly-off days forced to working
const CUSTOM_HOLIDAYS = new Set();
const CUSTOM_WORKDAYS = new Set();
function setCustomHolidays(dates, work){
  CUSTOM_HOLIDAYS.clear();
  CUSTOM_WORKDAYS.clear();
  (dates || []).forEach(d => CUSTOM_HOLIDAYS.add(String(d).slice(0,10)));
  (work  || []).forEach(d => CUSTOM_WORKDAYS.add(String(d).slice(0,10)));
}
function isOffDay(date){
  const iso = isoOfDate(date);
  if(CUSTOM_WORKDAYS.has(iso)) return false;
  return isAutoOffDay(date) || CUSTOM_HOLIDAYS.has(iso);
}
function parseDateOnly(str){
  if(!str) return null;
  const d = new Date(String(str).slice(0,10) + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}
function todayIso(){
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}
function isoOf(y, m, d){
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function isoOfDate(d){
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDaysIso(iso, n){
  const d = parseDateOnly(iso);
  d.setDate(d.getDate() + n);
  return isoOfDate(d);
}
function calculateWorkingDays(startStr, endStr){
  const start = parseDateOnly(startStr);
  const end = parseDateOnly(endStr);
  if(!start || !end || end < start) return null;
  let count = 0;
  const cur = new Date(start);
  while(cur <= end){
    if(!isOffDay(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function formatDateShort(str){
  const d = parseDateOnly(str);
  if(!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')} ${MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}
function formatDateLong(str){
  const d = parseDateOnly(str);
  if(!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function formatDateFriendly(str){
  const iso = String(str).slice(0,10);
  if(iso === todayIso()) return 'Today';
  if(iso === addDaysIso(todayIso(), -1)) return 'Yesterday';
  const d = parseDateOnly(iso);
  return d ? `${DOW_SHORT[d.getDay()]}, ${formatDateLong(iso)}` : '—';
}
function formatHours(h){
  const n = Number(h) || 0;
  return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
}

// ---------- validators ----------
function isValidEmail(v){
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}
function isValidDiscord(v){
  return /^(?!.*\.\.)[a-z0-9._]{2,32}$/.test(String(v).toLowerCase());
}
function isValidContact(v){
  if(/\d/.test(v)){
    const digits = v.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }
  return v.length >= 3;
}
function isValidHours(v){
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 24;
}

// ---------- field error helper ----------
function setFieldError(fieldId, msg){
  const f = document.getElementById(fieldId);
  if(!f) return;
  const et = f.querySelector('.error-text');
  if(msg){
    f.classList.add('has-error');
    if(et) et.innerHTML = `${ICONS.warn}<span>${escapeHtml(msg)}</span>`;
  } else {
    f.classList.remove('has-error');
  }
}

// ---------- playful icons: per-game + per-person ----------
const GAME_EMOJI_RULES = [
  [/sheep/i,'🐑'],[/cat|meow|kitt/i,'🐱'],[/word|letter/i,'🔤'],[/block|cube|brick/i,'🧊'],
  [/paint|art\b|colou?r/i,'🎨'],[/picture|photo|image|gallery/i,'🖼️'],[/puzzle|jig/i,'🧩'],
  [/soccer|football|kick/i,'⚽'],[/bowl/i,'🎳'],[/arrow|archer|bow\b/i,'🏹'],[/car\b|drive|wash/i,'🚗'],
  [/snake/i,'🐍'],[/bubble/i,'🫧'],[/candy|sweet/i,'🍬'],[/dice/i,'🎲'],[/card|solit/i,'🃏'],
  [/tower/i,'🗼'],[/knife/i,'🔪'],[/egg/i,'🥚'],[/santa|christmas/i,'🎅'],[/ninja/i,'🥷'],
  [/king|royal|crown/i,'👑'],[/smash|hammer|strike|crush/i,'🔨'],[/fish/i,'🐟'],[/bird|fluffy/i,'🐦'],
  [/water|aqua/i,'💧'],[/fire/i,'🔥'],[/star/i,'⭐'],[/love|heart/i,'💘'],[/jump/i,'🦘'],
  [/run|dash/i,'🏃'],[/space|galaxy|rocket/i,'🚀'],[/zoo|animal|pet/i,'🦁'],[/maze/i,'🌀'],
  [/pool|billiard/i,'🎱'],[/tennis|tenis/i,'🎾'],[/dunk|hoop|basket/i,'🏀'],[/pop\b/i,'🎈'],
  [/merge|link|connect/i,'🔗'],[/match/i,'🍭'],[/wheel/i,'🎡'],[/draw|line|sketch/i,'✏️'],
  [/tile/i,'🀄'],[/wood/i,'🪵'],[/marble/i,'🔮'],[/glass/i,'🥛'],[/pixel/i,'👾'],[/hero/i,'🦸'],
  [/prank|trick/i,'🤡'],[/doll/i,'🎎'],[/cactus/i,'🌵'],[/morris|chess/i,'♟️'],[/swipe|swap/i,'🔀'],
  [/sort/i,'🗂️'],[/bounce|bouncy/i,'🏐'],[/pinata/i,'🪅'],[/pirate/i,'🏴‍☠️'],[/tap/i,'👆']
];
const GAME_EMOJI_FALLBACK = ['🎮','🕹️','👾','🎯','🎪','🎠','🧸','🪁','🎊','🏆'];
function strHash(s){
  let h = 0;
  for(const c of String(s)) h = ((h * 31) + c.charCodeAt(0)) >>> 0;
  return h;
}
function gameEmoji(name){
  for(const [re, e] of GAME_EMOJI_RULES) if(re.test(String(name || ''))) return e;
  return GAME_EMOJI_FALLBACK[strHash(name) % GAME_EMOJI_FALLBACK.length];
}
const PERSON_EMOJI = ['🦊','🐱','🐼','🦁','🐸','🐵','🐯','🐨','🦄','🐷','🐰','🐙','🦉','🐢','🐺','🦖','🐳','🦜'];
function personEmoji(name){
  return PERSON_EMOJI[strHash(name) % PERSON_EMOJI.length];
}
// each person/project gets a stable accent color for their avatar chip
function avClass(name){
  return 'av-' + (strHash(name) % 5);
}

// ---------- work description rendering ----------
// Descriptions are stored as one task per line; render multi-line ones as bullets.
function descLines(desc){
  return String(desc || '').split('\n')
    .map(s => s.replace(/^\s*[•\-\*]\s*/, '').trim())
    .filter(Boolean);
}
function descriptionHtml(desc){
  const lines = descLines(desc);
  if(!lines.length) return '';
  if(lines.length === 1) return escapeHtml(lines[0]);
  return '<ul class="desc-list">' + lines.map(l => '<li>' + escapeHtml(l) + '</li>').join('') + '</ul>';
}

// ---------- CSV export ----------
function downloadCsv(filename, rows){
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

// ---------- labels ----------
const ROLE_LABELS = { admin: 'Admin', leader: 'Team Leader', developer: 'Developer' };
const PROJECT_STATUSES = [
  ['planned', 'Planned'],
  ['in_progress', 'In Progress'],
  ['testing', 'Testing'],
  ['completed', 'Completed'],
  ['on_hold', 'On Hold']
];
function statusLabel(s){
  const f = PROJECT_STATUSES.find(x=>x[0]===s);
  return f ? f[1] : s;
}
function statusChip(s){
  return `<span class="proj-status ${escapeHtml(s)}"><span class="dot"></span>${escapeHtml(statusLabel(s))}</span>`;
}
function roleBadge(role){
  const icon = role === 'admin' ? ICONS.shield : role === 'leader' ? ICONS.star : ICONS.user;
  return `<span class="role-badge ${escapeHtml(role)}">${icon}${escapeHtml(ROLE_LABELS[role] || role)}</span>`;
}
