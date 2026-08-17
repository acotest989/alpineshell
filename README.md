# AlpineShell

Structure and conventions for [Alpine.js](https://alpinejs.dev) apps — routing, pages, partials and stores — **without a build step**. Alpine gives you reactivity; this gives the app a shape.

No package manager, nothing to compile: it is four ES modules loaded from a CDN.

Looking for a project to start from? [alpineshell-starter](https://github.com/acotest989/alpineshell-starter).

## Install

In your HTML, before any module script:

```html
<script type="importmap">
{
  "imports": {
    "alpineshell": "https://cdn.jsdelivr.net/gh/acotest989/alpineshell@v0.3.0/index.js"
  }
}
</script>
<script type="module" src="/main.js" defer></script>
```

Pin a tag. Branches are cached for hours, so `@main` will serve you yesterday's code without telling you.

## Use

```js
import { createApp } from 'alpineshell';

import { app } from './app.js';
import { homePage } from './pages/home.js';
import { session } from './stores/session.js';

createApp({
  routes: {
    notfound: '404',
    '/': 'home',
    '/login': { page: 'login', header: false, footer: false },
    '/products/:handle': 'product',
  },
  protected: ['/account'],
  titles: { 404: 'Page not found' },
  partials: ['toast'],
  pages: { homePage },
  stores: { session },
  app,
  theme: '/assets/theme.css',
  debug: true,
});
```

That call registers the plugins, the stores, the page components and a root component, wires the router, and injects your theme. Your `main.js` is the configuration and nothing else.

## What a route is

One line: a **page name**.

```js
'/products/:handle': 'product'
```

From that name AlpineShell derives the template (`/pages/product.html`) and the title (`Product`). The page's own markup names its component:

```html
<main x-data="productPage">…</main>
```

```js
export const productPage = () => ({
  async init() {
    this.product = await fetchProduct(this.$params.handle);
  },
});
```

A route needing different chrome takes an object instead: `{ page, header, footer }`, where `false` drops a partial and a string swaps it.

## Options

| Option | Default | Meaning |
|---|---|---|
| `routes` | `{}` | route pattern → page name, or `{ page, header, footer }` |
| `titles` | `{}` | page name → title; anything missing falls back to the name itself |
| `protected` | `[]` | route prefixes that require a session (`/admin` covers `/admin/users`) |
| `partials` | `[]` | partials **you** render with `x-html`, loaded into `app.partials` |
| `pages` | `{}` | component name → factory, registered as-is |
| `stores` | `{}` | store name → factory |
| `app` | `{}` | extra state and methods merged into the root component |
| `theme` | — | CSS fetched and injected as a `<style type="text/tailwindcss">` tag |
| `debug` | `false` | boot log, `window.dbg`, and warnings about misconfiguration |
| `pagesDir` | `/pages` | where `<page>.html` is looked up |
| `partialsDir` | `/partials` | where partials are looked up |
| `targetId` | `page` | element the router renders into |
| `header` / `footer` | `header` / `footer` | chrome around every page; `false` drops it |
| `loginPath` | `/login` | where the guard sends a signed-out visitor |
| `homePath` | `/` | fallback for redirects and `goBack()` |
| `siteName` | `<title>` | suffix after the page title |

Header and footer are **not** listed in `partials`: the router adds them to each route's template list, per route rather than globally.

## What you get in a component

Every page is nested in the root component, so these are one scope away:

- `goTo(path)`, `goBack()` — navigation from code. Links stay plain `<a href>`; the router intercepts clicks itself, which keeps Ctrl+click and keyboard behaviour intact.
- `errMsg` — set it and your toast partial shows. Cleared on every navigation.
- `partials.<name>` — the markup you listed, ready for `x-html`.
- whatever you passed as `app`.

Also exported: `http` (fetch wrapper — auto JSON, throws `HttpError` carrying the server's body, timeouts, query params), `errorMessage(err, fallback)`, `setPageTitle(name)`, `consumeRedirect()`.

## What it does that the router does not

On every navigation: resets scroll, moves focus to the new `<main>` so screen readers announce the page, sets the title, clears the previous error. A protected route with no session remembers where it bounced you from, so signing in returns you there.

## Session

`protected` expects an `Alpine.store('session')` with an `isAuthenticated` getter. Anything else is yours:

```js
export const session = () => ({
  user: Alpine.$persist(null).as('auth'),
  get isAuthenticated() { return this.user != null },
});
```

It has to be a store, not component data — the guard runs outside Alpine and needs a reactive handle.

## Dependencies

All from jsDelivr, all pinned to an exact version in `index.js` — a range would change your app without you touching it:

| | |
|---|---|
| [Alpine.js](https://alpinejs.dev) | 3.16.1 |
| `@alpinejs/persist` | 3.16.1 — must match Alpine |
| [Pinecone Router](https://github.com/rehhouari/pinecone-router) | 7.6.0 |
| [Tailwind CSS](https://tailwindcss.com) (browser build) | 4.3.3 |

Upgrading one of them is a release of this framework, not a decision an app makes.

## License

MIT
