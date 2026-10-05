import { Router } from './router.js';
import { createGlobalStates, encodeData, decodeData, createProps } from 'switch-framework/helpers/index.js';
import { getCurrentComponent } from 'switch-framework/registers/SwitchComponent.js';
import { reportError } from 'switch-framework/overlay';
import { Link } from './Link.js';
import { Redirect } from './Redirect.js';
import { resolveGuard } from './guards.js';
import { resolveNavAnim } from './screenAnimation.js';

export function Stack(config = {}) {
  return {
    ...config,
    layout: config.layout || 'stack'
  };
}

Stack.screen = (config = {}) => Stack(config);

export function Tabs(config = {}) {
  const name = config?.name || config?.container;
  return {
    ...config,
    name,
    layout: config.layout || 'tabs'
  };
}

Tabs.screen = (config = {}) => Tabs(config);

// Hook to get route parameters (:id style)
export function useParams() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    return globalStates.getState('routeParams') || {};
  }
  return {};
}

// Hook to get search parameters (?key=value style)
export function useSearchParams() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    return globalStates.getState('searchParams') || {};
  }
  return {};
}

/** Returns the current active route string (e.g. "docs/introduction") */
export function getActiveRoute() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    return globalStates.getState('activeRoute') || '';
  }
  return '';
}

/**
 * True when `route` is this screen: `home` matches only `/home`,
 * `home/:id` matches `/home/travel` but not `/home`.
 */
export function isScreenActive(screenName, route = getActiveRoute()) {
  const n = String(screenName || '');
  const r = String(route || '');
  if (!n) return false;
  if (n.includes(':')) {
    const prefix = n.split('/:')[0];
    return r === prefix || r.startsWith(prefix + '/');
  }
  return r === n;
}

/**
 * True when this screen instance matches the active route params.
 * Use with keep-alive dynamic routes so hidden cached screens stay idle.
 */
export function isScreenInstanceActive(comp, screenName = comp?.constructor?.screenName, route = getActiveRoute()) {
  if (!comp || !isScreenActive(screenName, route)) return false;
  const routeParams = useParams();
  const mine = comp.getProps?.() || {};
  const keys = Object.keys(routeParams);
  if (!keys.length) return true;
  // Shared cacheKey screens have no per-param props; they read the active route globally.
  if (!Object.keys(mine).length) return true;
  return keys.every((k) => String(mine[k] ?? '') === String(routeParams[k] ?? ''));
}

/** Returns the current active full URL as seen in the browser address bar (e.g. "http://localhost:3000/docs/introduction"). */
export function getActivePath() {
  try {
    return (typeof window !== 'undefined' && window.location && window.location.href) ? window.location.href : '';
  } catch (_) {
    return '';
  }
}

/**
 * Subscribe to route changes. Accepts a callback that runs when the route changes.
 * Returns an unsubscribe function.
 * @param {() => void} callback
 * @returns {() => void} unsubscribe
 */
export function useRouteChangesSubscriber(callback) {
  if (typeof globalStates !== 'undefined' && globalStates.subscribe) {
    return globalStates.subscribe(callback);
  }
  return () => {};
}

function reportNavError(err) {
  reportError(err, { title: 'Navigation failed' });
}

// Navigation functions that work with globalStates
export function navigate(route, params = {}) {
  try {
    if (typeof globalStates !== 'undefined' && globalStates.getState) {
      const navigateFn = globalStates.getState('navigate');
      if (typeof navigateFn === 'function') {
        return navigateFn(route, params);
      }
    }
    reportNavError('Navigate function not available in globalStates');
  } catch (err) {
    reportNavError(err);
  }
}

export function goBack() {
  try {
    if (typeof globalStates !== 'undefined' && globalStates.getState) {
      const goBackFn = globalStates.getState('go_back');
      if (typeof goBackFn === 'function') {
        return goBackFn();
      }
    }
    window.history.back();
  } catch (err) {
    reportNavError(err);
  }
}

export function redirect(route, params = {}) {
  return navigate(route, params);
}

export function reload() {
  try {
    window.location.reload();
  } catch (err) {
    reportNavError(err);
  }
}

export function replace(route, params = {}) {
  try {
    if (typeof globalStates !== 'undefined' && globalStates.getState) {
      const replaceFn = globalStates.getState('replace');
      if (typeof replaceFn === 'function') {
        return replaceFn(route, params);
      }
    }
    reportNavError('Replace function not available in globalStates');
  } catch (err) {
    reportNavError(err);
  }
}

export function reset(route, params = {}) {
  try {
    if (typeof globalStates !== 'undefined' && globalStates.getState) {
      const resetFn = globalStates.getState('reset');
      if (typeof resetFn === 'function') {
        return resetFn(route, params);
      }
    }
    reportNavError('Reset function not available in globalStates');
  } catch (err) {
    reportNavError(err);
  }
}

