// POST /api/stripe-webhook — Stripe prévient ici après un paiement ou un changement d'abonnement.
// Paiement sans compte : crée le compte (invitation par e-mail = lien de connexion) et l'espace client automatiquement.
import { json, verifyStripe, stripe, db, auth, siteUrl } from './_lib.js';

const STATUS = { trialing: 'trial', active: 'active', past_due: 'past_due', unpaid: 'past_due', incomplete: 'past_due',
  canceled: 'canceled', incomplete_expired: 'canceled', paused: 'canceled' };

async function findProfile(email) {
  const rows = await db(`profiles?email=eq.${encodeURIComponent(email)}&select=id`);
  return rows?.[0] || null;
}

async function accountFromCheckout(session, site) {
  const m = session.metadata || {};
  const email = (session.customer_details?.email || m.signup_email || session.customer_email || '').toLowerCase();
  if (!email) throw new Error('Paiement sans e-mail');
  const redirect = `?redirect_to=${encodeURIComponent(site + '/espace.html')}`;
  let profile = await findProfile(email);
  let restaurantId;
  if (!profile) {
    // Nouveau client : l'invitation crée le compte ; le déclencheur SQL crée le profil et l'établissement à partir des métadonnées.
    const inv = await auth('invite', { body: { email, data: { restaurant_name: m.restaurant_name, city: m.city, phone: m.phone, google_maps_url: m.google_maps_url } }, query: redirect });
    if (!inv.ok) throw new Error('Invitation impossible : ' + JSON.stringify(inv.data));
    profile = await findProfile(email);
    const rows = await db(`restaurants?owner_id=eq.${profile.id}&order=created_at.desc&limit=1&select=id`);
    restaurantId = rows?.[0]?.id;
  } else {
    // Compte existant : on ajoute l'établissement et on envoie un lien de connexion.
    const rows = await db('restaurants', { method: 'POST', prefer: 'return=representation', body: {
      owner_id: profile.id, name: m.restaurant_name || 'Mon restaurant', city: m.city || null, phone: m.phone || null,
      google_maps_url: m.google_maps_url || null, notify_email: email } });
    restaurantId = rows[0].id;
    await auth('otp', { body: { email, create_user: false }, query: redirect });
  }
  return restaurantId;
}

async function applySubscription(restaurantId, sub) {
  if (!restaurantId) return;
  await db(`restaurants?id=eq.${restaurantId}`, { method: 'PATCH', body: {
    plan_status: STATUS[sub.status] || 'active',
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    stripe_subscription_id: sub.id,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString()
      : sub.items?.data?.[0]?.current_period_end ? new Date(sub.items.data[0].current_period_end * 1000).toISOString() : null
  } });
}

export async function POST(req) {
  const payload = await req.text();
  try {
    if (!verifyStripe(payload, req.headers.get('stripe-signature'))) return json({ error: 'Signature invalide' }, 400);
  } catch (e) { return json({ error: e.message }, 503); }
  const event = JSON.parse(payload);
  const o = event.data.object;
  try {
    if (event.type === 'checkout.session.completed' && o.mode === 'subscription') {
      const restaurantId = o.metadata?.restaurant_id || await accountFromCheckout(o, siteUrl(req));
      const sub = await stripe('subscriptions/' + o.subscription, null, 'GET');
      if (!sub.metadata?.restaurant_id) await stripe('subscriptions/' + sub.id, { metadata: { restaurant_id: restaurantId } });
      await applySubscription(restaurantId, sub);
    } else if (event.type.startsWith('customer.subscription.')) {
      let id = o.metadata?.restaurant_id;
      if (!id) id = (await db(`restaurants?stripe_subscription_id=eq.${o.id}&select=id`))?.[0]?.id;
      await applySubscription(id, o);
    } else if (event.type === 'invoice.payment_failed' && o.subscription) {
      await db(`restaurants?stripe_subscription_id=eq.${o.subscription}`, { method: 'PATCH', body: { plan_status: 'past_due' } });
    }
    return json({ received: true });
  } catch (e) {
    console.error('webhook', event.type, e);
    return json({ error: e.message }, 500); // Stripe réessaiera
  }
}
