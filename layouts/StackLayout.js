import { LayoutNavigator } from './LayoutNavigator.js';
import { ensureComponentDefined, assertExpoConventions } from '../registerScreens.js';
import { flattenLayoutTree, buildLayoutIndex, getLayoutChildren, inferTabMatches } from './layoutTree.js';
import { startApp, hasAppStarted } from '../startApp.js';
import { initTheme } from 'switch-framework/themes';
import { subscribeState, getState } from 'switch-framework/state-managers/index.js';
import { installOverlay, reportError } from 'switch-framework/overlay';

export class StackLayout extends LayoutNavigator {
  static tag = 'sw-stack-layout';
  static screens = [];
  static stackScreens = [];
  static tabsLayout = null;
  static splash = 'sw-starter-splash';
  static initialScreen = '';
  static initialRoute = 'index';
  static headerShown = false;

  static render() { return ''; }
  static styleSheet() { return ''; }

  static getLayoutConfig() {
    return {
      name: this.tag || 'sw-stack-layout',
      screenName: this.screenName || '',
      layout: 'stack',
      initialScreen: this.initialScreen || this.initialRoute || '',
      stackrender: this.render(),
      stackstyleSheet: this.styleSheet()
    };
  }

  static startApp(registers) {
    initTheme();
    return startApp(this.getAppLayout(), registers);
  }

  static findLayoutClass(mod) {
    if (!mod || mod.default != null) return null;
    const values = Object.values(mod).filter((v) => typeof v === 'function');
    const root = values.find((v) => v?.isRootLayout && v.prototype instanceof StackLayout);
    if (root) return root;
    return values.find((v) => v !== StackLayout && !v.isRootLayout && v.prototype instanceof StackLayout) || null;
  }

  static findLayoutModuleUrl() {
    if (typeof document === 'undefined') return '/app/_layout.js';
    const scripts = [...document.querySelectorAll('script[type="module"][src]')];
    const match = scripts.find((s) => /\/app\/_layout\.js(\?|#|$)/.test(s.src));
    return match?.src || '/app/_layout.js';
  }

  static async autoBootFromPage() {
    if (hasAppStarted()) return;
    if (typeof document === 'undefined') return;
    if (!document.querySelector('sw-app-initial')) return;

    try {
      const mod = await import(StackLayout.findLayoutModuleUrl());
      if (hasAppStarted()) return;

      const Layout = StackLayout.findLayoutClass(mod);
      if (Layout) Layout.startApp();
    } catch (err) {
      reportError(err, { title: 'Boot failed' });
    }
  }

  static scheduleAutoBoot() {
    if (StackLayout._autoBootScheduled || typeof document === 'undefined') return;
    StackLayout._autoBootScheduled = true;
    installOverlay();

    const run = () => StackLayout.autoBootFromPage();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      queueMicrotask(run);
    }
  }

  static _autoBootScheduled = false;

  static getAppLayout(validate = true) {
    ensureComponentDefined(this);
    const tree = flattenLayoutTree(this);
    const layoutIndex = buildLayoutIndex(tree.layouts);
    const screens = tree.leaves;
    const tabsNode = tree.layouts.find((n) => n.kind === 'tabs');
    const resolvedTabsLayout = tabsNode?.Cls
      ? {
          ...tabsNode.Cls.getLayoutConfig(),
          tabs: inferTabMatches(tabsNode.Cls),
          name: tabsNode.tag,
          screens: getLayoutChildren(tabsNode.Cls)
        }
      : null;

    if (validate) {
      assertExpoConventions({
        tabsLayout: resolvedTabsLayout,
        stackScreens: screens.filter((s) => s.layout !== 'tabs'),
        tabScreens: screens.filter((s) => s.layout === 'tabs')
      });
    }

    const initFn = this.init;
    const stackLayoutConfig = this.getLayoutConfig();
    const initialScreen = this.initialScreen || this.initialRoute || 'index';

    return {
      splash: this.splash || 'sw-starter-splash',
      initialRoute: initialScreen,
      screens,
      layoutIndex,
      layoutNodes: tree.layouts,
      async init(api) {
        const result = typeof initFn === 'function' ? await initFn.call(this, api) : {};
        if (api?.globalStates) {
          if (resolvedTabsLayout) api.globalStates.setState({ tabsLayout: resolvedTabsLayout });
          api.globalStates.setState({
            stackLayout: stackLayoutConfig,
            layoutIndex,
            layoutNodes: tree.layouts
          });
        }
        return {
          ...result,
          screens,
          layoutIndex,
          initialRoute: result?.initialRoute ?? result?.initialScreen ?? initialScreen
        };
      }
    };
  }
}

StackLayout.scheduleAutoBoot();

StackLayout.prototype.render = function render() {
  if (!this.constructor.headerShown) return '';
  return `
    <header class="sw-stack-header" data-sw-stack-header>
      <button type="button" class="sw-stack-back" data-sw-back aria-label="Back">
        <span aria-hidden="true">‹</span>
      </button>
      <h1 class="sw-stack-title" data-sw-stack-title></h1>
    </header>
  `;
};

StackLayout.prototype.styleSheet = function styleSheet() {
  return `
    :host:has(.sw-stack-header) {
      display: flex;
      flex-direction: column;
    }
    .sw-stack-header {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 52px;
      padding: 8px 12px;
      box-sizing: border-box;
      background: var(--white_background, #fff);
      border-bottom: 1px solid var(--border_light, #f0f0f0);
      color: var(--main_text, #111);
    }
    .sw-stack-back {
      border: none;
      background: transparent;
      color: inherit;
      font-size: 28px;
      line-height: 1;
      width: 40px;
      height: 40px;
      border-radius: 999px;
      cursor: pointer;
    }
    .sw-stack-back[hidden] { display: none !important; }
    .sw-stack-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    :host:has(.sw-stack-header) [data-sw-screens] {
      flex: 1;
      min-height: 0;
    }
  `;
};

StackLayout.prototype.onMount = function onMount() {
  this._syncStackHeader();
  try {
    const unsub = subscribeState('activeRoute', () => this._syncStackHeader(), { immediate: false });
    this.addOnDestroy(unsub);
  } catch (_) {}
  this.listener('[data-sw-back]', 'click', (e) => {
    e.preventDefault();
    const goBackFn = globalThis.globalStates?.getState?.('go_back');
    if (typeof goBackFn === 'function') goBackFn();
    else window.history.back();
  });
};

StackLayout.prototype._syncStackHeader = function _syncStackHeader() {
  const header = this.select('[data-sw-stack-header]');
  if (!header) return;
  const route = (() => {
    try { return getState('activeRoute') || ''; } catch (_) { return ''; }
  })();
  const titleEl = this.select('[data-sw-stack-title]');
  const back = this.select('[data-sw-back]');
  const defined = globalThis.globalStates?.getState?.('definedRoutes') || [];
  const rec = defined.find((r) => r.route === route);
  if (titleEl) titleEl.textContent = rec?.title || this.constructor.title || '';
  const initial = String(this.constructor.initialScreen || this.constructor.initialRoute || '');
  if (back) back.hidden = !initial || route === initial;
};
