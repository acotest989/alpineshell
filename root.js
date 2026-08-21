import { http, errorMessage } from './http.js';
import { router } from './router.js';

const PARTIAL_TIMEOUT = 5000; // local files; a longer wait would only stall the boot
const NOTICE_TIMEOUT = 4000; // long enough to read a sentence, short enough not to nag

// One root per app, so the timer belongs to the module rather than to state every
// page can see through the scope chain.
let noticeTimer = null;

// The component every page is nested in: navigation, shared markup, app-wide errors.
export function createRoot({ partials = [], partialsDir = '/partials', extend = {}, debug = false }) {
  return () => ({
    ...router,
    ...extend,

    // What the app has to say, and what kind of thing it is. Only 'error' means anything
    // here — it is the one that waits; the rest is the toast partial's own vocabulary.
    message: { text: '', type: 'error' },

    // seeded so x-html renders "" instead of "undefined" before the fetch lands
    partials: Object.fromEntries(partials.map((name) => [name, ''])),

    async init() {
      this.initRouter();
      this.watchRouter();
      this.loadPartials();

      await extend.init?.call(this);
      if (debug) console.log('App is ready.');
    },

    // An error waits for the visitor to act on it or navigate away; anything else
    // is an acknowledgement and clears itself.
    notify(text, type = 'info') {
      clearTimeout(noticeTimer);
      this.message = { text, type };

      if (type !== 'error') {
        noticeTimer = setTimeout(() => this.dismiss(), NOTICE_TIMEOUT);
      }
    },

    dismiss() {
      clearTimeout(noticeTimer);
      this.message = { text: '', type: this.message.type }; // the type outlives the text, so a leave transition keeps its colour
    },

    // Kept for markup written before message existed. Reading returns errors only,
    // so an older toast can never paint a success as a failure.
    get errMsg() {
      return this.message.type === 'error' ? this.message.text : '';
    },
    set errMsg(text) {
      text ? this.notify(text, 'error') : this.dismiss();
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

            // An app-wide message cannot point at a place, and has nowhere to render
            // at all when the partial that failed is the toast. Development only: a
            // visitor is owed a page, not a report.
            if (debug) {
              this.partials[name] = `<div data-alpineshell-error>Partial failed: ${name}</div>`;
            }
          });
      });
    },
  });
}

// Alpine calls a page's init() itself, so nothing else catches one that throws and
// the visitor is left with chrome around an empty target. Whatever lands here the
// page did not handle, so it always keeps its trace.
export function catchPageErrors(name, factory) {
  return (...args) => {
    const page = factory(...args);
    if (!page.init) return page;

    const init = page.init;

    page.init = async function (...initArgs) {
      try {
        return await init.apply(this, initArgs);
      } catch (err) {
        this.errMsg = errorMessage(err, 'This page could not be opened.');
        console.error(`AlpineShell: ${name} failed to start —`, err);
      }
    };

    return page;
  };
}
