// Filled by createApp() — the app owns the routes, this file owns the mechanics.
let config = {
  routes: {},        // route pattern -> page name
  protected: [],     // prefix match: '/admin' also covers '/admin/users'
  titles: {},        // page name -> title, overrides the name itself
  siteName: '',
  loginPath: '/login',
  homePath: '/',
  pagesDir: '/pages',
  partialsDir: '/partials',
  targetId: 'page',
  header: 'header',  // partial rendered above every page, null to drop it
  footer: 'footer',
};

export function configureRouter(options) {
  config = { ...config, ...options };
}

// documented entry point for JS modules
const pinecone = () => window.PineconeRouter;

// A route is a page name, or an object when it needs different chrome:
// '/login': { page: 'login', header: false, footer: false }
const routeConfig = (value) => (typeof value === 'string' ? { page: value } : value ?? {});

// --- auth ---
// where the guard bounced the user from, so signing in can send them back
let redirectTo = null;

export function consumeRedirect() {
  const path = redirectTo;
  redirectTo = null;
  return path;
}

// Static hosts open '/index.html' directly; the app only knows '/'.
function normalizeIndex(ctx) {
  if (ctx.path.endsWith('/index.html')) {
    pinecone().navigate(ctx.path.replace(/index\.html$/, ''));
  }
}

// Runs before every route and before any template renders.
// Navigating from a handler cancels the remaining ones, so no redirect loop.
function authGuard(ctx) {
  const signedIn = Alpine.store('session')?.isAuthenticated;
  const isProtected = config.protected.some((route) => ctx.path.startsWith(route));

  if (isProtected && !signedIn) {
    redirectTo = ctx.path;
    pinecone().navigate(config.loginPath);
    return;
  }

  if (ctx.path === config.loginPath && signedIn) {
    pinecone().navigate(consumeRedirect() ?? config.homePath);
  }
}

// A protected prefix is only a condition — it does not create a route. Without a matching
// one, a signed-in visitor reaches the guard, passes, and lands on notfound.
function warnAboutOrphanGuards() {
  const paths = Object.keys(config.routes);
  const orphans = config.protected.filter((prefix) => !paths.some((path) => path.startsWith(prefix)));

  if (orphans.length) {
    console.warn(`AlpineShell: protected prefixes with no route — ${orphans.join(', ')}`);
  }
}

// --- title ---
export function setPageTitle(name) {
  document.title = name ? `${name} — ${config.siteName}` : config.siteName;
}

// 'forgot-password' -> 'Forgot password'
function titleFromName(page) {
  return page.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function titleHandler(ctx) {
  const { page = '' } = routeConfig(config.routes[ctx.route?.path]);
  setPageTitle(config.titles[page] ?? titleFromName(page));
}

// --- setup ---
export const router = {
  initRouter() {
    pinecone().settings({
      // hash: true,
      // basePath: '/shop',
      targetID: config.targetId,
      handleClicks: true,
      globalHandlers: [normalizeIndex, authGuard, titleHandler],
    });

    const partial = (name) => name && `${config.partialsDir}/${name}.html`;

    // true or omitted keeps the default partial, false drops it, a string swaps it
    const resolveChrome = (value, fallback) =>
      value === undefined || value === true ? fallback : value;

    for (const [path, value] of Object.entries(config.routes)) {
      const { page, header, footer } = routeConfig(value);

      pinecone().add(path, {
        templates: [
          partial(resolveChrome(header, config.header)),
          `${config.pagesDir}/${page}.html`,
          partial(resolveChrome(footer, config.footer)),
        ].filter(Boolean),
      });
    }

    if (config.debug) warnAboutOrphanGuards();
  },

  // Spread into the component, so `this` reaches its state.
  watchRouter() {
    // start of navigation, before any fetch — clearing here keeps errors raised during it
    document.addEventListener('pinecone:start', () => this.errMsg = '');

    // the router fetches its own templates; without this a failed fetch is a blank page
    document.addEventListener('pinecone:fetch-error', ({ detail }) => {
      console.error(detail.error);
      this.errMsg = `Page could not be loaded: ${detail.url}`;
    });

    // A rendered route is a new page to the user, but not to the browser.
    document.addEventListener('pinecone:end', () => {
      window.scrollTo(0, 0);

      const main = document.querySelector(`#${config.targetId} main`);
      if (!main || main.contains(document.activeElement)) return; // a page may focus its own field

      main.setAttribute('tabindex', '-1'); // focusable programmatically, not by tabbing
      main.focus({ preventScroll: true }); // we just scrolled to the top ourselves
    });
  },

  goBack() {
    const nav = pinecone().history;
    nav.canGoBack() ? nav.back() : this.goTo(config.homePath); // a direct visit has no history
  },

  goTo(path) {
    pinecone().navigate(path);
  },
};
