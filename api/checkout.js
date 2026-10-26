// POST /api/checkout — crée une page de paiement Stripe (abonnement 39 € HT/mois).
// Deux cas : client connecté (restaurant_id + jeton) ou paiement direct sans compte (e-mail + nom du resto) :
// dans ce cas le compte et l'espace client sont créés automatiquement après le paiement (voir stripe-webhook.js).
import { env, json, fail, stripe, siteUrl, currentUser, ownedRestaurant } from './_lib.js';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const site = siteUrl(req);
    const base = {
      mode: 'subscription',
      line_items: { 0: { price: env('STRIPE_PRICE_ID'), quantity: 1 } },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      locale: 'fr',
      success_url: `${site}/merci.html?session_id={CHECKOUT_SESSION_ID}`
    };
    if (body.restaurant_id) {
      const user = await currentUser(req);
      const r = await ownedRestaurant(user.id, body.restaurant_id);
      const trialEnd = Math.floor(new Date(r.trial_ends_at).getTime() / 1000);
      const keepTrial = r.plan_status === 'trial' && trialEnd - Date.now() / 1000 > 2 * 86400;
      const session = await stripe('checkout/sessions', {
        ...base,
        ...(r.stripe_customer_id ? { customer: r.stripe_customer_id } : { customer_email: user.email }),
        client_reference_id: r.id,
        metadata: { restaurant_id: r.id },
        subscription_data: { metadata: { restaurant_id: r.id }, ...(keepTrial ? { trial_end: trialEnd } : {}) },
        cancel_url: `${site}/espace.html?r=${r.id}`
      });
      return json({ url: session.url });
    }
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.restaurant_name || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return json({ error: 'E-mail et nom du restaurant requis' }, 400);
    const meta = { signup_email: email, restaurant_name: name.slice(0, 200), city: String(body.city || '').slice(0, 120),
      phone: String(body.phone || '').slice(0, 40), google_maps_url: String(body.google_maps_url || '').slice(0, 480) };
    const session = await stripe('checkout/sessions', {
      ...base, customer_email: email, metadata: meta, subscription_data: { metadata: meta },
      cancel_url: `${site}/inscription.html`
    });
    return json({ url: session.url });
  } catch (e) { return fail(e); }
}
