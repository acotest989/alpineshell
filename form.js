import { errorMessage } from './http.js';

// Spread into a page component. It owns the four things every form needs — values,
// per-field errors, one form-wide error, a pending flag — and the submit sequence
// that was being written out by hand on every page.
//
// The page supplies the parts only it can know:
//   validate()  optional; returns { field: message }, empty strings for the valid ones
//   save()      what to actually do; `this` is the page, so goTo/notify/$store all work
//
//   export const loginPage = () => ({
//     ...form({ email: '', password: '' }),
//     validate() {
//       return { email: this.values.email ? '' : 'Required.' };
//     },
//     async save() {
//       await this.signIn(this.values.email, this.values.password);
//     },
//   });
export function form(values = {}, { fallback = 'Something went wrong.' } = {}) {
  return {
    values: { ...values },
    errors: Object.fromEntries(Object.keys(values).map((field) => [field, ''])),
    error: '',
    pending: false,

    // For @input: the message a visitor is already fixing should not keep shouting.
    clear(field) {
      if (field) this.errors[field] = '';
      this.error = '';
    },

    // A method, not a getter: pages take this object with `...form()`, and a spread
    // calls a getter once and copies the answer. It would have been frozen at
    // "valid" for the life of the page.
    invalid() {
      return Object.values(this.errors).some(Boolean);
    },

    async submit(...args) {
      if (this.pending) return; // a double click is one order, not two

      this.error = '';

      if (this.validate) {
        this.errors = { ...this.errors, ...this.validate() };
        if (this.invalid()) return; // nothing leaves the browser until the browser is happy
      }

      this.pending = true;

      try {
        return await this.save(...args);
      } catch (err) {
        // Only the server knows some things — that an address is taken, that a
        // password is wrong. When it says which field, put it on that field.
        if (err.fields) {
          this.errors = { ...this.errors, ...err.fields };
        } else {
          this.error = errorMessage(err, fallback);

          // A plain Error is a sentence somebody wrote for the visitor, and an
          // expected outcome should not look like a crash. Anything else — an
          // HttpError, an SDK error, a TypeError — is a failure worth a trace.
          if (err.name !== 'Error') console.error(err);
        }
      } finally {
        this.pending = false;
      }
    },
  };
}

// The vehicle for the above. A service maps its own backend's error shape into
// { field: message } and throws this; the framework cannot know that shape, and a
// page must never have to.
export function fieldError(fields, message = 'Please check the form.') {
  const err = new Error(message);
  err.name = 'FieldError';
  err.fields = fields;
  return err;
}
