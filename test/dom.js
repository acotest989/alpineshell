// router.js and root.js only mean anything inside a document — but not much of a
// document. Between them they listen for events, look for one element, move focus,
// scroll and set a title. That is an EventTarget and a handful of methods, and Node
// has EventTarget, so the browser here is about thirty lines rather than a package.

// Stands in for the <main> the router hands focus to after a render.
export function fakeMain({ holdsFocus = false } = {}) {
  return {
    attributes: {},
    focused: 0,
    focusOptions: null,
    contains: () => holdsFocus, // "does the new page already own the focus?"
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus(options) {
      this.focused += 1;
      this.focusOptions = options;
    },
  };
}

// Pinecone, as much of it as router.js actually calls.
export function fakePinecone({ canGoBack = true } = {}) {
  const calls = { settings: null, routes: [], navigated: [], back: 0 };

  return {
    calls,
    settings: (options) => (calls.settings = options),
    add: (path, options) => calls.routes.push({ path, ...options }),
    navigate: (path) => calls.navigated.push(path),
    history: { canGoBack: () => canGoBack, back: () => (calls.back += 1) },
  };
}

// Fresh globals per test: watchRouter() attaches listeners to whatever document and
// window it finds, and a shared pair would keep them from every test that ran before.
export function installDom({ session = null, main = null, canGoBack = true } = {}) {
  const scrolled = [];

  const document = new EventTarget();
  document.title = '';
  document.activeElement = null;
  document.querySelector = () => main;

  const window = new EventTarget();
  window.scrollTo = (x, y) => scrolled.push([x, y]);

  const pinecone = fakePinecone({ canGoBack });
  window.PineconeRouter = pinecone;

  const Alpine = { store: (name) => (name === 'session' ? session : undefined) };

  Object.assign(globalThis, { document, window, Alpine });

  return { document, window, pinecone, scrolled };
}

// Reading what a module said is part of the behaviour; leaving it in the test output
// is not. Returns a promise, so an async test can await the restore.
export function captureConsole(method, run) {
  const original = console[method];
  const calls = [];
  console[method] = (...args) => calls.push(args);

  return Promise.resolve(run(calls)).finally(() => (console[method] = original));
}
