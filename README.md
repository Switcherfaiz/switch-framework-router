<p align="center">
  <img src="https://raw.githubusercontent.com/Switcherfaiz/switch-framework-router/master/logo.svg" alt="Switch Framework" width="180" />
</p>

# switch-framework-router

Layouts and navigation for [Switch Framework](https://github.com/Switcherfaiz/switch-framework): `RootLayout`, `TabLayout`, `StackLayout`, `navigate`, `Link`, params, and boot. Same grouping as [Expo Router](https://docs.expo.dev/router/introduction/) (`Stack` / `Tabs` live in `expo-router`).

`create-switch-framework-app` already installs this next to `switch-framework` and `switch-framework-backend`. Do **not** add `switch-framework-router` to `switchFramework.imports` — that list is for third-party packs. The router is part of the SDK.

```javascript
import { RootLayout, TabLayout, StackLayout } from 'switch-framework-router';
import { navigate, useParams, useScreenFocus } from 'switch-framework-router';
```

`from 'switch-framework/router'` is the same package (subpath alias) and still works in 0.3.x.

The implementation lives in this package (`router.js`, `layouts/`, `registerScreens.js`, `startApp.js`). `switch-framework` still re-exports layouts and navigation from the main barrel for this minor (deprecated — removed in the next version).

Navigation throws (`navigate`, `replace`, `reset`, `wipeTo`, history) report to the error overlay as **Navigation failed**. Expected missing routes still render `+not-found` and do not open the overlay.

## Install

```bash
npx create-switch-framework-app my-app
```

For an existing app (the CLI already does this on new projects):

```bash
npm i switch-framework-router
```

Same version line as `switch-framework` (0.3.0 / 0.3.0). Release them together.

## Related

- [switch-framework](https://github.com/Switcherfaiz/switch-framework)
- [switch-framework-backend](https://github.com/Switcherfaiz/switch-framework-backend)
- [switch-framework-icons](https://github.com/Switcherfaiz/switch-framework-icons)
- [create-switch-framework-app](https://github.com/Switcherfaiz/create-switch-framework-app)
