import { http } from './http.js';
import { router } from './router.js';

const PARTIAL_TIMEOUT = 5000; // local files; a longer wait would only stall the boot

// The root component every page is nested in: navigation, shared markup, app-wide errors.
// `extend` is merged in, so the app can add its own state and methods.
export function createRoot({ partials = [], partialsDir = '/partials', extend = {}, debug = false }) {
  return () => ({
    ...router,
    ...extend,

    errMsg: '',
    // seeded so x-html renders "" instead of "undefined" before the fetch lands
    partials: Object.fromEntries(partials.map((name) => [name, ''])),

    async init() {
      this.initRouter();
      this.watchRouter();
      this.loadPartials();

      await extend.init?.call(this);
      if (debug) console.log('App is ready.');
    },

    // Not awaited: each partial renders the moment it lands, and one that fails
    // leaves the rest of the page standing.
    loadPartials() {
      partials.forEach((name) => {
        http.get(`${partialsDir}/${name}.html`, { timeout: PARTIAL_TIMEOUT })
          .then((html) => (this.partials[name] = html))
          .catch((err) => {
            console.error(`AlpineShell: partial '${name}' failed —`, err);
            this.errMsg = `Could not load: ${name}`;
          });
      });
    },
  });
}
