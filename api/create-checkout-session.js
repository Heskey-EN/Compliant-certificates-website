/* Vercel serverless function — start a Stripe Checkout for an online EPC booking.
   The price is decided HERE on the server from postcode + bedrooms, so it can
   never be tampered with by the browser. Requires env var STRIPE_SECRET_KEY
   (set in Vercel; use a test key sk_test_... while setting up). */

// EPC prices in pence, for SM4 postcodes only.
const SM4_EPC_PRICES = { "0-1": 5400, "2-3": 5900, "4-5": 6400 };

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: "Payments are not configured yet." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const postcode = String(body.postcode || "").trim().toUpperCase();
  const isSM4 = /^SM4\d/.test(postcode.replace(/\s+/g, ""));
  const bedrooms = String(body.bedrooms || "");
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const address = String(body.address || "").trim();
  const jobDate = String(body.job_date || "").trim();
  const jobTime = String(body.job_time || "").trim();
  const notes = String(body.notes || "").trim();

  // Eligibility + price (server is the source of truth)
  if (!isSM4) {
    return res.status(400).json({ error: "Online booking is only available for SM4 postcodes. Please contact us to book." });
  }
  const amount = SM4_EPC_PRICES[bedrooms];
  if (!amount) {
    return res.status(400).json({ error: "For this property size the price is set after assessment — please call us to book." });
  }
  if (!email || !jobDate) {
    return res.status(400).json({ error: "Please provide an email address and preferred date." });
  }
  if (jobDate < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: "Please choose a date in the future." });
  }

  const origin = req.headers.origin || ("https://" + req.headers.host);
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", origin + "/success.html?session_id={CHECKOUT_SESSION_ID}");
  params.append("cancel_url", origin + "/contact.html#book");
  params.append("customer_email", email);
  params.append("line_items[0][quantity]", "1");
  params.append("line_items[0][price_data][currency]", "gbp");
  params.append("line_items[0][price_data][unit_amount]", String(amount));
  params.append("line_items[0][price_data][product_data][name]", "EPC Certificate — " + bedrooms + " bedroom (SM4)");
  // Everything the confirm step needs to create the calendar job:
  const meta = {
    service: "EPC", postcode: postcode, bedrooms: bedrooms,
    customer_name: name, customer_email: email, customer_phone: phone,
    address: address, job_date: jobDate, job_time: jobTime, notes: notes,
    amount: String(amount),
  };
  Object.keys(meta).forEach(function (k) { params.append("metadata[" + k + "]", meta[k]); });

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + STRIPE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const session = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: (session.error && session.error.message) || "Could not start checkout." });
    }
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: "Could not reach the payment provider." });
  }
};
