export function parseRoute(hash) {
  const path = (hash || '').replace(/^#/, '');
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return { name: 'overview', params: {} };
  if (parts[0] === 'overview') return { name: 'overview', params: {} };
  if (parts[0] === 'schools') return { name: 'schools', params: {} };
  if (parts[0] === 'requests') return { name: 'requests', params: {} };
  if (parts[0] === 'locations' && parts[1]) return { name: 'location', params: { id: parts[1] } };
  return { name: 'overview', params: {} };
}

export function createRouter({ onChange }) {
  function current() {
    return parseRoute(window.location.hash);
  }

  function navigate(hash) {
    window.location.hash = hash;
  }

  function start() {
    window.addEventListener('hashchange', () => onChange(current()));
    onChange(current());
  }

  return { current, navigate, start };
}
