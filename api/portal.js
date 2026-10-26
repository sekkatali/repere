// POST /api/portal — ouvre l'espace de facturation Stripe (carte, factures, résiliation).
import { json, fail, stripe, siteUrl, currentUser, ownedRestaurant } from './_lib.js';

export async function POST(req) {
  try {
    const { restaurant_id } = await req.json().catch(() => ({}));
    const user = await currentUser(req);
    const r = await ownedRestaurant(user.id, restaurant_id);
    if (!r.stripe_customer_id) return json({ error: "Aucun paiement enregistré pour cet établissement" }, 400);
    const s = await stripe('billing_portal/sessions', { customer: r.stripe_customer_id, return_url: `${siteUrl(req)}/espace.html?r=${r.id}` });
    return json({ url: s.url });
  } catch (e) { return fail(e); }
}
