// The few sentences AlpineShell says to a visitor itself. English, until an app says them in
// its own language: createApp({ texts: { pageFailed: t('errors.pageFailed') } }). A {name}
// is filled in; a translation that leaves one out simply does not say it.
const texts = {
  error: 'Something went wrong.',                    // form()'s fallback, when a page gives none
  checkForm: 'Please check the form.',               // fieldError()'s message
  pageFailed: 'This page could not be opened.',      // a page's init() threw, with nothing to say
  pageNotLoaded: 'Page could not be loaded: {url}',  // the router could not fetch a route's template
  partialNotLoaded: 'Could not load: {name}',        // a partial could not be fetched
  timedOut: 'Request timed out after {ms}ms: {url}', // http gave up waiting
};

// Answers with the keys it did not know, for createApp to warn about in debug.
export function setTexts(overrides = {}) {
  const unknown = [];

  for (const [key, value] of Object.entries(overrides)) {
    if (Object.hasOwn(texts, key)) texts[key] = value;
    else unknown.push(key);
  }

  return unknown;
}

// Read when it is said, not when a module loads, so an app's texts win whatever loaded first.
export function text(key, params = {}) {
  return texts[key].replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
}
