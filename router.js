import { encodeData } from 'switch-framework/helpers/index.js';
import { consumeModalBack } from 'switch-framework/components/modalPortal.js';
import { reportError } from 'switch-framework/overlay';
import { resolveInitialLeafName } from './layouts/layoutTree.js';
import { resolveGuard } from './guards.js';
import { applyScreenNavAnim, waitForNavAnim } from './screenAnimation.js';
import { splitHref } from './navCall.js';

const NAV_RESERVED = new Set(['__wipeHistory', '__lockHistory', '__url']);

function locationQuery() {
  try {
    return Object.fromEntries(new URLSearchParams(window.location.search || ''));
  } catch (_) {
    return {};
  }
}

function pathParamKeys(pathTemplate) {
  const keys = new Set();
  String(pathTemplate || '').replace(/:([A-Za-z0-9_]+)\??/g, (_, key) => {
    keys.add(key);
    return '';
  });
  return keys;
}

export class Router {
  constructor(routes = {}, updateTitleCallback = null, containerEl = null, onRouteChange = null, options = {}) {
    this.routes = routes;
    this.updateTitleCallback = updateTitleCallback;
    this.containerEl = containerEl;
    this.onRouteChange = onRouteChange;
    this.defaultRoute = options.defaultRoute ?? null;
    this.titlePrefix = options.titlePrefix ?? '';
    this.layoutIndex = options.layoutIndex instanceof Map ? options.layoutIndex : new Map();
    this.navigate = this.navigate.bind(this);
    this.redirect = this.redirect.bind(this);
    this.replace = this.replace.bind(this);
    this.reset = this.reset.bind(this);
    this.wipeTo = this.wipeTo.bind(this);
    this.handlePopState = this.handlePopState.bind(this);
    this.renderScreen = this.renderScreen.bind(this);
    this.findRoute = this.findRoute.bind(this);
    this.buildPath = this.buildPath.bind(this);
    this.start = this.start.bind(this);
    this.resolveNavigateTarget = this.resolveNavigateTarget.bind(this);
    this.ensureLayoutChain = this.ensureLayoutChain.bind(this);
    this._wrapNavErrors();

    this._lockedRoute = null;
    this._guardDepth = 0;
    this._skipGuard = 0;
    // Cache of rendered screen elements: key = normalizedRoute, value = { element, params }
    this._screenCache = new Map();

    window.addEventListener('popstate', this.handlePopState);
  }

  _wrapNavErrors() {
    const names = ['navigate', 'replace', 'reset', 'wipeTo', 'start', 'handlePopState', 'redirect'];
    for (const name of names) {
      const orig = this[name];
      this[name] = (...args) => {
        try {
          return orig.apply(this, args);
        } catch (err) {
          reportError(err, { title: 'Navigation failed' });
          return null;
        }
      };
    }
  }

  escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  resolveNavigateTarget(routeName) {
    if (routeName == null || routeName === '') return routeName;
    const stripped = splitHref(routeName).href;
    const normalized = String(stripped).startsWith('/') ? String(stripped).substring(1) : String(stripped);
    if (this.findRoute(normalized, {})) return normalized;
    const node = this.layoutIndex.get(normalized);
    if (node?.Cls) {
      const leaf = resolveInitialLeafName(node.Cls);
      if (leaf) return leaf;
    }
    return normalized;
  }

  ensureLayoutChain(routeInfo, rootEl) {
    const chain = routeInfo?.route?.layoutChain || [];
    const nested = chain.length > 1 ? chain.slice(1) : [];
    let container = rootEl?.getContentContainer?.() || this.containerEl;
    if (!nested.length) return container;

    for (const node of nested) {
      if (!container || !node?.tag) break;
      const cacheKey = `layout:${node.screenName || node.tag}`;
      this._showScreen(container, cacheKey, `<${node.tag}></${node.tag}>`);
      const cached = this._screenCache.get(cacheKey);
      const el = cached?.element;
      container = (el && typeof el.getContentContainer === 'function' && el.getContentContainer()) || container;
    }
    return container;
  }

