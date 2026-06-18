/* Vercel serverless function — email a notification when a job is added.
   Sends via Resend (https://resend.com). Configure these env vars in Vercel:
     RESEND_API_KEY  - your Resend API key (required; without it this no-ops)
     NOTIFY_EMAIL    - where to send the alert (required, e.g. your email)
     NOTIFY_FROM     - optional sender, e.g. "CPC <bookings@yourdomain.co.uk>"
                       (defaults to Resend's test sender for getting started)
   The Supabase anon key below is public by design (same as the front-end). */

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
  const NOTIFY_FROM = process.env.NOTIFY_FROM || "Compliant Property Certificates <onboarding@resend.dev>";
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://mndsjaagubxtdcqdjsbj.supabase.co";
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZHNqYWFndWJ4dGRjcWRqc2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTk3MTEsImV4cCI6MjA5NzM3NTcxMX0.4a3PK_ur0idj1iNtlmPqhuTvHDiKloTQWPzcaAZzF-o";

  // Not configured yet — succeed quietly so adding a job is never blocked.
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    return res.status(200).json({ ok: false, skipped: true, reason: "Email notifications not configured." });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const token = body.token;
  const job = body.job || {};
  const addedBy = (body.added_by || "A team member").toString();

  if (!token) return res.status(401).json({ error: "Not authenticated." });

  try {
    // Verify the request comes from a logged-in user (prevents abuse).
    const meRes = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
    });
    if (!meRes.ok) return res.status(401).json({ error: "Invalid session." });

    const esc = function (s) {
      return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
      });
    };
    const when = esc(job.job_date) + (job.job_time ? " at " + esc(String(job.job_time).slice(0, 5)) : "");
    const where = esc(job.address ? job.address + ", " + job.postcode : job.postcode);

    const subject = "New job: " + esc(job.service) + " — " + esc(job.job_date);
    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#16231D;">' +
      '<h2 style="color:#2D8C5C;margin:0 0 12px;">New job added</h2>' +
      '<table style="border-collapse:collapse;font-size:15px;">' +
      "<tr><td style=\"padding:4px 12px 4px 0;color:#50625A;\">Service</td><td><strong>" + esc(job.service) + "</strong></td></tr>" +
      "<tr><td style=\"padding:4px 12px 4px 0;color:#50625A;\">When</td><td>" + when + "</td></tr>" +
      "<tr><td style=\"padding:4px 12px 4px 0;color:#50625A;\">Where</td><td>" + where + "</td></tr>" +
      (job.notes ? "<tr><td style=\"padding:4px 12px 4px 0;color:#50625A;\">Notes</td><td>" + esc(job.notes) + "</td></tr>" : "") +
      "<tr><td style=\"padding:4px 12px 4px 0;color:#50625A;\">Added by</td><td>" + esc(addedBy) + "</td></tr>" +
      "</table></div>";

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: NOTIFY_FROM, to: NOTIFY_EMAIL, subject: subject, html: html }),
    });
    if (!sendRes.ok) {
      const err = await sendRes.json().catch(function () { return {}; });
      return res.status(502).json({ error: err.message || "Email provider rejected the request." });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Could not send notification." });
  }
};
