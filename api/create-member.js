/* Vercel serverless function — admin creates a member account.
   Uses the Supabase service_role key, which MUST be set as an environment
   variable in Vercel (SUPABASE_SERVICE_ROLE_KEY) and NEVER committed.

   Flow: verify the caller's session token -> confirm they're an admin
   -> create the new member via Supabase's admin API. The handle_new_user
   trigger then creates the member's profile from the metadata below. */

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://mndsjaagubxtdcqdjsbj.supabase.co";
  // Must match LOGIN_EMAIL_DOMAIN in js/supabase-config.js
  const EMAIL_DOMAIN = "compliantpropertycertificates.co.uk";

  if (!SERVICE_KEY) {
    return res.status(500).json({ error: "Server not configured: missing service role key." });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const token = body.token;
  const username = (body.username || "").trim();
  const fullName = (body.full_name || "").trim();
  const password = body.password || "";

  if (!token) return res.status(401).json({ error: "Not authenticated." });
  if (!username || !password) return res.status(400).json({ error: "Username and password are required." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return res.status(400).json({ error: "Username can only contain letters, numbers, dots, hyphens and underscores." });
  }

  try {
    // 1. Verify the caller's token and get their user id.
    const meRes = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + token },
    });
    if (!meRes.ok) return res.status(401).json({ error: "Your session has expired — please log in again." });
    const me = await meRes.json();

    // 2. Confirm the caller is an admin.
    const profRes = await fetch(
      SUPABASE_URL + "/rest/v1/profiles?select=role&id=eq." + encodeURIComponent(me.id),
      { headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY } }
    );
    const profs = await profRes.json();
    if (!Array.isArray(profs) || !profs[0] || profs[0].role !== "admin") {
      return res.status(403).json({ error: "Only admins can create accounts." });
    }

    // 3. Create the member (same username->email scheme as the front-end).
    const email = username.toLowerCase() + "@" + EMAIL_DOMAIN;
    const createRes = await fetch(SUPABASE_URL + "/auth/v1/admin/users", {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { username: username, full_name: fullName || null, role: "member" },
      }),
    });
    const created = await createRes.json();
    if (!createRes.ok) {
      const msg = created.msg || created.error_description || created.error || "Could not create member.";
      const friendly = /already.*registered|already exists/i.test(msg)
        ? "That username is already taken."
        : msg;
      return res.status(400).json({ error: friendly });
    }

    return res.status(200).json({ ok: true, username: username });
  } catch (e) {
    return res.status(500).json({ error: "Unexpected error creating the member." });
  }
};
