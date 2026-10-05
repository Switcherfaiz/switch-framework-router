import { getState } from 'switch-framework/state-managers/index.js';

function readUser() {
  try {
    return getState('user');
  } catch (_) {
    return undefined;
  }
}

function evaluateGuardSource(Cls) {
  if (!Cls) return null;
  if (typeof Cls.guard === 'function') {
    let allowed = false;
    try {
      allowed = !!Cls.guard();
    } catch (_) {
      allowed = false;
    }
    if (allowed) return { ok: true, source: Cls };
    return { ok: false, redirect: Cls.redirect || 'login', source: Cls };
  }
  if (Cls.protected === false) return { ok: true, source: Cls };
  if (Cls.protected === true) {
    if (readUser()) return { ok: true, source: Cls };
    return { ok: false, redirect: Cls.redirect || 'login', source: Cls };
  }
  return null;
}

/**
 * Leaf guard / protected wins; otherwise nearest layout in layoutChain.
 * `static guard` must be a function evaluated at navigate time.
 */
export function resolveGuard(route) {
  if (!route) return { ok: true };
  const leaf = evaluateGuardSource(route.Cls);
  if (leaf) return leaf;
  const chain = route.layoutChain || [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const decision = evaluateGuardSource(chain[i]?.Cls);
    if (decision) return decision;
  }
  return { ok: true };
}
