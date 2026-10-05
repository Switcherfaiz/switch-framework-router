import { reportError } from 'switch-framework/overlay';
import { resolveInitialLeafName } from './layouts/layoutTree.js';

export function callNavigate(route, params) {
  try {
    const fn = globalThis.globalStates?.getState?.('navigate');
    if (typeof fn === 'function') return fn(route, params);
  } catch (err) {
    reportError(err, { title: 'Navigation failed' });
  }
}

export function callReplace(route, params) {
  try {
    const fn = globalThis.globalStates?.getState?.('replace');
    if (typeof fn === 'function') return fn(route, params);
  } catch (err) {
    reportError(err, { title: 'Navigation failed' });
  }
}

export function callWipeTo(route, params) {
  try {
    const fn = globalThis.globalStates?.getState?.('wipeTo');
    if (typeof fn === 'function') return fn(route, params);
    return callReplace(route, {
      ...(params || {}),
      __wipeHistory: true,
      __lockHistory: true
    });
  } catch (err) {
    reportError(err, { title: 'Navigation failed' });
  }
}

export function splitHref(href) {
  const raw = String(href || '').trim();
  const hashAt = raw.indexOf('#');
  const noHash = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const qAt = noHash.indexOf('?');
  if (qAt < 0) return { href: noHash, query: {} };
  return {
    href: noHash.slice(0, qAt),
    query: Object.fromEntries(new URLSearchParams(noHash.slice(qAt + 1)))
  };
}

export function isNewTabTarget(target, newTabFlag) {
  if (newTabFlag) return true;
  const t = String(target || '').trim().toLowerCase();
  return t === '_blank' || t === 'blank' || t === 'new' || t === '_new';
}

export function navActionParams(opts = {}) {
  const params = { ...(opts.query || {}), ...(opts.params || {}) };
  if (opts.lockHistory) params.__lockHistory = true;
  if (opts.wipeHistory) params.__wipeHistory = true;
  if (opts.url != null) params.__url = opts.url;
  if (opts.lockHistory && params.__url == null) params.__url = '/';
  return params;
}

/** Address-bar path for an href (leaf, path, or layout id). */
export function resolvePublicPath(href) {
  const raw = String(href || '').trim();
  if (!raw) return '/';
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return raw;
  const name = raw.replace(/^\//, '');
  const defined = globalThis.globalStates?.getState?.('definedRoutes') || [];
  const rec = defined.find((r) => r.route === name || String(r.path || '').replace(/^\//, '') === name);
  if (rec?.path) return rec.path.startsWith('/') ? rec.path : `/${rec.path}`;

  const layoutIndex = globalThis.globalStates?.getState?.('layoutIndex');
  const node = layoutIndex instanceof Map ? layoutIndex.get(name) : null;
  if (node?.Cls) {
    const leaf = resolveInitialLeafName(node.Cls);
    if (leaf) {
      const leafRec = defined.find((r) => r.route === leaf);
      if (leafRec?.path) return leafRec.path.startsWith('/') ? leafRec.path : `/${leafRec.path}`;
      return `/${leaf}`;
    }
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function resolvePublicHref(href, query = {}) {
  const split = splitHref(href);
  let path = resolvePublicPath(split.href);
  const merged = { ...split.query, ...(query || {}) };
  const qs = new URLSearchParams();
  Object.entries(merged).forEach(([key, value]) => {
    if (key.startsWith('__') || value == null || value === '') return;
    qs.set(key, String(value));
  });
  const search = qs.toString();
  if (!search) return path;
  return path.includes('?') ? `${path}&${search}` : `${path}?${search}`;
}
