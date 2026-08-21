import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDom, fakeMain, captureConsole } from './dom.js';
import { configureRouter, consumeRedirect, setPageTitle, router } from '../router.js';

// The config is module state, the way one app has one router. Every test passes the
// whole of it rather than a patch, so nothing an earlier test set can survive.
const BASE = {
  routes: {},
  protected: [],
  titles: {},
  siteName: 'Shop',
  loginPath: '/login',
  homePath: '/',
  pagesDir: '/pages',
  partialsDir: '/partials',
  targetId: 'page',
  header: 'header',
  footer: 'footer',
  debug: false,
};

function setup(options = {}, dom = {}) {
  const installed = installDom(dom);
  configureRouter({ ...BASE, ...options });
  return installed;
}

// The guards are private to the module and reach the outside only by being handed to
// Pinecone. Taking them back out of that call is how a test gets to hold one.
const handlers = (pinecone) => {
  const [normalizeIndex, authGuard, titleHandler] = pinecone.calls.settings.globalHandlers;
  return { normalizeIndex, authGuard, titleHandler };
};

// what Pinecone passes a handler
const ctx = (path, routePath = path) => ({ path, route: { path: routePath } });

// watchRouter() is spread into the root component, so a test is that component.
const component = () => ({ ...router, errMsg: '' });

// --- routes ---

test('a route becomes header, page and footer templates', () => {
  const { pinecone } = setup({ routes: { '/': 'home' } });
  router.initRouter();

  assert.deepEqual(pinecone.calls.routes, [
    {
      path: '/',
      templates: ['/partials/header.html', '/pages/home.html', '/partials/footer.html'],
    },
  ]);
});

test('false drops a partial and a string swaps it', () => {
  const { pinecone } = setup({
    routes: {
      '/login': { page: 'login', header: false, footer: false },
      '/checkout': { page: 'checkout', header: 'checkout-header' },
    },
  });
  router.initRouter();

  assert.deepEqual(pinecone.calls.routes[0].templates, ['/pages/login.html']);
  assert.deepEqual(pinecone.calls.routes[1].templates, [
    '/partials/checkout-header.html',
    '/pages/checkout.html',
    '/partials/footer.html',
  ]);
});

test('the render target and click handling go to the router as settings', () => {
  const { pinecone } = setup({ targetId: 'app' });
  router.initRouter();

  assert.equal(pinecone.calls.settings.targetID, 'app');
  assert.equal(pinecone.calls.settings.handleClicks, true);
});

test('a protected prefix with no route behind it is a warning', () =>
  captureConsole('warn', (warnings) => {
    setup({ routes: { '/': 'home' }, protected: ['/account'], debug: true });
    router.initRouter();

    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /\/account/);
  }));

test('with debug off the same misconfiguration is silent', () =>
  captureConsole('warn', (warnings) => {
    setup({ routes: { '/': 'home' }, protected: ['/account'] });
    router.initRouter();

    assert.equal(warnings.length, 0);
  }));

// --- the guard ---

test('a protected route without a session sends you to sign in, and remembers where', () => {
  const { pinecone } = setup(
    { protected: ['/account'], routes: { '/account': 'account' } },
    { session: { isAuthenticated: false } },
  );
  router.initRouter();

  handlers(pinecone).authGuard(ctx('/account/orders'));

  assert.deepEqual(pinecone.calls.navigated, ['/login'], 'the prefix covers what is under it');
  assert.equal(consumeRedirect(), '/account/orders');
  assert.equal(consumeRedirect(), null, 'the destination is spent once');
});

test('a session passes the guard', () => {
  const { pinecone } = setup({ protected: ['/account'] }, { session: { isAuthenticated: true } });
  router.initRouter();

  handlers(pinecone).authGuard(ctx('/account'));

  assert.deepEqual(pinecone.calls.navigated, []);
});

test('an unprotected route does not care that there is no session at all', () => {
  const { pinecone } = setup({ protected: ['/account'] }, { session: null });
  router.initRouter();

  handlers(pinecone).authGuard(ctx('/'));

  assert.deepEqual(pinecone.calls.navigated, []);
});

test('signing in returns you to where you were bounced from', () => {
  const bounced = setup({ protected: ['/account'] }, { session: { isAuthenticated: false } });
  router.initRouter();
  handlers(bounced.pinecone).authGuard(ctx('/account'));

  const signedIn = setup({ protected: ['/account'] }, { session: { isAuthenticated: true } });
  router.initRouter();
  handlers(signedIn.pinecone).authGuard(ctx('/login'));

  assert.deepEqual(signedIn.pinecone.calls.navigated, ['/account']);
});

