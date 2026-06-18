/* Compliant Property Certificates — dashboard.
   Requires supabase-js UMD + js/supabase-config.js + js/auth.js first. */

document.addEventListener("DOMContentLoaded", async function () {
  const profile = await requireSession();
  if (!profile) return; // not signed in — requireSession() redirected

  const isAdmin = profile.role === "admin";

  const who = document.querySelector("#who");
  if (who) who.textContent = profile.full_name || profile.username;

  const badge = document.querySelector("#role-badge");
  if (badge) badge.textContent = isAdmin ? "Admin" : "Member";

  const intro = document.querySelector("#dash-intro");
  if (intro) {
    intro.textContent = isAdmin
      ? "You can see and manage all jobs across every member."
      : "You can see and manage the jobs you've added.";
  }

  const logoutBtn = document.querySelector("#logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
});
