import { SwitchComponent } from 'switch-framework/registers/SwitchComponent.js';

/**
 * Shared host for StackLayout / TabLayout.
 * Chrome comes from render(); screens live in a framework outlet that
 * survives chrome rerenders. Legacy .tabcontainer / #content still win
 * if the user put them in render().
 */
export class LayoutNavigator extends SwitchComponent {
  styleSheet() {
    return `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
        box-sizing: border-box;
      }
      [data-sw-screens] {
        position: relative;
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
        flex: 1;
        overflow: hidden;
        background: var(--white_background, var(--sw-screen-bg, #fff));
      }
      [data-sw-screens] > [data-sw-active="false"]:not([data-sw-leaving]),
      .tabcontainer > [data-sw-active="false"]:not([data-sw-leaving]),
      #content > [data-sw-active="false"]:not([data-sw-leaving]) {
        display: none !important;
      }
      [data-sw-screens] > [data-sw-leaving],
      .tabcontainer > [data-sw-leaving],
      #content > [data-sw-leaving] {
        display: block !important;
        visibility: visible !important;
        pointer-events: none;
        z-index: 0;
      }
    `;
  }

  getContentContainer() {
    const root = this.shadowRoot;
    if (!root) return null;
    return root.querySelector('.tabcontainer')
      ?? root.querySelector('#content')
      ?? root.querySelector('[data-sw-screens]')
      ?? null;
  }

  _appendDefaultHost() {
    if (!this.shadowRoot || this.shadowRoot.querySelector('[data-sw-screens]')) return;
    const host = document.createElement('div');
    host.setAttribute('data-sw-screens', '');
    host.setAttribute('part', 'screens');
    this.shadowRoot.appendChild(host);
  }

  _runRenderAndMount() {
    const saved = this.shadowRoot?.querySelector('[data-sw-screens]');
    if (saved) saved.remove();
    super._runRenderAndMount();
    const userOutlet = this.shadowRoot?.querySelector('.tabcontainer, #content');
    if (saved && !userOutlet) {
      this.shadowRoot.appendChild(saved);
      return;
    }
    if (!userOutlet) this._appendDefaultHost();
  }
}
