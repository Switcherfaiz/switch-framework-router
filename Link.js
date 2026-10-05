import { SwitchComponent } from 'switch-framework/registers/SwitchComponent.js';
import {
  callNavigate,
  callReplace,
  isNewTabTarget,
  navActionParams,
  resolvePublicHref,
  splitHref
} from './navCall.js';

export class Link extends SwitchComponent {
  static tag = 'sw-link';
  static observedAttributes = ['data', 'href', 'target', 'replace', 'new-tab'];

  _navOpts() {
    const props = this.getProps() || {};
    const split = splitHref(this.getAttribute('href') || props.href || '');
    return {
      href: split.href,
      query: split.query,
      params: props.params || {},
      replace: this.hasAttribute('replace') || !!props.replace,
      lockHistory: this.hasAttribute('lock-history') || !!props.lockHistory,
      wipeHistory: this.hasAttribute('wipe-history') || !!props.wipeHistory,
      target: this.getAttribute('target') || props.target || '',
      newTab: this.hasAttribute('new-tab') || !!props.newTab
    };
  }

  onMount() {
    this.listener('a', 'click', (e) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const opts = this._navOpts();
      if (!opts.href) return;
      if (isNewTabTarget(opts.target, opts.newTab)) return;
      e.preventDefault();
      const params = navActionParams(opts);
      if (opts.replace) callReplace(opts.href, params);
      else callNavigate(opts.href, params);
    });
  }

  render() {
    const opts = this._navOpts();
    const path = resolvePublicHref(opts.href, { ...opts.query, ...opts.params });
    const blank = isNewTabTarget(opts.target, opts.newTab);
    const target = blank ? '_blank' : this._escapeAttr(opts.target);
    const rel = blank ? ' rel="noopener noreferrer"' : '';
    const targetAttr = target ? ` target="${target}"` : '';
    return `<a href="${this._escapeAttr(path)}"${targetAttr}${rel}><slot></slot></a>`;
  }

  _escapeAttr(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;');
  }

  styleSheet() {
    return `
      :host { display: inline-flex; cursor: pointer; pointer-events: none; }
      a {
        pointer-events: auto;
        color: inherit;
        text-decoration: inherit;
        font: inherit;
        cursor: inherit;
        display: flex;
        align-items: inherit;
        justify-content: inherit;
        gap: inherit;
        width: 100%;
        height: 100%;
      }
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('sw-link')) {
  customElements.define('sw-link', Link);
}
