/* Compliant Property Certificates — dashboard (calendar + jobs).
   Requires supabase-js UMD + js/supabase-config.js + js/auth.js first. */

(function () {
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  let profile = null;
  let isAdmin = false;
  let profilesMap = {};        // user id -> display name (admins only)
  let jobs = [];
  let calYear, calMonth;       // calendar view
  let selectedDate = null;     // YYYY-MM-DD or null

  // ---- helpers ----
  function pad(n) { return String(n).padStart(2, "0"); }
  function formatYMD(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseYMD(s) { const p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function hhmm(t) { return t ? String(t).slice(0, 5) : ""; }
  function prettyFull(ymd) { const d = parseYMD(ymd); return DOW[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear(); }
  function svcClass(s) { return ({ "EPC": "epc", "EICR": "eicr", "Gas Safety": "gas", "PAT": "pat" })[s] || "epc"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }

  // ---- data ----
  async function loadJobs() {
    const { data, error } = await sb
      .from("jobs")
      .select("*")
      .order("job_date", { ascending: true })
      .order("job_time", { ascending: true, nullsFirst: true });
    jobs = error ? [] : (data || []);
  }

  async function loadProfiles() {
    const { data } = await sb.from("profiles").select("id, username, full_name");
    profilesMap = {};
    (data || []).forEach(function (p) { profilesMap[p.id] = p.full_name || p.username; });
  }

  // ---- calendar ----
  function renderCalendar() {
    $("cal-label").textContent = MONTHS[calMonth] + " " + calYear;
    const first = new Date(calYear, calMonth, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const prevDays = new Date(calYear, calMonth, 0).getDate();

    const cells = [];
    for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: prevDays - i, inMonth: false, date: new Date(calYear, calMonth - 1, prevDays - i) });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true, date: new Date(calYear, calMonth, d) });
    let nextDay = 1;
    while (cells.length % 7 !== 0) { cells.push({ day: nextDay, inMonth: false, date: new Date(calYear, calMonth + 1, nextDay) }); nextDay++; }

    const todayYMD = formatYMD(new Date());
    let html = "";
    cells.forEach(function (c) {
      const ymd = formatYMD(c.date);
      const dayJobs = jobs.filter(function (j) { return j.job_date === ymd; });
      let cls = "cal-day" + (c.inMonth ? "" : " other-month") + (ymd === todayYMD ? " today" : "") + (ymd === selectedDate ? " selected" : "");
      let dots = "";
      dayJobs.slice(0, 5).forEach(function (j) { dots += '<span class="cal-dot dot-' + svcClass(j.service) + '"></span>'; });
      html += '<div class="' + cls + '" data-ymd="' + ymd + '" data-in="' + (c.inMonth ? "1" : "0") + '">'
        + '<span class="cal-daynum">' + c.day + "</span>"
        + '<span class="cal-dots">' + dots + "</span></div>";
    });
    const grid = $("calendar-grid");
    grid.innerHTML = html;
    grid.querySelectorAll(".cal-day").forEach(function (el) {
      if (el.getAttribute("data-in") === "1") {
        el.addEventListener("click", function () { selectDay(el.getAttribute("data-ymd")); });
      }
    });
  }

  function selectDay(ymd) {
    selectedDate = (selectedDate === ymd) ? null : ymd;
    renderCalendar();
    renderList();
  }

  // ---- job list ----
  function renderList() {
    const todayYMD = formatYMD(new Date());
    let list, title;
    if (selectedDate) {
      title = "Jobs · " + prettyFull(selectedDate);
      list = jobs.filter(function (j) { return j.job_date === selectedDate; });
      $("clear-day").hidden = false;
    } else {
      title = "Upcoming jobs";
      list = jobs.filter(function (j) { return j.job_date >= todayYMD; });
      $("clear-day").hidden = true;
    }
    $("job-panel-title").textContent = title;

    const listEl = $("job-list");
    if (!list.length) {
      listEl.innerHTML = '<p class="job-empty">' + (selectedDate ? "No jobs on this day." : "No upcoming jobs yet. Click “+ Add job” to create one.") + "</p>";
      return;
    }

    let html = "";
    list.forEach(function (j) {
      const d = parseYMD(j.job_date);
      const t = hhmm(j.job_time);
      const who = isAdmin ? '<div class="job-who">Added by ' + esc(profilesMap[j.created_by] || "—") + "</div>" : "";
      html += '<div class="job-row">'
        + '<div class="job-when"><span class="d">' + d.getDate() + '</span><span class="m">' + MON[d.getMonth()] + "</span>"
        + (t ? '<span class="t">' + t + "</span>" : "") + "</div>"
        + '<div class="job-main">'
          + '<div class="job-where">' + esc(j.address || j.postcode) + "</div>"
          + '<div class="job-meta"><span class="svc svc-' + svcClass(j.service) + '">' + esc(j.service) + "</span>"
            + esc(j.postcode) + (j.notes ? " &middot; " + esc(j.notes) : "") + "</div>"
          + who
        + "</div>"
        + '<button type="button" class="job-del" data-id="' + j.id + '" aria-label="Delete job" title="Delete">'
          + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>'
        + "</button>"
        + "</div>";
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll(".job-del").forEach(function (b) {
      b.addEventListener("click", function () { deleteJob(b.getAttribute("data-id")); });
    });
  }

  async function deleteJob(id) {
    if (!window.confirm("Delete this job? This can't be undone.")) return;
    const { error } = await sb.from("jobs").delete().eq("id", id);
    if (error) { window.alert("Could not delete: " + error.message); return; }
    await loadJobs();
    renderCalendar();
    renderList();
  }

  // ---- add-job modal ----
  function openModal(prefillDate) {
    const form = $("job-form");
    form.reset();
    $("postcode-note").textContent = "";
    $("postcode-note").className = "postcode-note";
    $("job-form-note").className = "form-note";
    $("job-form-note").textContent = "";
    $("job-date").value = prefillDate || formatYMD(new Date());
    $("job-modal").hidden = false;
    $("job-postcode").focus();
  }
  function closeModal() { $("job-modal").hidden = true; }

  async function findPostcode() {
    const input = $("job-postcode");
    const note = $("postcode-note");
    const pc = input.value.trim();
    if (!pc) { note.className = "postcode-note err"; note.textContent = "Enter a postcode first."; return; }
    note.className = "postcode-note"; note.textContent = "Checking…";
    try {
      const res = await fetch("https://api.postcodes.io/postcodes/" + encodeURIComponent(pc));
      const j = await res.json();
      if (j.status === 200 && j.result) {
        const r = j.result;
        input.value = r.postcode; // normalised (e.g. "SW1A 1AA")
        note.className = "postcode-note ok";
        note.textContent = "✓ " + [r.admin_ward, r.admin_district, r.region].filter(Boolean).join(", ");
      } else {
        note.className = "postcode-note err";
        note.textContent = "Postcode not found — check and try again.";
      }
    } catch (e) {
      note.className = "postcode-note err";
      note.textContent = "Couldn't check postcode (no connection?).";
    }
  }

  async function submitJob(e) {
    e.preventDefault();
    const form = $("job-form");
    const note = $("job-form-note");
    const save = $("job-save");
    const postcode = form.postcode.value.trim().toUpperCase();
    const service = form.service.value;
    const job_date = form.job_date.value;
    if (!postcode || !service || !job_date) {
      note.className = "form-note show error";
      note.textContent = "Please add a postcode, service and date.";
      return;
    }
    save.disabled = true;
    note.className = "form-note show"; note.textContent = "Saving…";

    const { error } = await sb.from("jobs").insert({
      created_by: profile.id,
      postcode: postcode,
      address: form.address.value.trim() || null,
      service: service,
      job_date: job_date,
      job_time: form.job_time.value || null,
      notes: form.notes.value.trim() || null,
    });

    save.disabled = false;
    if (error) {
      note.className = "form-note show error";
      note.textContent = "Could not save: " + error.message;
      return;
    }
    closeModal();
    await loadJobs();
    const d = parseYMD(job_date);
    calYear = d.getFullYear(); calMonth = d.getMonth(); selectedDate = job_date;
    renderCalendar();
    renderList();
  }

  // ---- init ----
  document.addEventListener("DOMContentLoaded", async function () {
    profile = await requireSession();
    if (!profile) return; // not signed in — requireSession() redirected
    isAdmin = profile.role === "admin";

    if ($("who")) $("who").textContent = profile.full_name || profile.username;
    if ($("role-badge")) $("role-badge").textContent = isAdmin ? "Admin" : "Member";
    if ($("dash-intro")) {
      $("dash-intro").textContent = isAdmin
        ? "You can see and manage all jobs across every member."
        : "You can see and manage the jobs you've added.";
    }
    const logoutBtn = $("logout-btn");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);

    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();

    if (isAdmin) await loadProfiles();
    await loadJobs();
    renderCalendar();
    renderList();

    // wiring
    $("cal-prev").addEventListener("click", function () {
      calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar();
    });
    $("cal-next").addEventListener("click", function () {
      calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
    });
    $("clear-day").addEventListener("click", function () { selectedDate = null; renderCalendar(); renderList(); });
    $("add-job-btn").addEventListener("click", function () { openModal(selectedDate); });
    $("modal-close").addEventListener("click", closeModal);
    $("job-modal").addEventListener("click", function (e) { if (e.target === this) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("job-modal").hidden) closeModal(); });
    $("postcode-find").addEventListener("click", findPostcode);
    $("job-form").addEventListener("submit", submitJob);
  });
})();
