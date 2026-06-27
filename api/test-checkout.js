/* TEMPORARY £1 test payment — for verifying live Stripe works, then refund.
   Visit /api/test-checkout in a browser and it redirects you to Stripe.
   Does NOT create a calendar job. DELETE THIS FILE after testing. */

module.exports = async function handler(req, res) {
  const KEY = process.env.STRIPE_SECRET_KEY;
  if (!KEY) { res.statusCode = 500; return res.end("Payments not configured."); }

  const origin = req.headers.origin || ("https://" + req.headers.host);
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", origin + "/index.html?test=paid");
  params.append("cancel_url", origin + "/index.html");
  params.append("line_items[0][quantity]", "1");
  params.append("line_items[0][price_data][currency]", "gbp");
  params.append("line_items[0][price_data][unit_amount]", "100");
  params.append("line_items[0][price_data][product_data][name]", "Test payment (£1) — please refund");

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const s = await r.json();
    if (!r.ok || !s.url) {
      res.statusCode = 502;
      return res.end("Could not create test checkout: " + ((s.error && s.error.message) || ""));
    }
    res.statusCode = 302;
    res.setHeader("Location", s.url);
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.end("Error creating test checkout.");
  }
};
