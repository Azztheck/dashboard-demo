// Déchiffre à la volée les fichiers de app/ (servis depuis enc/)
const CFG = {"sel": "51cd3b7a1da14ed1c93b2d4a72ec57f0", "iter": 300000};
const BASE = new URL('./', self.location).pathname;
const MIME = {html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css',json:'application/json',
  jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',mp4:'video/mp4',mp3:'audio/mpeg'};
let KEY = null;
const db = () => new Promise((ok, ko) => { const r = indexedDB.open('demo', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = ko });
const idb = (mode, f) => db().then(d => new Promise((ok, ko) => { const t = d.transaction('k', mode); const q = f(t.objectStore('k')); t.oncomplete = () => ok(q.result); t.onerror = ko }));
const sel = Uint8Array.from(CFG.sel.match(/../g), x => parseInt(x, 16));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('message', e => {
  if (e.data && e.data.raw) e.waitUntil(crypto.subtle.importKey('raw', e.data.raw, 'AES-GCM', false, ['decrypt'])
    .then(k => { KEY = k; return idb('readwrite', s => s.put(k, 'key')) }).then(() => e.source.postMessage('ok')));
});
async function getKey() { if (!KEY) KEY = await idb('readonly', s => s.get('key')).catch(() => null); return KEY }
async function nom(rel) {
  const b = new TextEncoder().encode(rel.normalize('NFC')), x = new Uint8Array(sel.length + b.length);
  x.set(sel); x.set(b, sel.length);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', x));
  return [...h].map(v => v.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/')) {  // serveur local absent : GET = copie figée, le reste ignoré
    if (e.request.method !== 'GET') return e.respondWith(new Response('', {status: 404}));
    u.pathname = BASE + 'app/api/' + u.pathname.slice(5).replace(/\/$/, '') + '.json';
  } else if (!u.pathname.startsWith(BASE + 'app/')) return;
  e.respondWith((async () => {
    const k = await getKey();
    if (!k) return Response.redirect(BASE, 302);
    let rel = decodeURIComponent(u.pathname.slice(BASE.length + 4));
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const r = await fetch(BASE + 'enc/' + await nom(rel) + '.bin');
    if (!r.ok) return new Response('', {status: 404});
    const buf = await r.arrayBuffer();
    try {
      const data = await crypto.subtle.decrypt({name: 'AES-GCM', iv: buf.slice(0, 12)}, k, buf.slice(12));
      return new Response(data, {headers: {'Content-Type': MIME[rel.split('.').pop().toLowerCase()] || 'application/octet-stream'}});
    } catch { return Response.redirect(BASE, 302) }
  })());
});
