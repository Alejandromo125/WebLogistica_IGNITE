export function createAuthModule(client) {
  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data.session;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async function getSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(error.message);
    return data.session;
  }

  async function getCurrentProfile() {
    const session = await getSession();
    if (!session) return null;
    const { data, error } = await client
      .from('profiles')
      .select('id, role')
      .eq('id', session.user.id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  function onAuthStateChange(callback) {
    const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
    return data.subscription;
  }

  return { signIn, signOut, getSession, getCurrentProfile, onAuthStateChange };
}
