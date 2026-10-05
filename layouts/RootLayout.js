import { StackLayout } from './StackLayout.js';

/**
 * App boot + the root stack. Auto-boot finds a subclass exported from app/_layout.js.
 * Never nest RootLayout under Stack or Tabs.
 */
export class RootLayout extends StackLayout {
  static isRootLayout = true;
  static tag = 'sw-root-layout';
}
