import { test } from 'node:test';
import assert from 'node:assert/strict';

import { form, fieldError } from '../form.js';

// form() is a plain mixin, so a test can be the page: spread it and add the two
// methods a page would. No Alpine, no DOM, no browser.
const page = (overrides = {}, values = { email: '', password: '' }, options) => ({
  ...form(values, options),
  ...overrides,
});

test('validation failure keeps the request off the network', async () => {
  let saved = false;

  const p = page({
    validate: () => ({ email: 'Required.' }),
    save: async () => { saved = true; },
  });

  await p.submit();

  assert.equal(saved, false, 'save() must not run when validation failed');
  assert.equal(p.errors.email, 'Required.');
  assert.equal(p.pending, false);
});

// The regression that shipped: invalid() was a getter, and spreading an object
// calls a getter and copies its answer -- so it froze at "valid" and every submit
// reached the network.
test('invalid() survives being spread', () => {
  const p = page();

  assert.equal(typeof p.invalid, 'function', 'invalid must be a method, not a value');
  assert.equal(p.invalid(), false);

  p.errors.email = 'Required.';
  assert.equal(p.invalid(), true);
});

test('valid input reaches save() and its result comes back', async () => {
  const p = page({
    validate: () => ({ email: '' }),
    save: async () => 'done',
  });

  assert.equal(await p.submit(), 'done');
  assert.equal(p.pending, false);
});

test('a page with no validate() submits', async () => {
  let saved = false;
  const p = page({ save: async () => { saved = true; } });

  await p.submit();

  assert.equal(saved, true);
});

test('a second submit is ignored while the first is in flight', async () => {
  let calls = 0;
  let release;
  const held = new Promise((resolve) => { release = resolve; });

  const p = page({ save: async () => { calls += 1; await held; } });

  const first = p.submit();
  assert.equal(p.pending, true, 'pending must be raised before awaiting save()');

  await p.submit(); // the double click

  release();
  await first;

  assert.equal(calls, 1);
  assert.equal(p.pending, false);
});

test('arguments are passed through to save()', async () => {
  let seen;
  const p = page({ save: async (...args) => { seen = args; } });

  await p.submit('a', 2);

  assert.deepEqual(seen, ['a', 2]);
});

test('an error carrying fields lands on those fields', async () => {
  const p = page({
    save: async () => {
      throw fieldError({ email: 'That address already has an account.' });
    },
  });

  await p.submit();

  assert.equal(p.errors.email, 'That address already has an account.');
  assert.equal(p.error, '', 'a field error must not also fill the form-wide message');
});

test('a plain Error becomes the form-wide message, quietly', async () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);

  try {
    const p = page({ save: async () => { throw new Error('Wrong email or password.'); } });
    await p.submit();

    assert.equal(p.error, 'Wrong email or password.');
    assert.equal(logged.length, 0, 'an expected outcome must not look like a crash');
  } finally {
    console.error = original;
  }
});

test('anything that is not a plain Error is logged as well as shown', async () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);

  try {
    const p = page({ save: async () => { throw new TypeError('x is not a function'); } });
    await p.submit();

    assert.equal(p.error, 'x is not a function');
    assert.equal(logged.length, 1, 'a real failure deserves a stack trace');
  } finally {
    console.error = original;
  }
});

test('the fallback is used when an error says nothing', async () => {
  const p = page(
    { save: async () => { throw new Error(); } },
    { email: '' },
    { fallback: 'Could not send the link.' },
  );

  await p.submit();

  assert.equal(p.error, 'Could not send the link.');
});

test('pending is lowered even when save() throws', async () => {
  const p = page({ save: async () => { throw new Error('nope'); } });

  await p.submit();

  assert.equal(p.pending, false);
});

test('clear() empties one field and the form-wide message', () => {
  const p = page();
  p.errors.email = 'Required.';
  p.errors.password = 'Required.';
  p.error = 'Something went wrong.';

  p.clear('email');

  assert.equal(p.errors.email, '');
  assert.equal(p.errors.password, 'Required.', 'only the named field is cleared');
  assert.equal(p.error, '');
});

test('a fixed field lets the next submit through', async () => {
  let saved = 0;
  const p = page({
    validate() {
      return { email: this.values.email ? '' : 'Required.' };
    },
    save: async () => { saved += 1; },
  });

  await p.submit();
  assert.equal(saved, 0);

  p.values.email = 'ada@example.com';
  await p.submit();

  assert.equal(saved, 1, 'a stale error must not block the retry');
  assert.equal(p.errors.email, '');
});

test('values start as given and errors start empty', () => {
  const p = page({}, { name: 'Ada', email: '' });

  assert.deepEqual(p.values, { name: 'Ada', email: '' });
  assert.deepEqual(p.errors, { name: '', email: '' });
  assert.equal(p.error, '');
  assert.equal(p.pending, false);
});

test('each page gets its own values', () => {
  const shared = { email: '' };
  const a = page({}, shared);
  const b = page({}, shared);

  a.values.email = 'ada@example.com';

  assert.equal(b.values.email, '', 'form() must copy the values it is given');
  assert.equal(shared.email, '');
});

test('fieldError carries the fields and a default message', () => {
  const err = fieldError({ email: 'Taken.' });

  assert.ok(err instanceof Error);
  assert.equal(err.name, 'FieldError');
  assert.deepEqual(err.fields, { email: 'Taken.' });
  assert.equal(err.message, 'Please check the form.');
});
