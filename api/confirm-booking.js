/* Vercel serverless function — confirm a paid Stripe checkout and add the job
   to the calendar. Called by success.html with ?session_id=...
   Verifies the session really is paid by retrieving it from Stripe (so a
   forged request can't create a job), then inserts the job via the Supabase
   service_role key. De-duplicates on the Stripe session id.
   Env vars: STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY (set in Vercel). */

module.exports = async function handler(req, res) {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://mndsjaagubxtdcqdjsbj.supabase.co";

  if (!STRIPE_SECRET_KEY || !SERVICE_KEY) {
    return res.status(500).json({ error: "Booking confirmation is not configured." });
  }

  const sessionId = (req.query && req.query.session_id) ||
    (req.body && (typeof req.body === "string" ? "" : req.body.session_id)) || "";
  if (!sessionId) return res.status(400).json({ error: "Missing session id." });

  try {
    // 1. Retrieve the session from Stripe and confirm it is paid.
    const sRes = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId), {
      headers: { Authorization: "Bearer " + STRIPE_SECRET_KEY },
    });
    const session = await sRes.json();
    if (!sRes.ok) return res.status(400).json({ error: "Could not verify this payment." });
    if (session.payment_status !== "paid") return res.status(402).json({ error: "This booking has not been paid." });

    const m = session.metadata || {};
    const sb = function (path, opts) {
      return fetch(SUPABASE_URL + "/rest/v1/" + path, Object.assign({
        headers: {
          apikey: SERVICE_KEY,
          Authorization: "Bearer " + SERVICE_KEY,
          "Content-Type": "application/json",
        },
      }, opts));
    };

    // 2. If we've already recorded this session, return it (idempotent).
    const existingRes = await sb("jobs?select=id&stripe_session_id=eq." + encodeURIComponent(sessionId), {});
    const existing = await existingRes.json();
    if (Array.isArray(existing) && existing.length) {
      return res.status(200).json({ ok: true, already: true, booking: summary(m) });
    }

    // 3. Insert the job (created_by null = an online customer booking).
    const insertRes = await sb("jobs", {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        created_by: null,
        source: "online",
        service: m.service || "EPC",
        postcode: m.postcode || null,
        address: m.address || null,
        job_date: m.job_date,
        job_time: m.job_time || null,
        notes: m.notes || null,
        customer_name: m.customer_name || null,
        customer_email: m.customer_email || session.customer_email || null,
        customer_phone: m.customer_phone || null,
        bedrooms: m.bedrooms || null,
        amount_paid: m.amount ? parseInt(m.amount, 10) : null,
        payment_status: "paid",
        stripe_session_id: session.id,
        status: "scheduled",
      }),
    });
    if (!insertRes.ok && insertRes.status !== 409) {
      const txt = await insertRes.text();
      return res.status(502).json({ error: "Payment received, but saving the booking failed.", detail: txt });
    }

    return res.status(200).json({ ok: true, booking: summary(m) });
  } catch (e) {
    return res.status(500).json({ error: "Unexpected error confirming the booking." });
  }

  function summary(m) {
    return {
      service: m.service || "EPC",
      postcode: m.postcode || "",
      job_date: m.job_date || "",
      job_time: m.job_time || "",
      amount: m.amount ? parseInt(m.amount, 10) : null,
    };
  }
};
