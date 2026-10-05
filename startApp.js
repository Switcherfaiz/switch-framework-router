import { registerFramework } from 'switch-framework/registerFramework.js';
import { initTheme } from 'switch-framework/themes';
import { installTapHighlightReset } from 'switch-framework/helpers/tapHighlight.js';
import { installOverlay, reportError } from 'switch-framework/overlay';

let _appStarted = false;

/** True once startApp has run (manually or via auto-boot). */
export function hasAppStarted() {
  return _appStarted;
}

export async function startApp(layout, registers) {
  _appStarted = true;
  installOverlay();
  registerFramework();

  initTheme();
  installTapHighlightReset();

  const root = document.querySelector('sw-app-initial');
  if (root && layout) {
    root.initialize(layout);
  }

  try {
    if (typeof registers === 'function') {
      Promise.resolve(registers()).catch((err) => {
        reportError(err, { title: 'Register failed' });
      });
    } else if (typeof registers === 'string' && registers) {
      import(registers).catch((err) => {
        reportError(err, { title: 'Register failed', file: registers });
      });
    }
  } catch (err) {
    reportError(err, { title: 'Register failed' });
  }

  return root;
}
