// js/main.js
import { supabase } from './supabaseClient.js';
import { createAuthModule } from './auth.js';
import { createApi } from './api.js';
import { createSchoolsView } from './schools.js';
import { createRequestsView } from './requests.js';

const auth = createAuthModule(supabase);
const api = createApi(supabase);
const schoolsView = createSchoolsView({ api });
const requestsView = createRequestsView({ api, onStockChange: () => schoolsView.refresh() });
schoolsView.clear();
requestsView.clear();

function setAuthStatus(msg, kind) {
  const el = document.getElementById('authStatus');
  el.textContent = msg;
  el.className = 'live-status ' + (kind || '');
}

async function refreshAuthUI() {
  const loginForm = document.getElementById('loginForm');
  const logoutBtn = document.getElementById('logoutBtn');
  try {
    const profile = await auth.getCurrentProfile();
    if (profile) {
      setAuthStatus(`Logged in as ${profile.role}`, 'live');
      loginForm.style.display = 'none';
      logoutBtn.style.display = '';
      await schoolsView.loadAndRender(profile.role === 'admin', profile.id);
      await requestsView.loadAndRender(profile.role === 'admin', profile.id);
    } else {
      setAuthStatus('Not logged in.', 'idle');
      loginForm.style.display = '';
      logoutBtn.style.display = 'none';
      schoolsView.clear();
      requestsView.clear();
    }
  } catch (err) {
    setAuthStatus('Could not check session: ' + err.message, 'error');
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  setAuthStatus('Logging in…', 'loading');
  try {
    await auth.signIn(email, password);
    await refreshAuthUI();
  } catch (err) {
    setAuthStatus('Login failed: ' + err.message, 'error');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await auth.signOut();
    await refreshAuthUI();
  } catch (err) {
    setAuthStatus('Logout failed: ' + err.message, 'error');
  }
});

refreshAuthUI();
