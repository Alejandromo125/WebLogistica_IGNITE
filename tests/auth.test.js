import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthModule } from '../js/auth.js';

function makeFakeClient({ session = null, profile = null, signInError = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      async signInWithPassword({ email, password }) {
        calls.push(['signInWithPassword', email, password]);
        if (signInError) return { data: { session: null }, error: { message: signInError } };
        return { data: { session: { user: { id: 'user-1' } } }, error: null };
      },
      async signOut() {
        calls.push(['signOut']);
        return { error: null };
      },
      async getSession() {
        return { data: { session }, error: null };
      },
      onAuthStateChange(cb) {
        calls.push(['onAuthStateChange']);
        return { data: { subscription: { unsubscribe() { calls.push(['unsubscribe']); } } } };
      },
    },
    from(table) {
      calls.push(['from', table]);
      return {
        select() { return this; },
        eq() { return this; },
        async single() {
          if (!profile) return { data: null, error: { message: 'no rows' } };
          return { data: profile, error: null };
        },
      };
    },
  };
}

test('signIn resolves with the session on success', async () => {
  const client = makeFakeClient();
  const auth = createAuthModule(client);
  const session = await auth.signIn('a@b.com', 'secret');
  assert.equal(session.user.id, 'user-1');
  assert.deepEqual(client.calls[0], ['signInWithPassword', 'a@b.com', 'secret']);
});

test('signIn throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ signInError: 'Invalid login credentials' });
  const auth = createAuthModule(client);
  await assert.rejects(
    () => auth.signIn('a@b.com', 'wrong'),
    (err) => {
      assert.equal(err.message, 'Invalid login credentials');
      return true;
    }
  );
});

test('getCurrentProfile returns null when there is no session', async () => {
  const client = makeFakeClient({ session: null });
  const auth = createAuthModule(client);
  const profile = await auth.getCurrentProfile();
  assert.equal(profile, null);
});

test('getCurrentProfile returns the profile row for the current session', async () => {
  const client = makeFakeClient({
    session: { user: { id: 'user-1' } },
    profile: { id: 'user-1', role: 'admin' },
  });
  const auth = createAuthModule(client);
  const profile = await auth.getCurrentProfile();
  assert.deepEqual(profile, { id: 'user-1', role: 'admin' });
});

test('onAuthStateChange forwards the session to the callback and returns the subscription', () => {
  const client = makeFakeClient();
  const auth = createAuthModule(client);
  let received;
  const subscription = auth.onAuthStateChange((session) => { received = session; });
  assert.ok(subscription.unsubscribe);
  assert.deepEqual(client.calls.at(-1), ['onAuthStateChange']);
});
