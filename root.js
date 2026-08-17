import { http } from './http.js';
import { router } from './router.js';

const PARTIAL_TIMEOUT = 5000; // local files; a longer wait would only stall the boot
const NOTICE_TIMEOUT = 4000; // long enough to read a sentence, short enough not to nag

// One root component per app, so the timer belongs to the module, not to the state
// every page can see through the scope chain.
let noticeTimer = null;

// The root component every page is nested in: navigation, shared markup, app-wide errors.
// `extend` is merged in, so the app can add its own state and methods.
export function createRoot({ partials = [], partialsDir = '/partials', extend = {}, debug = false }) {
  return () => ({
    ...router,
    ...extend,

    // What the app has to say, and what kind of thing it is: 'error' | 'success' | 'info'.
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

    // Kept for apps and partials written before message existed. Reading returns
    // errors only, so an older toast can never paint a success as a failure.
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
          });
      });
    },
  });
}
