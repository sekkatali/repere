// POST /api/send-scan — envoie au restaurant le lien de son scan (Gmail d'Ali, SMTP + mot de passe d'application).
// Admin uniquement. Le scan doit être prêt (rempli par l'agent).
import nodemailer from 'nodemailer';
import { env, json, fail, userDb, bearer, requireAdmin, siteUrl } from './_lib.js';

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function scanMail(scan, base) {
  const r = scan.result || {};
  const name = r.name || scan.restaurant;
  const link = `${base.replace(/\/$/, '')}/scan?t=${scan.token}`;
  const lines = [
    'Bonjour,',
    '',
    `Le scan de ${name} est prêt.${r.summary ? ' ' + r.summary : ''}`,
    '',
    `Vous y trouverez votre note, vos avis sans réponse, votre place dans le quartier sur Google Maps, et ${(r.replies || []).length || 10} réponses prêtes pour vos derniers avis, à copier-coller sur votre fiche.`,
    '',
    `Voir le scan : ${link}`,
    '',
    'Si vous voulez que vos avis reçoivent une réponse sans y penser, Repère s\'en occupe : vous validez chaque réponse d\'un « OK » par WhatsApp, SMS ou e-mail. Essai gratuit de 14 jours, sans carte bancaire.',
    '',
    'Ali Sekkat',
    'Repère'
  ];
  return { subject: `Votre scan Repère : ${name}`, text: lines.join('\n'), link };
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    const db = (path, opts) => userDb(bearer(req), path, opts);
    const { scan_id, resend } = await req.json().catch(() => ({}));
    if (!scan_id) return json({ error: 'Scan manquant' }, 400);
    const s = (await db(`scan_requests?id=eq.${encodeURIComponent(scan_id)}&select=*`))?.[0];
    if (!s) return json({ error: 'Scan introuvable' }, 404);
    if (!EMAIL_RX.test(s.email || '')) return json({ error: 'Adresse e-mail invalide' }, 400);
    if (!s.result || !['pret', 'envoye', 'client'].includes(s.status)) return json({ error: 'Le scan n\'est pas encore prêt' }, 409);
    if (s.sent_at && !resend) return json({ error: 'Ce scan a déjà été envoyé' }, 409);

    const { subject, text, link } = scanMail(s, process.env.SITE_URL || siteUrl(req));
    const user = env('GMAIL_USER');
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass: env('GMAIL_APP_PASSWORD') } });
    await transport.sendMail({ from: { name: process.env.SENDER_NAME || 'Ali Sekkat · Repère', address: user }, to: s.email, subject, text });

    await db(`scan_requests?id=eq.${s.id}`, { method: 'PATCH', body: { status: s.status === 'client' ? 'client' : 'envoye', sent_at: new Date().toISOString() } });
    return json({ ok: true, link });
  } catch (e) { return fail(e); }
}