  getNotFoundRouteKey() {
    if (!this.routes) return null;
    const entries = Object.entries(this.routes);
    const byKey = ['+not-found', 'not-found', '404'].find((k) => this.routes[k]);
    if (byKey) return byKey;
    const byPath = entries.find(([, r]) => r?.path === '/+not-found');
    return byPath ? byPath[0] : null;
  }

  renderNotFound(missingRoute = '', additionalProps = {}) {
    const missingPath = window.location.pathname || '';
    const notFoundKey = this.getNotFoundRouteKey();

    if (notFoundKey && missingRoute !== notFoundKey) {
      const route = this.routes[notFoundKey];
      if (route) {
        const effectiveParams = { ...additionalProps, missingRoute, missingPath };
        const routeInfo = {
          normalizedRoute: notFoundKey,
          route,
          fullPath: missingPath,
          params: effectiveParams
        };
        
        // Push the not-found route to history with the actual missing path
        history.pushState({ route: notFoundKey, params: effectiveParams }, '', missingPath);
        
        const containerFromCallback = typeof this.onRouteChange === 'function' ? this.onRouteChange(routeInfo) : null;
        const container = containerFromCallback || this.containerEl;
        const screenContent = typeof route.render === 'function' ? route.render(effectiveParams) : route.render;
        if (this.updateTitleCallback) this.updateTitleCallback(notFoundKey);
        if (container) this._showScreen(container, notFoundKey, screenContent, effectiveParams);
        const baseTitle = route.title || 'Not Found';
        document.title = this.titlePrefix ? (baseTitle ? `${this.titlePrefix} - ${baseTitle}` : this.titlePrefix) : baseTitle;
        return routeInfo;
      }
    }

    const normalizedMissing = missingRoute.startsWith('/') ? missingRoute.substring(1) : missingRoute;
    const routeInfo = {
      normalizedRoute: normalizedMissing,
      route: { title: 'Not Found', layout: 'stack' },
      fullPath: missingPath,
      params: { ...additionalProps, missingRoute: normalizedMissing, missingPath }
    };

    const containerFromCallback = typeof this.onRouteChange === 'function' ? this.onRouteChange(routeInfo) : null;
    const container = containerFromCallback || this.containerEl;
    if (container) this._showScreen(container, '+not-found', `<sw-not-found-screen></sw-not-found-screen>`, routeInfo.params);
    document.title = this.titlePrefix ? `${this.titlePrefix} - Not Found` : 'Not Found';
    return routeInfo;
  }

  _wipeProtectedHistory() {
    this.clearScreenCache();
    try {
      globalThis.globalStates?.setState?.({ activeRoutesHistory: [] });
    } catch (_) {}
  }

  _maybeGuard(route, normalized) {
    if (this._skipGuard > 0 || this._guardDepth > 5) return null;
    const decision = resolveGuard(route);
    if (!decision || decision.ok) return null;
    const dest = this.resolveNavigateTarget(decision.redirect || 'login');
    if (!dest || dest === normalized) return null;
    this._guardDepth += 1;
    try {
      return this.wipeTo(dest);
    } finally {
      this._guardDepth -= 1;
    }
  }

  /**
   * Drop keep-alive screens, clear app route history, replace+lock so Back
   * cannot reopen a protected leaf.
   */
  wipeTo(fullRoute, additionalProps = {}) {
    this._wipeProtectedHistory();
    return this.replace(fullRoute, {
      ...additionalProps,
      __wipeHistory: false,
      __lockHistory: true
    });
  }

  start(initialRoute) {
    const fullPath = window.location.pathname || '/';
    const routingPath = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
    if (routingPath) {
      const target = this.resolveNavigateTarget(routingPath);
      const info = this.renderScreen(target, locationQuery());
      if (!info) return this.renderNotFound(routingPath, {});

      const current = `${fullPath}${window.location.search || ''}`;
      if (info.fullPath && info.fullPath !== current) {
        history.replaceState({ route: info.normalizedRoute, params: info.params }, '', info.fullPath);
      }

      return info;
    }

    const targetRoute = this.resolveNavigateTarget(initialRoute ?? this.defaultRoute);
    if (targetRoute) return this.navigate(targetRoute);
    return this.renderNotFound('', {});
  }

