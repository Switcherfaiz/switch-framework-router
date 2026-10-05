import { SwitchComponent } from 'switch-framework/registers/SwitchComponent.js';
import { callNavigate, callReplace, navActionParams } from './navCall.js';

export class Redirect extends SwitchComponent {
  static tag = 'sw-redirect';
  static observedAttributes = ['data', 'href'];

  _didGo = false;

  _navOpts() {
    const props = this.getProps() || {};
    const mode = String(this.getAttribute('mode') || props.mode || '').toLowerCase();
    const replace = mode === 'navigate' || mode === 'push'
      ? false
      : (this.hasAttribute('replace') || props.replace !== false);
    return {
      href: this.getAttribute('href') || props.href || '',
      params: props.params || {},
      replace,
      lockHistory: this.hasAttribute('lock-history') || !!props.lockHistory,
      wipeHistory: this.hasAttribute('wipe-history') || !!props.wipeHistory
    };
  }

  onMount() {
    if (this._didGo) return;
    this._didGo = true;
    queueMicrotask(() => this._go());
  }

  _go() {
    const opts = this._navOpts();
    if (!opts.href) return;
    const params = navActionParams(opts);
    if (opts.replace) callReplace(opts.href, params);
    else callNavigate(opts.href, params);
  }

  render() {
    return '';
  }

  styleSheet() {
    return `
      :host { display: none !important; }
    `;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('sw-redirect')) {
  customElements.define('sw-redirect', Redirect);
}
