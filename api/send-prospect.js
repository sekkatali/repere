// POST /api/send-prospect — envoie un mail de prospection depuis l'admin (Gmail d'Ali, via SMTP + mot de passe d'application).
// Garde-fous : admin uniquement, jamais deux envois au même resto, plafond d'envois par jour (délivrabilité).
import nodemailer from 'nodemailer';
import { env, json, fail, db, requireAdmin } from './_lib.js';

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req) {
  try {
    await requireAdmin(req);
    const { prospect_id, subject, body } = await req.json().catch(() => ({}));
    if (!prospect_id || !String(subject || '').trim() || !String(body || '').trim()) return json({ error: 'Objet et texte requis' }, 400);

    const p = (await db(`prospects?id=eq.${encodeURIComponent(prospect_id)}&select=*`))?.[0];
    if (!p) return json({ error: 'Prospect introuvable' }, 404);
    if (!p.email || !EMAIL_RX.test(p.email)) return json({ error: 'Pas d\'adresse e-mail valide pour ce restaurant' }, 400);
    if (p.sent_at || !['brouillon', 'a_rediger'].includes(p.status)) return json({ error: 'Ce restaurant a déjà été contacté ou ne doit pas l\'être' }, 409);

    // Même adresse déjà contactée ailleurs ?
    const dup = await db(`prospects?email=eq.${encodeURIComponent(p.email)}&sent_at=not.is.null&select=id`);
    if (dup?.length) return json({ error: 'Cette adresse a déjà reçu un mail' }, 409);

    // Plafond du jour (heure de Paris)
    const cap = Number(process.env.DAILY_SEND_CAP || 20);
    const now = new Date();
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const offset = Date.parse(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' })) - Date.parse(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const startUtc = new Date(Date.parse(day + 'T00:00:00Z') - offset).toISOString();
    const today = await db(`prospects?sent_at=gte.${encodeURIComponent(startUtc)}&select=id`);
    if ((today?.length || 0) >= cap) return json({ error: `Plafond atteint : ${cap} mails aujourd'hui. Reprenez demain (c'est ce qui protège votre adresse du spam).` }, 429);

    const user = env('GMAIL_USER');
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass: env('GMAIL_APP_PASSWORD') } });
    const info = await transport.sendMail({
      from: { name: process.env.SENDER_NAME || 'Ali Sekkat · Repère', address: user },
      to: p.email,
      subject: String(subject).trim().slice(0, 200),
      text: String(body).trim(),
      headers: { 'List-Unsubscribe': `<mailto:${user}?subject=stop>` }
    });

    await db(`prospects?id=eq.${p.id}`, { method: 'PATCH', body: {
      status: 'envoye', subject: String(subject).trim(), body: String(body).trim(), sent_at: new Date().toISOString(), message_id: info.messageId || null
    } });
    return json({ ok: true, sent_today: (today?.length || 0) + 1, cap });
  } catch (e) { return fail(e); }
}
