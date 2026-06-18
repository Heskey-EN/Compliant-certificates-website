/* Compliant Property Certificates — auth helpers.
   Requires supabase-js UMD + js/supabase-config.js to be loaded first. */

/* Fetch the logged-in user's profile (role, username, name). */
async function getProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("id, username, full_name, role")
    .eq("id", user.id)
    .single();
  if (error) return null;
  return data;
}

/* Guard a page: redirect to login if there's no session.
   Returns the profile when signed in. */
async function requireSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.replace("login.html");
    return null;
  }
  return getProfile();
}

async function logout() {
  await sb.auth.signOut();
  window.location.replace("login.html");
}

/* Wire up the login form (login.html). */
function initLoginForm() {
  const form = document.querySelector("#login-form");
  if (!form) return;
  const note = form.querySelector(".form-note");
  const submitBtn = form.querySelector("button[type=submit]");

  // If already signed in, skip straight to the dashboard.
  sb.auth.getSession().then(function ({ data: { session } }) {
    if (session) window.location.replace("dashboard.html");
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) return;

    submitBtn.disabled = true;
    note.className = "form-note show";
    note.textContent = "Signing in…";

    const { error } = await sb.auth.signInWithPassword({
      email: usernameToEmail(username),
      password: password,
    });

    if (error) {
      note.className = "form-note show error";
      note.textContent = "Incorrect username or password. Please try again.";
      submitBtn.disabled = false;
      return;
    }
    window.location.replace("dashboard.html");
  });
}

document.addEventListener("DOMContentLoaded", initLoginForm);
