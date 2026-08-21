// AlpineShell — structure and conventions for Alpine.js apps, without a build step.
// Public API: an app imports createApp() and the few helpers re-exported below.

// Exact versions, never ranges: a floating dependency changes an app that has not
// changed a line. persist must match Alpine — plugin and core share internals.
// Full URLs, not bare specifiers: a library cannot rely on an import map it does
// not own, and requiring one would put this file's dependencies in every consumer.
import 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3';
import 'https://cdn.jsdelivr.net/npm/alpinejs@3.16.1/dist/cdn.min.js';
import persist from 'https://cdn.jsdelivr.net/npm/@alpinejs/persist@3.16.1/dist/module.esm.js';
import pineconeRouter from 'https://cdn.jsdelivr.net/npm/pinecone-router@7.6.0/dist/router.esm.js';

import { http } from './http.js';
import { configureRouter } from './router.js';
import { createRoot, catchPageErrors } from './root.js';

export { http, errorMessage, HttpError } from './http.js';
export { consumeRedirect, setPageTitle } from './router.js';
export { form, fieldError } from './form.js';

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

// Every option and its default is the table in the README. The one thing worth
// repeating at the call site: header and footer are not `partials`. The router adds
// them to each route's own templates, per route rather than globally.
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
  for (const [name, factory] of Object.entries(pages)) {
    Alpine.data(name, catchPageErrors(name, factory));
  }

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
