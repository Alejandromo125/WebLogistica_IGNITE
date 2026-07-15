// js/main.js
import { supabase } from './supabaseClient.js';
import { createAuthModule } from './auth.js';
import { createApi } from './api.js';
import { createStore } from './store.js';
import { createRouter } from './router.js';
import { renderOverview } from './overview.js';
import { renderSchools } from './schools.js';
import { renderLocationDetail } from './locationDetail.js';
import { renderRequests } from './requests.js';
import { getInitialTheme, applyTheme } from './theme.js';
import { mountParticles } from './particles.js';

const THEME_KEY = 'ignite-vault-theme';
let currentTheme = getInitialTheme(localStorage.getItem(THEME_KEY));
applyTheme(currentTheme);
mountParticles(document.body);

const themeToggleBtn = document.getElementById('themeToggle');
function updateThemeToggleButton() {
  themeToggleBtn.textContent = currentTheme === 'light' ? '🌙' : '☀️';
  themeToggleBtn.setAttribute(
    'aria-label',
    currentTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
  );
}
updateThemeToggleButton();
themeToggleBtn.addEventListener('click', () => {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(currentTheme);
  localStorage.setItem(THEME_KEY, currentTheme);
  updateThemeToggleButton();
});

const auth = createAuthModule(supabase);
const api = createApi(supabase);
const store = createStore(api);

const viewport = document.getElementById('viewport');
const tabBar = document.getElementById('tabBar');
const accountArea = document.getElementById('accountArea');

const TABS = [
  { name: 'overview', label: 'Overview', hash: '#/overview' },
  { name: 'schools', label: 'Schools', hash: '#/schools' },
  { name: 'requests', label: 'Requests', hash: '#/requests', adminOnly: true },
];

let isAdmin = false;
let currentUserId = null;

function renderTabBar(activeName) {
  tabBar.innerHTML = '';
  TABS.filter(t => !t.adminOnly || isAdmin).forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (t.name === activeName ? ' active' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', () => router.navigate(t.hash));
    tabBar.appendChild(btn);
  });
}

async function renderRoute(route) {
  if (!currentUserId) return;

  if (route.name === 'requests' && !isAdmin) {
    router.navigate('#/overview');
    return;
  }

  renderTabBar(route.name);
  const ctx = {
    api, store, isAdmin, currentUserId,
    navigate: router.navigate,
    rerender: () => renderRoute(router.current()),
  };

  if (route.name === 'overview') {
    renderOverview(viewport, ctx);
  } else if (route.name === 'schools') {
    renderSchools(viewport, ctx);
  } else if (route.name === 'location') {
    renderLocationDetail(viewport, { ...ctx, locationId: route.params.id });
  } else if (route.name === 'requests') {
    renderRequests(viewport, ctx);
  }
}

const router = createRouter({ onChange: renderRoute });

function renderLoginScreen(message) {
  tabBar.style.display = 'none';
  tabBar.innerHTML = '';
  viewport.innerHTML = `
    <div class="login-screen">
      <h2>Ignite Vault — Sign in</h2>
      <form id="loginForm">
        <label>Email<input name="email" type="email" required></label>
        <label>Password<input name="password" type="password" required></label>
        <div id="loginError" class="live-status error" style="display:none; margin-bottom:12px;"></div>
        <button type="submit" class="chip">Log in</button>
      </form>
    </div>
  `;
  if (message) {
    const el = document.getElementById('loginError');
    el.textContent = message;
    el.style.display = 'block';
  }
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await auth.signIn(form.email.value, form.password.value);
      await refreshAuthUI();
    } catch (err) {
      renderLoginScreen('Login failed: ' + err.message);
    }
  });
}

function renderAccountArea(profile) {
  accountArea.innerHTML = `
    <span class="who">Logged in as ${profile.role}</span>
    <button id="logoutBtn" class="chip">Log out</button>
  `;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await auth.signOut();
      await refreshAuthUI();
    } catch (err) {
      alert('Logout failed: ' + err.message);
    }
  });
}

async function refreshAuthUI() {
  let profile;
  try {
    profile = await auth.getCurrentProfile();
  } catch (err) {
    accountArea.innerHTML = '';
    renderLoginScreen('Could not check session: ' + err.message);
    return;
  }

  if (!profile) {
    isAdmin = false;
    currentUserId = null;
    store.clear();
    accountArea.innerHTML = '';
    renderLoginScreen();
    return;
  }

  isAdmin = profile.role === 'admin';
  currentUserId = profile.id;
  renderAccountArea(profile);

  try {
    await store.refresh();
  } catch (err) {
    // Data load failed, but the session itself is fine — show the error in the
    // viewport (tab bar stays hidden, account area stays put), not the login screen.
    viewport.innerHTML = '<section><div class="empty-note" id="loadErrorNote"></div></section>';
    document.getElementById('loadErrorNote').textContent = 'Could not load data: ' + err.message;
    return;
  }

  tabBar.style.display = '';
  if (!window.location.hash) window.location.hash = '#/overview';
  await renderRoute(router.current());
}

router.start();
refreshAuthUI();
