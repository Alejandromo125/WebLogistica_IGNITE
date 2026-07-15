// js/theme.js
export function getInitialTheme(storedValue) {
  return storedValue === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