test('with nowhere remembered, the login page sends a signed-in visitor home', () => {
  consumeRedirect(); // whatever an earlier navigation may have left
  const { pinecone } = setup({ homePath: '/' }, { session: { isAuthenticated: true } });
  router.initRouter();

  handlers(pinecone).authGuard(ctx('/login'));

  assert.deepEqual(pinecone.calls.navigated, ['/']);
});

test('a direct hit on /index.html becomes the path the app knows', () => {
  const { pinecone } = setup();
  router.initRouter();
  const { normalizeIndex } = handlers(pinecone);

  normalizeIndex(ctx('/index.html'));
  normalizeIndex(ctx('/about'));

  assert.deepEqual(pinecone.calls.navigated, ['/']);
});

// --- title ---

test('the title comes from the titles map, or from the page name itself', () => {
  const { document, pinecone } = setup({
    routes: { '/': 'home', '/forgot-password': 'forgot-password' },
    titles: { home: 'Everything' },
  });
  router.initRouter();
  const { titleHandler } = handlers(pinecone);

  titleHandler(ctx('/'));
  assert.equal(document.title, 'Everything — Shop');

  titleHandler(ctx('/forgot-password'));
  assert.equal(document.title, 'Forgot password — Shop', 'a page name is not a title, but it will do');
});

test('with no page name the site stands alone', () => {
  const { document } = setup({ siteName: 'Shop' });

  setPageTitle('');

  assert.equal(document.title, 'Shop');
});

// --- what happens around a render ---

test('a new navigation clears the message the last one left', () => {
  const { document } = setup();
  const app = component();
  app.errMsg = 'Could not load products.';
  app.watchRouter();

  document.dispatchEvent(new Event('pinecone:start'));

  assert.equal(app.errMsg, '');
});

test('a template that fails to load says which one, instead of a blank page', () =>
  captureConsole('error', (errors) => {
    const { document } = setup();
    const app = component();
    app.watchRouter();

    document.dispatchEvent(
      new CustomEvent('pinecone:fetch-error', {
        detail: { error: new Error('404'), url: '/pages/home.html' },
      }),
    );

    assert.match(app.errMsg, /\/pages\/home\.html/);
    assert.equal(errors.length, 1, 'and the real error keeps its stack');
  }));

test('a page you arrive at starts at the top, with focus on its main', () => {
  const main = fakeMain();
  const { document, scrolled } = setup({}, { main });
  component().watchRouter();

  document.dispatchEvent(new Event('pinecone:end'));

  assert.deepEqual(scrolled, [[0, 0]]);
  assert.equal(main.attributes.tabindex, '-1', 'focusable programmatically, not by tabbing');
  assert.equal(main.focused, 1);
  assert.deepEqual(main.focusOptions, { preventScroll: true });
});

test('back and forward keep the place they had — that one is the browser to restore', () => {
  const main = fakeMain();
  const { document, window, scrolled } = setup({}, { main });
  component().watchRouter();

  window.dispatchEvent(new Event('popstate'));
  document.dispatchEvent(new Event('pinecone:end'));

  assert.deepEqual(scrolled, [], 'going to the top would undo what the browser just restored');
  assert.equal(main.focused, 1, 'the page is still announced');
  assert.deepEqual(main.focusOptions, { preventScroll: true }, 'and focusing must not scroll either');
});

test('the render after that starts at the top again', () => {
  const { document, window, scrolled } = setup({}, { main: fakeMain() });
  component().watchRouter();

  window.dispatchEvent(new Event('popstate'));
  document.dispatchEvent(new Event('pinecone:end'));
  document.dispatchEvent(new Event('pinecone:end'));

  assert.deepEqual(scrolled, [[0, 0]], 'the flag answers for one render, not for the rest of the session');
});

test('a page that focused a field of its own keeps it', () => {
  const main = fakeMain({ holdsFocus: true });
  const { document } = setup({}, { main });
  component().watchRouter();

  document.dispatchEvent(new Event('pinecone:end'));

  assert.equal(main.focused, 0);
});

test('a render with no main is not a crash', () => {
  const { document, scrolled } = setup({}, { main: null });
  component().watchRouter();

  document.dispatchEvent(new Event('pinecone:end'));

  assert.deepEqual(scrolled, [[0, 0]]);
});

// --- navigation from code ---

test('goTo navigates and goBack uses the history there is', () => {
  const { pinecone } = setup();
  const app = component();

  app.goTo('/cart');
  app.goBack();

  assert.deepEqual(pinecone.calls.navigated, ['/cart']);
  assert.equal(pinecone.calls.back, 1);
});

test('goBack on a direct visit falls back home rather than leaving the app', () => {
  const { pinecone } = setup({ homePath: '/' }, { canGoBack: false });

  component().goBack();

  assert.deepEqual(pinecone.calls.navigated, ['/']);
});
