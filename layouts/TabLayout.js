/**
 * TabLayout – navigator with a tab bar.
 * render() is chrome only (tab bar, header). Screens inject into
 * .tabcontainer / #content if present, otherwise the built-in host.
 */
import { LayoutNavigator } from './LayoutNavigator.js';

export class TabLayout extends LayoutNavigator {
  static tag = 'sw-tabs-layout';
  static screenName = '';
  static initialTab = '';
  static tabs = [];
  static options = {};
  static screens = [];

  static getLayoutConfig() {
    return {
      name: this.tag || 'sw-tabs-layout',
      screenName: this.screenName || '(tabs)',
      initialTab: this.initialTab || (this.tabs?.[0]?.name ?? ''),
      tabs: this.tabs || [],
      options: this.options || {},
      screens: this.screens || [],
      layout: 'tabs'
    };
  }
}
