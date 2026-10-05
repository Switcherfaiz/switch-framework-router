<p align="center">
  <img src="https://raw.githubusercontent.com/Switcherfaiz/switch-framework-router/master/logo.svg" alt="Switch Framework" width="180" />
</p>

# switch-framework-router

Layouts and navigation for [Switch Framework](https://github.com/Switcherfaiz/switch-framework): `RootLayout`, `TabLayout`, `StackLayout`, `navigate`, `Link`, params, and boot.

`create-switch-framework-app` already installs this next to `switch-framework` and `switch-framework-backend`. Do **not** add `switch-framework-router` to `switchFramework.imports` — that list is for third-party packs. The router is part of the SDK.

Write the Expo-style specifier. Do not import this package name in app code:

```javascript
import { RootLayout, TabLayout, StackLayout } from 'switch-framework/router';
import { navigate, useParams, useScreenFocus } from 'switch-framework/router';
```

`switch-framework` still re-exports layouts for this minor. New screens and layouts should use `/router`.

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
