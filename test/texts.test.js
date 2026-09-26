import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDom, captureConsole } from './dom.js';
import { setTexts, text } from '../texts.js';
import { form, fieldError } from '../form.js';
import { catchPageErrors, createRoot } from '../root.js';
import { configureRouter, router } from '../router.js';
import { createClient } from '../http.js';

// The English an app starts with, put back after every test: the texts are module state,
// one set per app, like the dismiss timer in root.js.
const ENGLISH = {
  error: 'Something went wrong.',
  checkForm: 'Please check the form.',
  pageFailed: 'This page could not be opened.',
  pageNotLoaded: 'Page could not be loaded: {url}',
  partialNotLoaded: 'Could not load: {name}',
  timedOut: 'Request timed out after {ms}ms: {url}',
};

const inSerbian = (t) => {
  setTexts({
    error: 'Nešto nije u redu.',
    checkForm: 'Provjerite formular.',
    pageFailed: 'Ova stranica se nije mogla otvoriti.',
    pageNotLoaded: 'Stranica se nije mogla učitati.',
    partialNotLoaded: 'Dio stranice nije učitan: {name}',
    timedOut: 'Server nije odgovorio za {ms} ms.',
  });
  t.after(() => setTexts(ENGLISH));
};

test('English until an app says otherwise', () => {
  assert.equal(text('pageFailed'), 'This page could not be opened.');
  assert.equal(text('partialNotLoaded', { name: 'toast' }), 'Could not load: toast');
});

test('a name the sentence has is filled in, and one it left out is simply not said', (t) => {
  inSerbian(t);

  assert.equal(text('partialNotLoaded', { name: 'toast' }), 'Dio stranice nije učitan: toast');
  assert.equal(text('pageNotLoaded', { url: '/pages/cart.html' }), 'Stranica se nije mogla učitati.');
});

test('a key the framework does not have is handed back, and changes nothing', (t) => {
  t.after(() => setTexts(ENGLISH));

  const unknown = setTexts({ pageFailed: 'Nope.', pageFaild: 'typo' });

  assert.deepEqual(unknown, ['pageFaild']);
  assert.equal(text('pageFailed'), 'Nope.', 'the keys it knows still apply');
});

test("form() falls back to the app's sentence, and a page's own fallback still wins", async (t) => {
  inSerbian(t);
  const silent = { save: async () => { throw new Error(); } };

  const plain = { ...form({ email: '' }), ...silent };
  const own = { ...form({ email: '' }, { fallback: 'Link nije poslan.' }), ...silent };
  await plain.submit();
  await own.submit();

  assert.equal(plain.error, 'Nešto nije u redu.');
  assert.equal(own.error, 'Link nije poslan.');
});

test("fieldError's message is the app's too", (t) => {
  inSerbian(t);

  assert.equal(fieldError({ email: 'Zauzeto.' }).message, 'Provjerite formular.');
});

test('a page that throws with nothing to say says it in the app language', (t) =>
  captureConsole('error', async () => {
    inSerbian(t);
    const page = catchPageErrors('homePage', () => ({ init() { throw new Error(); } }))();
    page.errMsg = '';

    await page.init();

    assert.equal(page.errMsg, 'Ova stranica se nije mogla otvoriti.');
  }));

test('a partial and a template that will not load say it in the app language', (t) =>
  captureConsole('error', async () => {
    inSerbian(t);
    const { document } = installDom();

    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response('nope', { status: 500, headers: { 'content-type': 'text/plain' } });
    t.after(() => (globalThis.fetch = original));

    // An error sets no dismiss timer, and loadPartials is not awaited: wait out its turns.
    const app = createRoot({ partials: ['toast'] })();
    app.loadPartials();
    for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(app.errMsg, 'Dio stranice nije učitan: toast');

    configureRouter({ routes: {} });
    const page = { ...router, errMsg: '' };
    page.watchRouter();
    document.dispatchEvent(new CustomEvent('pinecone:fetch-error', { detail: { url: '/pages/cart.html', error: new Error('404') } }));
    assert.equal(page.errMsg, 'Stranica se nije mogla učitati.');
  }));

test('a request that times out says so in the app language', async (t) => {
  inSerbian(t);
  const original = globalThis.fetch;
  globalThis.fetch = (url, options) =>
    new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)));

  // AbortSignal.timeout's timer is unref'd: without something holding the event loop open,
  // Node drains it and cancels the test before the timeout fires. As in http.test.js.
  const keepAlive = setInterval(() => {}, 1000);
  t.after(() => {
    clearInterval(keepAlive);
    globalThis.fetch = original;
  });

  const err = await createClient({ timeout: 10 }).get('/slow').then(() => null, (e) => e);

  assert.equal(err.message, 'Server nije odgovorio za 10 ms.');
});
