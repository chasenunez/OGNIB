// common.js - small utility functions for client pages

async function api(path, opts = {}) {
  const res = await fetch(path, Object.assign({
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  }, opts));
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data && data.error) throw new Error(data.error);
  return data;
}

function showMsg(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function validateUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch (e) {
    return false;
  }
}