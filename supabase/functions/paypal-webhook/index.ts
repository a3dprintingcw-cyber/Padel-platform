// Padel Vitals: PayPal tells us about subscription payments here.
// Every event is checked with PayPal before anything changes.
// Secrets (set in Supabase, never in the code): PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_ENV ("live" or "sandbox").
// Deploy with "Verify JWT" switched OFF: PayPal does not send a Supabase token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ENV = Deno.env.get("PAYPAL_ENV") === "live" ? "live" : "sandbox";
const API = ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function token(): Promise<string> {
  const id = Deno.env.get("PAYPAL_CLIENT_ID")!, secret = Deno.env.get("PAYPAL_SECRET")!;
  const r = await fetch(API + "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(id + ":" + secret), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error("paypal token " + r.status);
  return (await r.json()).access_token;
}

async function verified(req: Request, event: unknown, access: string): Promise<boolean> {
  const h = (k: string) => req.headers.get(k) || "";
  const r = await fetch(API + "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: Deno.env.get("PAYPAL_WEBHOOK_ID"),
      webhook_event: event,
    }),
  });
  if (!r.ok) return false;
  return (await r.json()).verification_status === "SUCCESS";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  let event: any;
  try { event = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  let access: string;
  try { access = await token(); } catch (e) { return new Response(String(e), { status: 500 }); }
  if (!(await verified(req, event, access))) return new Response("not verified", { status: 401 });

  const kind: string = event.event_type || "";
  const res = event.resource || {};
  // subscription events carry the subscription itself; payment events point at it
  const subId: string = res.billing_agreement_id || (kind.startsWith("BILLING.SUBSCRIPTION") ? res.id : "") || "";
  let clubId: string = UUID.test(res.custom_id || "") ? res.custom_id : "";

  if (!clubId && subId) {
    const { data } = await db.from("clubs").select("id").eq("paypal_sub", subId).maybeSingle();
    if (data) clubId = data.id;
  }
  if (!clubId && subId) {
    // payment events don't repeat custom_id: ask PayPal which club the subscription belongs to
    const r = await fetch(API + "/v1/billing/subscriptions/" + encodeURIComponent(subId), { headers: { Authorization: "Bearer " + access } });
    if (r.ok) { const s = await r.json(); if (UUID.test(s.custom_id || "")) clubId = s.custom_id; }
  }

  await db.from("billing_events").insert({ club_id: clubId || null, kind, sub_id: subId || null, payload: event });
  if (!clubId) return new Response("no club", { status: 200 });

  const now = new Date();
  const patch: Record<string, unknown> = { billing_updated: now.toISOString() };
  if (subId) patch.paypal_sub = subId;

  switch (kind) {
    case "BILLING.SUBSCRIPTION.ACTIVATED":
    case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
      patch.billing_status = "active"; patch.status = "active"; break;
    case "PAYMENT.SALE.COMPLETED":
      patch.billing_status = "active"; patch.status = "active";
      patch.paid_until = new Date(now.getTime() + 33 * 864e5).toISOString(); break;
    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
      patch.billing_status = "past_due"; break;
    case "BILLING.SUBSCRIPTION.SUSPENDED":
      patch.billing_status = "past_due"; patch.status = "paused"; break;
    case "BILLING.SUBSCRIPTION.CANCELLED":
    case "BILLING.SUBSCRIPTION.EXPIRED":
      patch.billing_status = "cancelled"; patch.status = "paused"; break;
    default:
      return new Response("ignored", { status: 200 });
  }
  const { error } = await db.from("clubs").update(patch).eq("id", clubId);
  if (error) return new Response(error.message, { status: 500 });
  return new Response("ok");
});
