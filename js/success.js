/* Compliant Property Certificates — booking confirmation (success.html).
   Reads the Stripe session id from the URL, asks the server to verify the
   payment and add the job to the calendar, then shows the result. */

document.addEventListener("DOMContentLoaded", function () {
  var box = document.getElementById("booking-result");
  if (!box) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var sid = new URLSearchParams(window.location.search).get("session_id");
  if (!sid) {
    box.innerHTML = "<h1>Booking</h1><p class=\"auth-sub\">No booking reference was found. If you've just paid and aren't sure it worked, please call us on 0203 488 0550.</p><a href=\"index.html\" class=\"btn btn-primary btn-block\">Back to home</a>";
    return;
  }

  fetch("/api/confirm-booking?session_id=" + encodeURIComponent(sid))
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (res) {
      if (!res.ok) {
        box.innerHTML = "<h1>Something went wrong</h1><p class=\"auth-sub\">" +
          esc(res.j.error || "We couldn't confirm your booking.") +
          " If you have been charged, please call us on 0203 488 0550 and we'll sort it out straight away.</p>" +
          "<a href=\"contact.html\" class=\"btn btn-primary btn-block\">Contact us</a>";
        return;
      }
      var b = res.j.booking || {};
      var when = esc(b.job_date) + (b.job_time ? " at " + esc(b.job_time) : "");
      var amt = b.amount ? "£" + (b.amount / 100).toFixed(2) : "";
      box.innerHTML =
        "<div class=\"success-tick\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M20 6 9 17l-5-5\"/></svg></div>" +
        "<h1>Booking confirmed</h1>" +
        "<p class=\"auth-sub\">Thank you — your payment was successful and your booking is now in our calendar.</p>" +
        "<ul class=\"booking-summary\">" +
        "<li><span>Service</span><strong>" + esc(b.service || "EPC") + " Certificate</strong></li>" +
        "<li><span>Property</span><strong>" + esc(b.postcode || "") + "</strong></li>" +
        "<li><span>Preferred date</span><strong>" + when + "</strong></li>" +
        (amt ? "<li><span>Paid</span><strong>" + amt + "</strong></li>" : "") +
        "</ul>" +
        "<p>We'll be in touch to confirm your appointment time. Stripe has emailed you a receipt.</p>" +
        "<a href=\"index.html\" class=\"btn btn-primary btn-block\">Back to home</a>";
    })
    .catch(function () {
      box.innerHTML = "<h1>Something went wrong</h1><p class=\"auth-sub\">We couldn't confirm your booking just now. If you have been charged, please call us on 0203 488 0550.</p><a href=\"contact.html\" class=\"btn btn-primary btn-block\">Contact us</a>";
    });
});
