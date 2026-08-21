import { errorMessage } from './http.js';

// Spread into a page: values, per-field errors, one form-wide error, a pending flag,
// and the submit sequence every form was writing out by hand. The page adds the two
// parts only it can know, validate() and save() — README, "Forms".
export function form(values = {}, { fallback = 'Something went wrong.' } = {}) {
  return {
    values: { ...values },
    errors: Object.fromEntries(Object.keys(values).map((field) => [field, ''])),
    error: '',
    pending: false,

    // The message a visitor is already fixing should not keep shouting.
    clear(field) {
      if (field) this.errors[field] = '';
      this.error = '';
    },

    // A method, not a getter: a spread calls a getter and copies the answer, which
    // would freeze this at "valid" for the life of the page.
    invalid() {
      return Object.values(this.errors).some(Boolean);
    },

    async submit(...args) {
      if (this.pending) return; // a double click is one order, not two

      this.error = '';

      if (this.validate) {
        this.errors = { ...this.errors, ...this.validate() };
        if (this.invalid()) return;
      }

      this.pending = true;

      try {
        return await this.save(...args);
      } catch (err) {
        // When the server says which field — that an address is taken — put it there.
        if (err.fields) {
          this.errors = { ...this.errors, ...err.fields };
        } else {
          this.error = errorMessage(err, fallback);

          // A plain Error is a sentence written for the visitor, and an expected
          // outcome should not look like a crash. Anything else is a failure.
          if (err.name !== 'Error') console.error(err);
        }
      } finally {
        this.pending = false;
      }
    },
  };
}

// A service maps its own backend's error shape into { field: message } and throws
// this. The framework cannot know that shape, and a page must never have to.
export function fieldError(fields, message = 'Please check the form.') {
  const err = new Error(message);
  err.name = 'FieldError';
  err.fields = fields;
  return err;
}
