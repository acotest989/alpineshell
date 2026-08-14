// AlpineShell — structure and conventions for Alpine.js apps, without a build step.
// Public API: an app imports createApp() and the few helpers re-exported below.

import 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';
import 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js';
import persist from 'https://cdn.jsdelivr.net/npm/@alpinejs/persist@3.x.x/dist/module.esm.js';
import pineconeRouter from 'https://cdn.jsdelivr.net/npm/pinecone-router@7.6.0/dist/router.esm.js';

import { http } from './http.js';
import { configureRouter } from './router.js';
import { createRoot } from './root.js';

export { http, errorMessage, HttpError } from './http.js';
export { consumeRedirect, setPageTitle } from './router.js';

// The browser build only compiles <style type="text/tailwindcss"> tags, and picks up ones
// added later. Not awaited: that would delay the registrations below past Alpine's start.
function loadTheme(url) {
  (async () => {
    const style = document.createElement('style');
    style.type = 'text/tailwindcss';
    style.textContent = await http.get(url);
    document.head.append(style);
  })().catch((err) => console.error('Theme failed to load:', err));
}

/**
 * routes    route pattern -> page name ('/products/:handle': 'product'), or
 *           { page, header, footer } when a route needs different chrome
 * titles    page name -> title; anything missing falls back to the name
 * protected route prefixes that require a session
 * partials  names under /partials that you render yourself with x-html, loaded once
 *           into app.partials. Header and footer are not listed here — the router
 *           adds them to each route's templates, per route rather than globally.
 * pages     component name -> factory, registered as-is
 * stores    store name -> factory
 * app       extra state and methods merged into the root component
 * debug     boot log and window.dbg for the console
 *
 * Conventions, all overridable: pagesDir '/pages', partialsDir '/partials',
 * targetId 'page', header 'header', footer 'footer' (null drops either),
 * loginPath '/login', homePath '/', siteName from <title>.
 */
export function createApp({
  routes = {},
  titles = {},
  protected: protectedRoutes = [],
  partials = [],
  pages = {},
  stores = {},
  app = {},
  theme,
  siteName = document.title,
  loginPath = '/login',
  homePath = '/',
  pagesDir = '/pages',
  partialsDir = '/partials',
  targetId = 'page',
  header = 'header',
  footer = 'footer',
  debug = false,
}) {
  Alpine.plugin(persist);
  Alpine.plugin(pineconeRouter);

  configureRouter({
    routes, titles, protected: protectedRoutes,
    siteName, loginPath, homePath,
    pagesDir, partialsDir, targetId, header, footer, debug,
  });

  // Stores first: a page component may read one while initialising.
  for (const [name, factory] of Object.entries(stores)) Alpine.store(name, factory());
  for (const [name, factory] of Object.entries(pages)) Alpine.data(name, factory);

  // The router already fetches the chrome; listing it again downloads it twice.
  if (debug) {
    const duplicated = partials.filter((name) => name === header || name === footer);
    if (duplicated.length) {
      console.warn(`AlpineShell: ${duplicated.join(', ')} is chrome — drop it from 'partials' to avoid a second fetch`);
    }
  }

  Alpine.data('app', createRoot({ partials, partialsDir, extend: app, debug }));

  if (theme) loadTheme(theme);

  // console only — getters, so dbg.app shows live state instead of a snapshot
  if (debug) {
    window.dbg = {
      http,
      get app() { return Alpine.$data(document.getElementById('app')); },
      get router() { return window.PineconeRouter; },
    };
  }
}