export function wipeTo(route, params = {}) {
  try {
    if (typeof globalStates !== 'undefined' && globalStates.getState) {
      const wipeFn = globalStates.getState('wipeTo');
      if (typeof wipeFn === 'function') {
        return wipeFn(route, params);
      }
    }
    return replace(route, { ...params, __wipeHistory: true, __lockHistory: true });
  } catch (err) {
    reportNavError(err);
  }
}

/** Returns array of defined route paths from registered screens */
export function getDefinedRoutes() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    const routes = globalStates.getState('definedRoutes') || [];
    return routes.map((r) => r.path);
  }
  return [];
}

/** Returns array of navigated routes in order, each { path, route, params, title } */
export function getActiveRoutes() {
  if (typeof globalStates !== 'undefined' && globalStates.getState) {
    return globalStates.getState('activeRoutesHistory') || [];
  }
  return [];
}

/**
 * Returns { route, params, title } for the previous route, or null.
 * @param {string} prefix - Route prefix e.g. 'docs'
 * @param {string[]} orderedIds - Optional ordered param values for dynamic routes (e.g. ['introduction','installation'])
 */
export function previousRoute(prefix = '', orderedIds = []) {
  const defined = globalStates?.getState?.('definedRoutes') || [];
  const active = globalStates?.getState?.('activeRoute') || '';
  const params = globalStates?.getState?.('routeParams') || {};

  if (orderedIds.length > 0) {
    const currentId = params.id || active.split('/').pop() || orderedIds[0];
    const idx = orderedIds.indexOf(currentId);
    if (idx <= 0) return null;
    const prevId = orderedIds[idx - 1];
    const route = prefix ? `${prefix}/${prevId}` : prevId;
    const titles = { introduction: 'Introduction', installation: 'Installation', quickstart: 'Quick Start', cli: 'CLI', router: 'Router', state: 'State Management', components: 'Components', theming: 'Theming', animations: 'Animations', changelogs: 'Changelogs' };
    return { route, params: prevId ? { id: prevId } : {}, title: titles[prevId] || prevId };
  }

  const filtered = defined.filter((r) => !prefix || String(r.route).startsWith(prefix + '/') || r.route === prefix);
  const idx = filtered.findIndex((r) => r.route === active);
  if (idx <= 0) return null;
  const prev = filtered[idx - 1];
  return { route: prev.route, params: {}, title: prev.title };
}

/**
 * Returns { route, params, title } for the next route, or null.
 * @param {string} prefix - Route prefix e.g. 'docs'
 * @param {string[]} orderedIds - Optional ordered param values for dynamic routes
 */
export function nextRoute(prefix = '', orderedIds = []) {
  const defined = globalStates?.getState?.('definedRoutes') || [];
  const active = globalStates?.getState?.('activeRoute') || '';
  const params = globalStates?.getState?.('routeParams') || {};

  if (orderedIds.length > 0) {
    const currentId = params.id || active.split('/').pop() || orderedIds[0];
    const idx = orderedIds.indexOf(currentId);
    if (idx < 0 || idx >= orderedIds.length - 1) return null;
    const nextId = orderedIds[idx + 1];
    const route = prefix ? `${prefix}/${nextId}` : nextId;
    const titles = { introduction: 'Introduction', installation: 'Installation', quickstart: 'Quick Start', cli: 'CLI', router: 'Router', state: 'State Management', components: 'Components', theming: 'Theming', animations: 'Animations', changelogs: 'Changelogs' };
    return { route, params: nextId ? { id: nextId } : {}, title: titles[nextId] || nextId };
  }

  const filtered = defined.filter((r) => !prefix || String(r.route).startsWith(prefix + '/') || r.route === prefix);
  const idx = filtered.findIndex((r) => r.route === active);
  if (idx < 0 || idx >= filtered.length - 1) return null;
  const next = filtered[idx + 1];
  return { route: next.route, params: {}, title: next.title };
}

/**
 * Run a callback when this screen is the active route (and when its params change).
 * Hidden keep-alive screens do not run it. Call from effects().
 *
 * @example
 * effects() {
 *   useScreenFocus(() => this.loadFeed());
 * }
 */
export function useScreenFocus(callback) {
  const comp = getCurrentComponent();
  if (!comp || typeof callback !== 'function' || typeof comp.useEffect !== 'function') {
    return () => {};
  }
  const screenName = comp.constructor.screenName || '';
  return comp.useEffect(() => {
    if (isScreenInstanceActive(comp, screenName)) callback.call(comp);
  }, ['activeRoute', 'routeParams']);
}

export {
  Router,
  Link,
  Redirect,
  resolveGuard,
  resolveNavAnim,
  createGlobalStates,
  encodeData,
  decodeData,
  createProps
};

export { RootLayout } from './layouts/RootLayout.js';
export { TabLayout } from './layouts/TabLayout.js';
export { StackLayout } from './layouts/StackLayout.js';
export { startApp, hasAppStarted } from './startApp.js';
export { registerScreens, assertExpoConventions, registerComponents, ensureComponentDefined } from './registerScreens.js';