  extractParamsFromRoute(normalized, route) {
    const pathTemplate = route?.path;
    if (!pathTemplate || !String(pathTemplate).includes(':')) return {};

    const templateSegments = String(pathTemplate).replace(/^\//, '').split('/');
    const routeSegments = String(normalized).replace(/^\//, '').split('/');
    if (templateSegments.length !== routeSegments.length) return {};

    return templateSegments.reduce((acc, seg, idx) => {
      if (seg.startsWith(':')) acc[seg.slice(1).replace(/\?$/, '')] = routeSegments[idx] || '';
      return acc;
    }, {});
  }

  findRoute(routeName, params = {}) {
    const stripped = splitHref(routeName).href;
    const normalized = stripped.startsWith('/') ? stripped.substring(1) : stripped;
    
    // PRIORITY 1: Check for EXACT static match first (highest priority)
    // This ensures /home matches /home, not /home/:id
    if (this.routes[normalized]) {
      const route = this.routes[normalized];
      const pathTemplate = route.path || '';
      
      // If it's a pure static route (no params), use it immediately
      if (!pathTemplate.includes(':')) {
        return { ...route, render: () => route.render(params) };
      }
    }

    // PRIORITY 2: Check for exact matches in route paths (e.g., path: '/home' matches 'home')
    const exactMatches = Object.entries(this.routes).filter(([, route]) => {
      const path = (route.path || '').replace(/^\//, '');
      return path === normalized && !path.includes(':');
    });
    
    if (exactMatches.length > 0) {
      const [, route] = exactMatches[0];
      return { ...route, render: () => route.render(params) };
    }

    // PRIORITY 3: Dynamic routes (routes with parameters)
    const dynamicRoutes = Object.entries(this.routes).filter(
      ([, route]) => (route.path || '').includes(':')
    );

    // Sort by specificity: fewer params = more specific, static segments count more
    dynamicRoutes.sort(([, routeA], [, routeB]) => {
      const aPath = routeA.path || '';
      const bPath = routeB.path || '';
      
      const aSegments = aPath.replace(/^\//, '').split('/');
      const bSegments = bPath.replace(/^\//, '').split('/');
      
      // Count static vs dynamic segments
      const aStatic = aSegments.filter(seg => !seg.startsWith(':')).length;
      const bStatic = bSegments.filter(seg => !seg.startsWith(':')).length;
      
      // More static segments = more specific (higher priority)
      if (aStatic !== bStatic) return bStatic - aStatic;
      
      // Fewer total segments = more specific
      return aSegments.length - bSegments.length;
    });

    // Try to match dynamic routes (`:id` required, `:id?` optional)
    const routeSegments = normalized.split('/');
    
    for (const [routeKey, route] of dynamicRoutes) {
      const pathTemplate = route.path || '/' + routeKey;
      const patternSegments = pathTemplate.replace(/^\//, '').split('/');
      const last = patternSegments[patternSegments.length - 1] || '';
      const lastOptional = last.startsWith(':') && last.endsWith('?');
      const requiredCount = lastOptional ? patternSegments.length - 1 : patternSegments.length;

      if (routeSegments.length !== patternSegments.length && !(lastOptional && routeSegments.length === requiredCount)) {
        continue;
      }

      const dynamicParams = {};
      let isMatch = true;

      for (let i = 0; i < patternSegments.length; i++) {
        const patternSegment = patternSegments[i];
        const routeSegment = routeSegments[i];
        const optional = patternSegment.startsWith(':') && patternSegment.endsWith('?');
        const paramName = patternSegment.startsWith(':')
          ? patternSegment.slice(1).replace(/\?$/, '')
          : '';
        
        if (patternSegment.startsWith(':')) {
          if (routeSegment == null && optional) {
            dynamicParams[paramName] = '';
          } else if (routeSegment == null) {
            isMatch = false;
            break;
          } else {
            dynamicParams[paramName] = routeSegment;
          }
        } else if (patternSegment !== routeSegment) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        const resolvedParams = { ...params, ...dynamicParams };
        return { ...route, _resolvedParams: resolvedParams, _useNormalized: true, render: () => route.render(resolvedParams) };
      }
    }

    // PRIORITY 4: Fallback - try matching a parent prefix route
    const segments = normalized.split('/');
    if (segments.length > 1) {
      for (let i = segments.length - 1; i >= 1; i--) {
        const prefix = segments.slice(0, i).join('/');
        if (this.routes[prefix]) {
          const subPath = segments.slice(i).join('/');
          const r = this.routes[prefix];
          const pathTemplate = r.path || '';
          const paramMatch = pathTemplate.match(/:(\w+)/);
          const nextParams = { ...params, _subPath: subPath };
          if (paramMatch) nextParams[paramMatch[1]] = subPath;
          return { ...r, _matchedKey: prefix, _useNormalized: true, _resolvedParams: nextParams, render: () => r.render(nextParams) };
        }
      }
    }

    return null;
  }

  buildPath(route, params) {
    let path = route.path || '';
    const pathKeys = pathParamKeys(path);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (!pathKeys.has(key)) return;
      if (value == null || value === '') {
        path = path.replace(`:${key}?`, '').replace(`:${key}`, '');
      } else {
        path = path.replace(`:${key}?`, encodeURIComponent(String(value))).replace(`:${key}`, encodeURIComponent(String(value)));
      }
    });
    path = path.replace(/\/:[^/]+\?/g, '').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    path = path.startsWith('/') ? path : '/' + path;
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (NAV_RESERVED.has(key) || key.startsWith('__') || pathKeys.has(key)) return;
      if (value == null || value === '' || typeof value === 'object') return;
      qs.set(key, String(value));
    });
    const search = qs.toString();
    return search ? `${path}?${search}` : path;
  }

  /**
   * Keep screens mounted. Each route gets its own scroll slot so going back
   * restores position (React Navigation / Expo Router style, not React web).
   */
  _prepareScreenHost(container) {
    if (!container || container._swScreenHost) return;
    container._swScreenHost = true;
    const style = container.style;
    if (!style.position || style.position === 'static') style.position = 'relative';
    style.overflow = 'hidden';
    if (!style.height && !style.minHeight) style.height = '100%';
  }

  _styleScreenSlot(slot) {
    slot.style.cssText = [
      'position:absolute',
      'inset:0',
      'width:100%',
      'height:100%',
      'overflow:auto',
      'overflow-x:hidden',
      '-webkit-overflow-scrolling:touch',
      'overscroll-behavior:contain',
      'box-sizing:border-box',
      'padding-bottom:var(--sw-screen-pad-bottom, 0px)',
      'background:var(--white_background, var(--sw-screen-bg, #fff))'
    ].join(';');
  }

  _finishHideScreenSlot(slot, cached) {
    if (!slot) return;
    if (cached) cached.scrollTop = slot.scrollTop;
    slot.setAttribute('data-sw-active', 'false');
    slot.setAttribute('aria-hidden', 'true');
    slot.inert = true;
    slot.style.display = 'none';
    slot.style.visibility = 'hidden';
    slot.style.pointerEvents = 'none';
    slot.style.zIndex = '0';
  }

  _hideScreenSlot(slot, cached) {
    if (!slot) return;
    const el = cached?.element || slot.firstElementChild;
    const outName = applyScreenNavAnim(el, 'out');
    if (!outName) {
      this._finishHideScreenSlot(slot, cached);
      return;
    }
    slot.setAttribute('data-sw-leaving', '');
    slot.inert = true;
    slot.style.pointerEvents = 'none';
    slot.style.zIndex = '0';
    waitForNavAnim(el).then(() => {
      if (!slot.hasAttribute('data-sw-leaving')) return;
      slot.removeAttribute('data-sw-leaving');
      this._finishHideScreenSlot(slot, cached);
    });
  }

  _showScreenSlot(slot, cached) {
    if (!slot) return;
    slot.removeAttribute('data-sw-leaving');
    slot.setAttribute('data-sw-active', 'true');
    slot.removeAttribute('aria-hidden');
    slot.inert = false;
    slot.style.display = 'block';
    slot.style.visibility = 'visible';
    slot.style.pointerEvents = 'auto';
    slot.style.zIndex = '1';
    const el = cached?.element || slot.firstElementChild;
    applyScreenNavAnim(el, 'in');
    const top = cached?.scrollTop || 0;
    requestAnimationFrame(() => {
      slot.scrollTop = top;
    });
  }

  _showScreen(container, cacheKey, screenContent, params = {}, options = {}) {
    if (!container) return;
    this._prepareScreenHost(container);

    Array.from(container.children).forEach((child) => {
      const cachedChild = [...this._screenCache.values()].find((entry) => entry.slot === child);
      this._hideScreenSlot(child, cachedChild);
    });

    const cached = this._screenCache.get(cacheKey);
    if (cached?.slot && container.contains(cached.slot)) {
      this._showScreenSlot(cached.slot, cached);
      const el = cached.element;
      cached.params = params;
      if (!options.reuseParams && el && typeof encodeData === 'function') {
        const usesProps = el.hasAttribute?.('data')
          || el._propsRaw !== undefined
          || el.constructor?.props === 'encoded';
        if (usesProps) {
          try { el.setAttribute('data', encodeData(params)); } catch (_) {}
        }
      }
      return el;
    }

    const slot = document.createElement('div');
    slot.setAttribute('data-sw-screen', cacheKey);
    slot.setAttribute('role', 'group');
    this._styleScreenSlot(slot);
    slot.innerHTML = typeof screenContent === 'string' ? screenContent : '';

    const screenElement = slot.firstElementChild || slot;
    if (screenElement !== slot) {
      screenElement.setAttribute('data-route-key', cacheKey);
    }

    const entry = { slot, element: screenElement, params, scrollTop: 0 };
    this._screenCache.set(cacheKey, entry);
    container.appendChild(slot);
    this._showScreenSlot(slot, entry);
    return screenElement;
  }

  renderScreen(fullRoute, additionalProps = {}) {
    const normalized = fullRoute.startsWith('/') ? fullRoute.substring(1) : fullRoute;
    const [routeName, ...dynamicSegments] = normalized.split('/');
    const dynamicParams = {};

    if (dynamicSegments.length > 0) {
      const routePattern = Object.keys(this.routes).find((pattern) =>
        pattern.startsWith(routeName) && pattern.includes(':')
      );

      if (routePattern) {
        const patternSegments = routePattern.split('/');
        patternSegments.forEach((segment, index) => {
          if (segment.startsWith(':')) {
            const paramName = segment.slice(1);
            dynamicParams[paramName] = dynamicSegments[index - 1];
          }
        });
      }
    }

    const params = { ...additionalProps, ...dynamicParams };
    const route = this.findRoute(normalized, params);
    if (!route) return null;

    const guarded = this._maybeGuard(route, normalized);
    if (guarded) return guarded;

    const resolvedKey = route._matchedKey || normalized;
    const effectiveParams = route._resolvedParams || params;
    const fullPath = this.buildPath(route, effectiveParams);
    const normalizedRoute = route._useNormalized ? normalized : resolvedKey;
    const routeInfo = { normalizedRoute, route, fullPath, params: effectiveParams };
    const containerFromCallback = typeof this.onRouteChange === 'function' ? this.onRouteChange(routeInfo) : null;
    const container = containerFromCallback || this.containerEl;
    const screenContent = typeof route.render === 'function' ? route.render(effectiveParams) : route.render;

    if (this.updateTitleCallback) this.updateTitleCallback(normalized);
    const cacheKey = route.cacheKey || normalizedRoute;
    // cacheKey reuses one instance across param changes (e.g. /home and /home/Travel).
    if (container) this._showScreen(container, cacheKey, screenContent, effectiveParams, { reuseParams: !!route.cacheKey });
    const baseTitle = route.title || '';
    document.title = this.titlePrefix ? (baseTitle ? `${this.titlePrefix} - ${baseTitle}` : this.titlePrefix) : baseTitle;

    return routeInfo;
  }

  navigate(fullRoute, additionalProps = {}) {
    const split = splitHref(fullRoute);
    const normalized = this.resolveNavigateTarget(split.href);
    const additional = { ...split.query, ...additionalProps };
    const route = this.findRoute(normalized, additional);
    if (!route) return this.renderNotFound(normalized, additional);

    const guarded = this._maybeGuard(route, normalized);
    if (guarded) return guarded;

    if (this._lockedRoute && normalized !== this._lockedRoute) {
      this._lockedRoute = null;
    }

    const inferredParams = this.extractParamsFromRoute(normalized, route);
    const nextParams = { ...inferredParams, ...additional };
    const fullPath = this.buildPath(route, nextParams);
    if (String(fullPath).includes(':')) return null;
    history.pushState({ route: normalized, params: nextParams }, '', fullPath);

    this._skipGuard += 1;
    try {
      return this.renderScreen(normalized, nextParams);
    } finally {
      this._skipGuard = Math.max(0, this._skipGuard - 1);
    }
  }

  redirect(fullRoute, additionalProps = {}) {
    return this.navigate(fullRoute, additionalProps);
  }

  replace(fullRoute, additionalProps = {}) {
    const split = splitHref(fullRoute);
    const normalized = this.resolveNavigateTarget(split.href);
    const additional = { ...split.query, ...additionalProps };
    const route = this.findRoute(normalized, additional);
    if (!route) return this.renderNotFound(normalized, additional);

    const inferredParams = this.extractParamsFromRoute(normalized, route);
    const nextParams = { ...inferredParams, ...additional };

    const wipeHistory = !!(nextParams && nextParams.__wipeHistory);
    if (wipeHistory) {
      delete nextParams.__wipeHistory;
      this._wipeProtectedHistory();
    }

    const guarded = this._maybeGuard(route, normalized);
    if (guarded) return guarded;

    const urlOverride = nextParams && typeof nextParams.__url === 'string' ? nextParams.__url : null;
    if (urlOverride) delete nextParams.__url;

    const fullPath = urlOverride || this.buildPath(route, nextParams);
    if (String(fullPath).includes(':')) return null;

    const lockHistory = !!(nextParams && nextParams.__lockHistory);
    if (lockHistory) {
      delete nextParams.__lockHistory;
      this._lockedRoute = normalized;
    } else if (this._lockedRoute && normalized !== this._lockedRoute) {
      this._lockedRoute = null;
    }

    history.replaceState({ route: normalized, params: nextParams }, '', fullPath);
    this._skipGuard += 1;
    try {
      return this.renderScreen(normalized, nextParams);
    } finally {
      this._skipGuard = Math.max(0, this._skipGuard - 1);
    }
  }

  handlePopState(event) {
    if (consumeModalBack(event)) return;
    if (this._lockedRoute) {
      const currentPath = window.location.pathname || '/';
      const currentRouting = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
      const lockedRouting = this._lockedRoute;

      if (currentRouting !== lockedRouting) {
        return this.replace(lockedRouting, { __lockHistory: true, __wipeHistory: true });
      }
    }

    const fullPath = window.location.pathname;
    const routingPath = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
    if (routingPath) {
      const target = this.resolveNavigateTarget(routingPath);
      const fromState = (event.state && event.state.params) ? event.state.params : {};
      const info = this.renderScreen(target, { ...locationQuery(), ...fromState });
      if (!info) return this.renderNotFound(routingPath, {});
      return info;
    }
    const targetRoute = this.resolveNavigateTarget(this.defaultRoute);
    if (targetRoute) return this.navigate(targetRoute, {});
    return this.renderNotFound('', {});
  }

  go_back() {
    window.history.back();
  }

  /**
   * Drop cached screen/layout instances so they remount on the next visit.
   * Omit route (or pass '*') to clear everything.
   */
  reset(route, params = {}) {
    if (route == null || route === '' || route === '*') {
      this.clearScreenCache();
      return null;
    }
    const normalized = String(route).startsWith('/') ? String(route).substring(1) : String(route);
    this.clearScreenCache(normalized);
    this.clearScreenCache(`layout:${normalized}`);
    const rec = this.routes[normalized];
    if (rec?.cacheKey) this.clearScreenCache(rec.cacheKey);
    const target = this.resolveNavigateTarget(normalized);
    if (this.findRoute(target, params)) return this.replace(target, params);
    return null;
  }

  /**
   * Clear the screen cache. Useful for forcing a fresh render of all screens.
   * @param {string} [cacheKey] - Optional specific cache key to clear. If omitted, clears all.
   */
  clearScreenCache(cacheKey) {
    if (cacheKey) {
      const cached = this._screenCache.get(cacheKey);
      cached?.slot?.remove();
      this._screenCache.delete(cacheKey);
    } else {
      this._screenCache.forEach((cached) => cached.slot?.remove());
      this._screenCache.clear();
    }
  }
}
