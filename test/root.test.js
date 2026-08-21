import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDom, captureConsole } from './dom.js';
import { createRoot, catchPageErrors } from '../root.js';

const NOTICE_TIMEOUT = 4000; // root.js clears anything that is not an error after this

// createRoot returns the factory Alpine.data() would get; a test calls it itself.
const root = (options = {}) => createRoot(options)();

// The dismiss timer lives in the module, one per app. Mocking timers in every test
// that notifies keeps a real one from outliving the test that started it.
const withTimers = (t) => t.mock.timers.enable({ apis: ['setTimeout'] });

test('partials are seeded empty, so x-html renders nothing rather than undefined', () => {
  const app = root({ partials: ['toast', 'nav'] });

  assert.deepEqual(app.partials, { toast: '', nav: '' });
});

test('notify carries what to say and what kind of thing it is', (t) => {
  withTimers(t);
  const app = root();

  app.notify('Saved.', 'success');
  assert.deepEqual(app.message, { text: 'Saved.', type: 'success' });

  app.notify('A new link is on its way.');
  assert.equal(app.message.type, 'info', 'info is what a message is when nobody says');
});

test('an error waits for the visitor', (t) => {
  withTimers(t);
  const app = root();

  app.notify('Could not reach the server.', 'error');
  t.mock.timers.tick(NOTICE_TIMEOUT * 10);

  assert.equal(app.message.text, 'Could not reach the server.', 'a failure is something to act on');
});

test('anything that is not an error clears itself', (t) => {
  withTimers(t);
  const app = root();

  app.notify('Saved.', 'success');
  t.mock.timers.tick(NOTICE_TIMEOUT - 1);
  assert.equal(app.message.text, 'Saved.');

  t.mock.timers.tick(1);
  assert.equal(app.message.text, '');
});

test("a second message is not cut short by the first one's timer", (t) => {
  withTimers(t);
  const app = root();

  app.notify('Saved.', 'success');
  t.mock.timers.tick(NOTICE_TIMEOUT - 500);
  app.notify('Saved again.', 'success');

  t.mock.timers.tick(500);
  assert.equal(app.message.text, 'Saved again.', 'the first timer has to have been cleared');

  t.mock.timers.tick(NOTICE_TIMEOUT);
  assert.equal(app.message.text, '');
});

test('dismiss empties the text and keeps the colour, so a leave transition can finish', (t) => {
  withTimers(t);
  const app = root();

  app.notify('Could not reach the server.', 'error');
  app.dismiss();

  assert.deepEqual(app.message, { text: '', type: 'error' });
});

test('errMsg reads errors only, so an old toast cannot paint a success as a failure', (t) => {
  withTimers(t);
  const app = root();

  app.notify('Saved.', 'success');
  assert.equal(app.errMsg, '');

  app.notify('Wrong email or password.', 'error');
  assert.equal(app.errMsg, 'Wrong email or password.');
});

test('assigning errMsg is notify, and emptying it is dismiss', (t) => {
  withTimers(t);
  const app = root();

  app.errMsg = 'Boom.';
  assert.deepEqual(app.message, { text: 'Boom.', type: 'error' });

  app.errMsg = '';
  assert.equal(app.message.text, '');
});

// --- partials ---

function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;

  return Promise.resolve(run()).finally(() => (globalThis.fetch = original));
}

const html = (body) => new Response(body, { headers: { 'content-type': 'text/html' } });

// loadPartials is deliberately not awaited, so a test waits for the turns it takes.
const settle = async () => {
  for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

test('each partial lands where the markup expects it', () =>
  withFetch(
    async (url) => html(`<p>${url}</p>`),
    async () => {
      const app = root({ partials: ['toast'] });
      app.loadPartials();
      await settle();

      assert.equal(app.partials.toast, '<p>/partials/toast.html</p>');
    },
  ));

test('a partial that fails leaves the rest of the page standing', () =>
  captureConsole('error', (errors) =>
    withFetch(
      async (url) =>
        url.includes('broken')
          ? new Response('nope', { status: 500, headers: { 'content-type': 'text/plain' } })
          : html('<nav></nav>'),
      async () => {
        const app = root({ partials: ['broken', 'nav'] });
        app.loadPartials();
        await settle();

        assert.equal(app.partials.nav, '<nav></nav>', 'one failure is not the whole boot');
        assert.equal(app.partials.broken, '', 'nothing of the framework reaches a visitor');
        assert.match(app.errMsg, /broken/);
        assert.equal(errors.length, 1);
      },
    ),
  ));

test('with debug on, the gap reports itself where the gap is', () =>
  captureConsole('error', () =>
    withFetch(
      async () => new Response('nope', { status: 500, headers: { 'content-type': 'text/plain' } }),
      async () => {
        const app = root({ partials: ['toast'], debug: true });
        app.loadPartials();
        await settle();

        assert.match(app.partials.toast, /data-alpineshell-error/);
        assert.match(app.partials.toast, /toast/, 'and names which one, since only the hole knows');
      },
    ),
  ));

// --- boot ---

test('init wires the router before it hands over to the app', async () => {
  const { document, pinecone, scrolled } = installDom();

  const wiredFirst = [];
  const app = root({
    extend: {
      async init() {
        wiredFirst.push(Boolean(pinecone.calls.settings));
        this.ready = true;
      },
    },
  });

  await app.init();
  document.dispatchEvent(new Event('pinecone:end'));

  assert.deepEqual(wiredFirst, [true], 'a page may navigate from its own init');
  assert.equal(app.ready, true, 'extend.init runs with `this` on the component');
  assert.deepEqual(scrolled, [[0, 0]], 'and watchRouter is listening by then');
});

test('an app with no init of its own still boots', async () => {
  installDom();
  const app = root({ extend: { money: (cents) => cents / 100 } });

  await app.init();

  assert.equal(app.money(250), 2.5, 'what the app added is on every page');
  assert.equal(typeof app.goTo, 'function', 'and so is the router');
});

// --- a page that throws ---

// errMsg belongs to the root; in an app a page reaches it one scope up.
const mounted = (factory, name = 'homePage') => {
  const page = catchPageErrors(name, factory)();
  page.errMsg = '';
  return page;
};

test('a page that throws in init says so, instead of leaving chrome around nothing', async () => {
  const page = mounted(() => ({
    async init() {
      throw new Error('That product does not exist.');
    },
  }));

  await page.init();

  assert.equal(page.errMsg, 'That product does not exist.');
});

test('an authored sentence is shown quietly, a real failure keeps its trace', () =>
  captureConsole('error', async (errors) => {
    const authored = mounted(() => ({ init() { throw new Error('Sold out.'); } }));
    const crash = mounted(() => ({ init() { throw new TypeError('x is not a function'); } }));

    await authored.init();
    await crash.init();

    assert.equal(authored.errMsg, 'Sold out.');
    assert.equal(crash.errMsg, 'x is not a function');
    assert.equal(errors.length, 1, 'only the failure is a failure');
  }));

test('a page with no init is handed over untouched', () => {
  const page = catchPageErrors('cartPage', () => ({ items: [] }))();

  assert.deepEqual(page, { items: [] });
});

test('what x-data passed and what init returns still get through', async () => {
  const page = catchPageErrors('productPage', (handle) => ({
    handle,
    async init() {
      return 'done';
    },
  }))('shoes');
  page.errMsg = '';

  assert.equal(page.handle, 'shoes');
  assert.equal(await page.init(), 'done');
  assert.equal(page.errMsg, '');
});
