// Repère — outils partagés des fonctions serveur (Vercel). Aucune dépendance : Stripe et Supabase sont appelés en HTTP.
import crypto from 'node:crypto';

export const env = (k) => {
  const v = process.env[k];
  if (!v) throw Object.assign(new Error(`Configuration manquante : ${k}`), { status: 503 });
  return v;
};

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const fail = (e) => json({ error: e.message || 'Erreur' }, e.status || 500);

export const siteUrl = (req) => process.env.SITE_URL || new URL(req.url).origin;

// --- Stripe ---------------------------------------------------------------
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}
export async function stripe(path, body, method = 'POST') {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method,
    headers: { Authorization: 'Bearer ' + env('STRIPE_SECRET_KEY'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : form(body || {})
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error?.message || 'Erreur Stripe'), { status: 502 });
  return j;
}
export function verifyStripe(payload, header) {
  const secret = env('STRIPE_WEBHOOK_SECRET');
  const parts = Object.fromEntries((header || '').split(',').map((p) => p.split('=')));
  const sigs = (header || '').split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!parts.t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${payload}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// --- Supabase (clé service, côté serveur uniquement) ------------------------------
const sbHeaders = () => ({ apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY'), 'Content-Type': 'application/json' });
export async function db(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(env('SUPABASE_URL') + '/rest/v1/' + path, {
    method, headers: { ...sbHeaders(), ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error('Base de données : ' + t), { status: 500 });
  return t ? JSON.parse(t) : null;
}
export async function auth(path, { method = 'POST', body, query = '' } = {}) {
  const r = await fetch(env('SUPABASE_URL') + '/auth/v1/' + path + query, { method, headers: sbHeaders(), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  return { ok: r.ok, status: r.status, data: t ? JSON.parse(t) : null };
}
// Vérifie le jeton de l'utilisateur connecté (envoyé par la page) et renvoie l'utilisateur.
export async function currentUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Non connecté'), { status: 401 });
  const r = await fetch(env('SUPABASE_URL') + '/auth/v1/user', { headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: 'Bearer ' + token } });
  if (!r.ok) throw Object.assign(new Error('Session expirée, reconnectez-vous'), { status: 401 });
  return r.json();
}
export async function ownedRestaurant(userId, restaurantId) {
  const rows = await db(`restaurants?id=eq.${encodeURIComponent(restaurantId)}&owner_id=eq.${userId}&select=*`);
  if (!rows?.length) throw Object.assign(new Error('Établissement introuvable'), { status: 404 });
  return rows[0];
}
