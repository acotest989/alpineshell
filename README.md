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
- `notify(text, type)`, `dismiss()`, `message` — see below.
- `form(values)`, `fieldError(fields)` — imported rather than inherited; see below.
- `partials.<name>` — the markup you listed, ready for `x-html`.
- whatever you passed as `app`.

Also exported: `http` (fetch wrapper — auto JSON, throws `HttpError` carrying the server's body, timeouts, query params), `errorMessage(err, fallback)`, `setPageTitle(name)`, `consumeRedirect()`.

## Saying something

```js
this.notify('Saved.', 'success');
this.notify('Could not reach the server.', 'error');
this.notify('A new link is on its way.');       // 'info' by default
```

State is one object, `message` — `{ text, type }` — and your toast partial decides how each type looks:

```html
<div x-show="message.text" :class="message.type === 'error' ? 'bg-red-200' : 'bg-gray-900 text-white'">
  <p x-text="message.text"></p>
  <button type="button" @click="dismiss()">Close</button>
</div>
```

An **error stays** until the visitor dismisses it or navigates; every other type clears itself after a few seconds. That asymmetry is the point: a failure is something to act on, an acknowledgement is something to notice.

`errMsg` still works — assigning to it is `notify(text, 'error')`, and reading it returns errors only, so a toast written before `message` existed can never paint a success as a failure.

## Forms

Every form ends up writing the same sequence: refuse a second submit, validate locally, raise a pending flag, put the server's complaints back on the right fields, lower the flag. `form()` is that sequence. Spread it into a page and add the two parts only the page can know:

```js
import { form } from 'alpineshell';

export const loginPage = () => ({
  ...form({ email: '', password: '' }),

  validate() {                                   // optional; { field: message }
    return { email: this.values.email ? '' : 'Required.' };
  },

  async save() {                                 // `this` is the page
    await this.signIn(this.values.email, this.values.password);
    this.goTo('/');
  },
});
```

```html
<form @submit.prevent="submit()" novalidate>
  <input x-model="values.email" @input="clear('email')" :disabled="pending" class="input">
  <p x-show="errors.email" x-text="errors.email"></p>

  <p x-show="error" x-text="error" role="alert"></p>
  <button type="submit" :disabled="pending" x-text="pending ? 'Signing in…' : 'Sign in'"></button>
</form>
```

You get `values`, `errors`, `error`, `pending`, `submit()`, `clear(field)` and `invalid()`. Validation runs before anything leaves the browser; if it fails, no request is made at all.

**Errors land where they belong.** Some things only the server knows — that an address is taken, that a password is wrong. A service says which field by throwing `fieldError({ email: 'That address already has an account.' })`, and `submit()` puts each message on its field. An error without `.fields` becomes the form-wide `error` instead:

```js
import { fieldError } from 'alpineshell';

// in your service, where you already know your backend's error shape
throw fieldError({ email: 'That address already has an account.' });
```

A plain `Error` is treated as a sentence somebody wrote for the visitor and is shown as-is, quietly. Anything else — an `HttpError`, an SDK error, a `TypeError` — also gets logged with its stack, because that one is a failure rather than an outcome.

To keep behaviour of your own around a failure, catch it in `save()` and rethrow:

```js
async save() {
  try {
    await this.signIn(this.values.email, this.values.password);
  } catch (err) {
    this.values.password = '';
    this.$nextTick(() => this.$refs.password.focus());
    throw err; // the message is still form()'s job
  }
}
```

**One form per page.** A page with two independent forms writes them out by hand; this is a mixin, not a component, and it can only be spread once.

> **Do not put a getter in anything that gets spread** — not in `form()`'s page, not in the `app` object. A spread *calls* a getter and copies the answer, so it silently freezes at whatever it returned that first time. Use a method.

## Focus, on markup that was injected

`autofocus` does nothing here: the browser honours it while parsing a document, and these pages arrive afterwards. `$refs` will not help either if the field lives inside `x-if`, because the component's `init()` runs before that block exists.

The element focuses itself instead:

```html
<input x-init="$el.focus()" class="input">
```

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

## Tests

```bash
node --test
```

No runner to install, no configuration: Node has had one built in for a while, and `http.js` and `form.js` are plain modules that never needed a browser to be exercised. `fetch` is swapped for a recording stub, and a form is tested by spreading it into an object the way a page would.

The rest — `router.js` and `root.js` — is not covered, because it only means anything inside a document with Alpine and Pinecone in it. That is honest rather than ideal: those two are exercised by the apps, by hand.

Worth knowing if you add a test that waits on a timeout: `AbortSignal.timeout` uses an unref'd timer, so Node will drain the event loop and cancel the file unless something else holds it open.

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
