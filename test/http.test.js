import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, errorMessage, HttpError } from '../http.js';

// Swap fetch for the duration of one test and record what the client asked for.
function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];

  // AbortSignal.timeout's timer is unref'd, so a test waiting to be aborted has
  // nothing holding the event loop open. Node would drain it and cancel the file.
  const keepAlive = setInterval(() => {}, 1000);

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };

  return Promise.resolve(run(calls)).finally(() => {
    clearInterval(keepAlive);
    globalThis.fetch = original;
  });
}

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

test('a relative path is joined to baseURL', () =>
  withFetch(() => json({ ok: true }), async (calls) => {
    const http = createClient({ baseURL: 'https://example.test/' });
    await http.get('/things');

    assert.equal(calls[0].url, 'https://example.test/things');
  }));

test('an absolute URL ignores baseURL', () =>
  withFetch(() => json({}), async (calls) => {
    const http = createClient({ baseURL: 'https://example.test' });
    await http.get('https://elsewhere.test/things');

    assert.equal(calls[0].url, 'https://elsewhere.test/things');
  }));

test('params are appended, arrays repeat, empties are dropped', () =>
  withFetch(() => json({}), async (calls) => {
    const http = createClient();
    await http.get('/search', {
      params: { q: 'phone', tag: ['new', 'sale'], page: null, sort: undefined },
    });

    assert.equal(calls[0].url, '/search?q=phone&tag=new&tag=sale');
  }));

test('params join a URL that already has a query', () =>
  withFetch(() => json({}), async (calls) => {
    const http = createClient();
    await http.get('/search?limit=10', { params: { q: 'phone' } });

    assert.equal(calls[0].url, '/search?limit=10&q=phone');
  }));

test('JSON comes back parsed', () =>
  withFetch(() => json({ id: 7 }), async () => {
    const http = createClient();

    assert.deepEqual(await http.get('/thing'), { id: 7 });
  }));

test('text comes back as a string', () =>
  withFetch(
    () => new Response('<p>hello</p>', { headers: { 'content-type': 'text/html' } }),
    async () => {
      const http = createClient();

      assert.equal(await http.get('/partial.html'), '<p>hello</p>');
    },
  ));

test('204 is null, not an empty string', () =>
  withFetch(() => new Response(null, { status: 204 }), async () => {
    const http = createClient();

    assert.equal(await http.delete('/thing/7'), null);
  }));

test('a failed response throws HttpError carrying the server body', () =>
  withFetch(
    () => json({ message: 'Nope.', data: { email: { message: 'Taken.' } } }, { status: 400 }),
    async () => {
      const http = createClient({ baseURL: 'https://example.test' });

      const err = await http.post('/users', { email: 'a@b.c' }).then(
        () => null,
        (e) => e,
      );

      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 400);
      assert.equal(err.data.data.email.message, 'Taken.');
    },
  ));

test('a plain object is sent as JSON, with the header set', () =>
  withFetch(() => json({}), async (calls) => {
    const http = createClient();
    await http.post('/things', { name: 'Ada' });

    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.body, '{"name":"Ada"}');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  }));

test('FormData is passed through untouched, so the browser sets the boundary', () =>
  withFetch(() => json({}), async (calls) => {
    const body = new FormData();
    body.append('file', 'x');

    const http = createClient();
    await http.post('/upload', body);

    assert.equal(calls[0].options.body, body);
    assert.equal(calls[0].options.headers['Content-Type'], undefined);
  }));

test('per-request headers are merged over the client defaults', () =>
  withFetch(() => json({}), async (calls) => {
    const http = createClient({ headers: { 'X-App': 'shop' } });
    await http.get('/thing', { headers: { Authorization: 'token' } });

    assert.equal(calls[0].options.headers['X-App'], 'shop');
    assert.equal(calls[0].options.headers.Authorization, 'token');
    assert.ok(calls[0].options.headers.Accept.includes('application/json'));
  }));

test('a timeout throws a message that names the wait', () =>
  withFetch(
    (url, options) =>
      new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason));
      }),
    async () => {
      const http = createClient({ timeout: 10 });

      const err = await http.get('/slow').then(
        () => null,
        (e) => e,
      );

      assert.match(err.message, /timed out after 10ms/);
    },
  ));

test("a caller's own signal still aborts", () =>
  withFetch(
    (url, options) =>
      new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason));
      }),
    async () => {
      const controller = new AbortController();
      const http = createClient();

      const pending = http.get('/slow', { signal: controller.signal }).then(
        () => null,
        (e) => e,
      );

      controller.abort(new Error('changed my mind'));

      assert.equal((await pending).message, 'changed my mind');
    },
  ));

test('errorMessage prefers the server description, then the message, then the fallback', () => {
  assert.equal(
    errorMessage({ data: { description: 'Out of stock.' }, message: 'HTTP 400' }, 'Fallback.'),
    'Out of stock.',
  );
  assert.equal(errorMessage(new Error('Wrong password.'), 'Fallback.'), 'Wrong password.');
  assert.equal(errorMessage({}, 'Fallback.'), 'Fallback.');
});
