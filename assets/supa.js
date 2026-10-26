// Repère — client Supabase partagé par les pages connexion / inscription / espace / admin.
// Les deux valeurs ci-dessous sont publiques (clé « publishable ») : la sécurité est assurée par les règles RLS de la base.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const SUPABASE_URL = 'https://powlybocpgjxhrliqgyf.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvd2x5Ym9jcGdqeGhybGlxZ3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3ODY5MTQsImV4cCI6MjEwODM2MjkxNH0.EbP9hPZ0dXRMJKnIa-R-mJhwcGbL7_b04we3Weaq2_c';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
});

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const stars = (n) => '★★★★★☆☆☆☆☆'.slice(5 - (n || 0), 10 - (n || 0));
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const euros = (n) => (n || 0).toLocaleString('fr-FR') + ' €';
export const PRICE = 39;

export function showMsg(el, text, kind = 'ok') {
  el.textContent = text; el.className = 'msg ' + kind; el.classList.remove('hidden');
}

// Renvoie { user, profile } ou redirige vers la connexion.
export async function requireUser() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = '/connexion.html'; return null; }
  const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  return { user: session.user, profile };
}

export async function logout() {
  await sb.auth.signOut();
  location.href = '/connexion.html';
}

export const PLAN = {
  trial: ['Essai gratuit', 'warn'],
  active: ['Abonné', 'ok'],
  past_due: ['Paiement en retard', 'red'],
  canceled: ['Résilié', 'off']
};

export function daysLeft(d) {
  return Math.max(0, Math.ceil((new Date(d) - Date.now()) / 86400000));
}
