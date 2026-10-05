import { ensureComponentDefined } from '../registerScreens.js';
import { reportError } from 'switch-framework/overlay';

export function isLayoutClass(Cls) {
  return typeof Cls === 'function' && typeof Cls.getLayoutConfig === 'function';
}

export function layoutKind(Cls) {
  if (!isLayoutClass(Cls)) return null;
  try {
    const cfg = Cls.getLayoutConfig();
    if (cfg?.layout === 'tabs' || cfg?.layout === 'stack') return cfg.layout;
  } catch (_) {}
  return Array.isArray(Cls.tabs) ? 'tabs' : 'stack';
}

export function getLayoutScreenName(Cls) {
  if (!Cls) return '';
  if (Cls.screenName) return String(Cls.screenName);
  if (layoutKind(Cls) === 'tabs') return '(tabs)';
  return String(Cls.tag || '');
}

export function getLayoutChildren(Cls) {
  if (!Cls) return [];
  const out = [];
  const seen = new Set();
  const add = (item) => {
    if (!item || seen.has(item)) return;
    seen.add(item);
    out.push(item);
  };

  if (Cls.tabsLayout) add(Cls.tabsLayout);
  const screens = Array.isArray(Cls.screens) ? Cls.screens : [];
  screens.forEach(add);
  const stackScreens = Array.isArray(Cls.stackScreens) ? Cls.stackScreens : [];
  stackScreens.forEach(add);
  return out;
}

function childId(child) {
  if (isLayoutClass(child)) return getLayoutScreenName(child);
  if (child?.screenName) return String(child.screenName);
  try {
    return String(child.getScreenConfig?.()?.name || '');
  } catch (_) {
    return '';
  }
}

function findChildById(children, id) {
  const want = String(id || '');
  if (!want) return null;
  return children.find((child) => childId(child) === want)
    || children.find((child) => {
      if (isLayoutClass(child)) return false;
      const path = String(child.path || child.getScreenConfig?.()?.path || '').replace(/^\//, '');
      return path === want;
    })
    || null;
}

export function resolveInitialLeafName(Cls, seen = new Set()) {
  if (!isLayoutClass(Cls) || seen.has(Cls)) return '';
  seen.add(Cls);
  const children = getLayoutChildren(Cls);
  if (!children.length) return '';

  let child = null;
  if (layoutKind(Cls) === 'tabs') {
    const tabName = Cls.initialTab || Cls.tabs?.[0]?.name || '';
    const tab = (Cls.tabs || []).find((t) => t?.name === tabName);
    child = findChildById(children, tabName)
      || findChildById(children, String(tab?.path || '').replace(/^\//, ''))
      || children[0];
  } else {
    const id = Cls.initialScreen || Cls.initialRoute || childId(children[0]);
    child = findChildById(children, id) || children[0];
  }

  if (!child) return '';
  if (isLayoutClass(child)) return resolveInitialLeafName(child, seen);
  return childId(child);
}

function layoutMeta(Cls) {
  ensureComponentDefined(Cls);
  return {
    Cls,
    tag: Cls.tag,
    screenName: getLayoutScreenName(Cls),
    kind: layoutKind(Cls) || 'stack',
    initialTab: Cls.initialTab || '',
    initialScreen: Cls.initialScreen || Cls.initialRoute || ''
  };
}

export function flattenLayoutTree(RootCls, ancestors = []) {
  const leaves = [];
  const layouts = [];
  if (!isLayoutClass(RootCls)) return { leaves, layouts };

  const self = layoutMeta(RootCls);
  layouts.push(self);
  const chain = [...ancestors, self];
  const nearest = self.kind === 'tabs' || chain.some((n) => n.kind === 'tabs') ? 'tabs' : 'stack';

  for (const child of getLayoutChildren(RootCls)) {
    if (isLayoutClass(child)) {
      if (child.isRootLayout) {
        reportError(`RootLayout cannot be nested. Skipping ${child.tag || child.name || 'layout'}.`, { title: 'Convention' });
        continue;
      }
      const nested = flattenLayoutTree(child, chain);
      leaves.push(...nested.leaves);
      layouts.push(...nested.layouts);
      continue;
    }

    ensureComponentDefined(child);
    const cfg = typeof child.getScreenConfig === 'function'
      ? child.getScreenConfig()
      : { name: child.screenName, path: child.path, title: child.title, tag: child.tag };
    if (!cfg?.name) continue;
    leaves.push({
      ...cfg,
      layout: cfg.layout || nearest,
      layoutChain: chain,
      Cls: child
    });
  }

  return { leaves, layouts };
}

export function buildLayoutIndex(layouts = []) {
  const map = new Map();
  for (const node of layouts) {
    if (!node?.screenName) continue;
    if (!map.has(node.screenName)) map.set(node.screenName, node);
  }
  return map;
}

export function leafNamesUnder(Cls, seen = new Set()) {
  if (!Cls) return [];
  if (!isLayoutClass(Cls)) {
    const name = childId(Cls);
    return name ? [name] : [];
  }
  if (seen.has(Cls)) return [];
  seen.add(Cls);
  const names = [];
  for (const child of getLayoutChildren(Cls)) {
    names.push(...leafNamesUnder(child, seen));
  }
  return names;
}

function findTabChild(tab, children) {
  const name = String(tab?.name || '');
  const path = String(tab?.path || '').replace(/^\//, '');
  return children.find((c) => {
    if (isLayoutClass(c)) {
      const id = getLayoutScreenName(c);
      const initial = String(c.initialScreen || c.initialTab || '');
      const leaves = leafNamesUnder(c);
      return id === name
        || initial === name
        || leaves.some((n) => n === name || n.split('/')[0] === name);
    }
    return childId(c) === name || String(c.path || '').replace(/^\//, '') === path;
  }) || null;
}

/** Union each tab.match with the leaves of the child that belongs to that tab. */
export function inferTabMatches(tabsCls) {
  const tabs = Array.isArray(tabsCls?.tabs) ? tabsCls.tabs : [];
  if (!tabs.length) return tabs;
  const children = getLayoutChildren(tabsCls);
  return tabs.map((tab) => {
    const name = String(tab?.name || '');
    const child = findTabChild(tab, children);
    const inferred = [];
    if (name) inferred.push(name);
    if (child) inferred.push(...leafNamesUnder(child));
    const existing = Array.isArray(tab?.match) ? tab.match.map(String) : [];
    const match = [...new Set([...existing, ...inferred].filter(Boolean))];
    return { ...tab, match };
  });
}
