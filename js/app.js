import { getCurrentUser, setCurrentUser } from './user.js';
import './watch.js';
import './food.js';

const APP_VERSION = '1.8.0';
document.getElementById('version-badge').textContent = 'v' + APP_VERSION;

// ---------------- Login gate ----------------
function showLoginGate() {
  document.getElementById('login-gate').classList.remove('hidden');
  document.getElementById('landing').classList.add('hidden');
}

function hideLoginGate() {
  document.getElementById('login-gate').classList.add('hidden');
  document.getElementById('landing-user-name').textContent = getCurrentUser();
}

document.querySelectorAll('.login-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setCurrentUser(btn.dataset.user);
    hideLoginGate();
    navigate('home');
  });
});

document.getElementById('switch-user-btn').addEventListener('click', () => {
  showLoginGate();
});

// ---------------- Router ----------------
const SECTIONS = ['home', 'watch', 'food', 'activities'];

export function navigate(route) {
  if (!SECTIONS.includes(route)) route = 'home';
  window.location.hash = route;
  render(route);
}

function render(route) {
  document.getElementById('landing').classList.toggle('hidden', route !== 'home');
  document.getElementById('section-watch').classList.toggle('hidden', route !== 'watch');
  document.getElementById('section-food').classList.toggle('hidden', route !== 'food');
  document.getElementById('section-activities').classList.toggle('hidden', route !== 'activities');

  window.scrollTo(0, 0);
  document.dispatchEvent(new CustomEvent('route-changed', { detail: { route } }));
}

document.querySelectorAll('[data-route]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.route));
});

document.querySelectorAll('[data-close-modal]').forEach(el => {
  el.addEventListener('click', () => {
    document.getElementById(el.dataset.closeModal).classList.add('hidden');
  });
});

// ---------------- Boot ----------------
function boot() {
  if (getCurrentUser()) {
    hideLoginGate();
    const initialRoute = window.location.hash.replace('#', '') || 'home';
    render(SECTIONS.includes(initialRoute) ? initialRoute : 'home');
  } else {
    showLoginGate();
  }
}

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Non-fatal — app still works without offline caching
    });
  });
}
