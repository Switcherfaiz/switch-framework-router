const PRESET_TOKENS = new Set([
  'fade',
  'fade-bottom',
  'fade-bottom-out',
  'fade-top',
  'slide-left',
  'slide-right'
]);

const PHASE_IN = ['sw-in', 'inAnimation'];
const PHASE_OUT = ['sw-out', 'outAnimation'];

const ANIM_CLASS_MARKERS = [
  ...PHASE_IN,
  ...PHASE_OUT,
  ...PRESET_TOKENS
];

const PRESET_CSS = `
:host.sw-in.fade,
:host.inAnimation.fade { animation: sw-nav-fade-in 0.22s ease both; }
:host.sw-out.fade,
:host.outAnimation.fade { animation: sw-nav-fade-out 0.18s ease both; }
:host.sw-in.fade-bottom,
:host.inAnimation.fade-bottom,
:host.sw-in.fade-bottom-out,
:host.inAnimation.fade-bottom-out { animation: sw-nav-fade-bottom-in 0.28s cubic-bezier(.22, 1, .36, 1) both; }
:host.sw-out.fade-bottom,
:host.outAnimation.fade-bottom,
:host.sw-out.fade-bottom-out,
:host.outAnimation.fade-bottom-out { animation: sw-nav-fade-bottom-out 0.22s ease both; }
:host.sw-in.fade-top,
:host.inAnimation.fade-top { animation: sw-nav-fade-top-in 0.28s cubic-bezier(.22, 1, .36, 1) both; }
:host.sw-out.fade-top,
:host.outAnimation.fade-top { animation: sw-nav-fade-top-out 0.22s ease both; }
:host.sw-in.slide-left,
:host.inAnimation.slide-left { animation: sw-nav-slide-left-in 0.28s cubic-bezier(.22, 1, .36, 1) both; }
:host.sw-out.slide-left,
:host.outAnimation.slide-left { animation: sw-nav-slide-left-out 0.22s ease both; }
:host.sw-in.slide-right,
:host.inAnimation.slide-right { animation: sw-nav-slide-right-in 0.28s cubic-bezier(.22, 1, .36, 1) both; }
:host.sw-out.slide-right,
:host.outAnimation.slide-right { animation: sw-nav-slide-right-out 0.22s ease both; }
@keyframes sw-nav-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes sw-nav-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes sw-nav-fade-bottom-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes sw-nav-fade-bottom-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(16px); } }
@keyframes sw-nav-fade-top-in { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: none; } }
@keyframes sw-nav-fade-top-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-16px); } }
@keyframes sw-nav-slide-left-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
@keyframes sw-nav-slide-left-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(-24px); } }
@keyframes sw-nav-slide-right-in { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@keyframes sw-nav-slide-right-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(24px); } }
`;

let presetSheet = null;

function token(value, fallback = 'none') {
  const s = String(value ?? '').trim();
  return s || fallback;
}

function cssClassToken(value) {
  const s = String(value ?? '').trim();
  if (!s || s.toLowerCase() === 'none') return '';
  if (!/^[A-Za-z_][\w-]*$/.test(s)) return '';
  return s;
}

export function resolveNavAnim(Cls) {
  if (!Cls) return { in: '', out: '' };
  const nav = token(Cls.navigatingAnimation, 'none');
  const inn = cssClassToken(token(Cls.inAnimation, nav));
  const out = cssClassToken(token(Cls.outAnimation, nav));
  return { in: inn, out };
}

function getPresetSheet() {
  if (presetSheet) return presetSheet;
  if (typeof CSSStyleSheet === 'undefined') return null;
  presetSheet = new CSSStyleSheet();
  try { presetSheet.replaceSync(PRESET_CSS); } catch (_) { presetSheet = null; }
  return presetSheet;
}

function adoptPresetSheet(el) {
  const root = el?.shadowRoot;
  const sheet = getPresetSheet();
  if (!root || !sheet || !('adoptedStyleSheets' in root)) return;
  const current = Array.from(root.adoptedStyleSheets || []);
  if (current.includes(sheet)) return;
  root.adoptedStyleSheets = [...current, sheet];
}

function clearAnimClasses(el) {
  if (!el?.classList) return;
  ANIM_CLASS_MARKERS.forEach((name) => el.classList.remove(name));
  [...el.classList].forEach((name) => {
    if (name.startsWith('sw-nav-')) el.classList.remove(name);
  });
}

export function clearScreenNavAnim(el) {
  clearAnimClasses(el);
}

function addAnimClasses(el, phase, name) {
  if (!el?.classList || !name) return;
  const phaseClasses = phase === 'out' ? PHASE_OUT : PHASE_IN;
  phaseClasses.forEach((cls) => el.classList.add(cls));
  el.classList.add(name);
  el.classList.add(`sw-nav-${name}`);
}

function retrigger(el) {
  if (!el) return;
  void el.offsetWidth;
}

export function applyScreenNavAnim(el, phase) {
  if (!el) return '';
  const anim = resolveNavAnim(el.constructor);
  const name = phase === 'out' ? anim.out : anim.in;
  clearAnimClasses(el);
  if (!name) return '';
  if (PRESET_TOKENS.has(name)) adoptPresetSheet(el);
  retrigger(el);
  addAnimClasses(el, phase, name);
  return name;
}

export function waitForNavAnim(el, fallbackMs = 320) {
  return new Promise((resolve) => {
    if (!el) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('animationend', onEnd);
      el.removeEventListener('transitionend', onEnd);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target !== el) return;
      finish();
    };
    el.addEventListener('animationend', onEnd);
    el.addEventListener('transitionend', onEnd);
    setTimeout(finish, fallbackMs);
  });
}
