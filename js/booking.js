/* Compliant Property Certificates — online EPC booking (contact.html #book).
   Gates by postcode (SM4 only) and bedrooms, shows the price, then starts a
   Stripe Checkout via /api/create-checkout-session. */

document.addEventListener("DOMContentLoaded", function () {
  var check = document.getElementById("booking-check");
  if (!check) return;

  var details = document.getElementById("booking-details");
  var msg = document.getElementById("booking-msg");
  var priceBox = document.getElementById("booking-price");
  var payMsg = document.getElementById("booking-pay-msg");
  var payBtn = document.getElementById("b-pay");

  var PRICES = { "0-1": 54, "2-3": 59, "4-5": 64 }; // £, display only — server re-checks
  var current = null; // { postcode, bedrooms }

  function isSM4(pc) { return /^SM4\d/.test(String(pc).replace(/\s+/g, "").toUpperCase()); }

  function setMsg(el, text, kind) {
    el.textContent = text || "";
    el.className = "booking-msg" + (text ? " show" : "") + (kind ? " " + kind : "");
  }

  check.addEventListener("submit", function (e) {
    e.preventDefault();
    var postcode = document.getElementById("b-postcode").value.trim();
    var bedrooms = document.getElementById("b-bedrooms").value;
    details.hidden = true;
    setMsg(payMsg, "");

    if (!postcode || !bedrooms) {
      setMsg(msg, "Please enter your postcode and choose the number of bedrooms.", "err");
      return;
    }
    if (!isSM4(postcode)) {
      setMsg(msg, "Online booking is currently available for SM4 postcodes only. For your area, please call 0203 488 0550 or send an enquiry above and we'll book you in.", "err");
      return;
    }
    if (bedrooms === "6+") {
      setMsg(msg, "For 6+ bedroom properties we set the price after assessment. Please call 0203 488 0550 to book.", "err");
      return;
    }
    // Eligible
    setMsg(msg, "");
    current = { postcode: postcode, bedrooms: bedrooms };
    priceBox.innerHTML = "Your EPC price: <strong>£" + PRICES[bedrooms] + "</strong> &middot; " +
      bedrooms + " bedroom &middot; " + postcode.toUpperCase();
    details.hidden = false;
    payBtn.textContent = "Book & pay £" + PRICES[bedrooms];
    document.getElementById("b-name").focus();
  });

  details.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!current) return;
    var email = document.getElementById("b-email").value.trim();
    var date = document.getElementById("b-date").value;
    var name = document.getElementById("b-name").value.trim();
    if (!name || !email || !date) {
      setMsg(payMsg, "Please fill in your name, email and preferred date.", "err");
      return;
    }
    payBtn.disabled = true;
    setMsg(payMsg, "Taking you to secure payment…");

    fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postcode: current.postcode,
        bedrooms: current.bedrooms,
        name: name,
        email: email,
        phone: document.getElementById("b-phone").value.trim(),
        address: document.getElementById("b-address").value.trim(),
        job_date: date,
        job_time: document.getElementById("b-time").value,
        notes: document.getElementById("b-notes").value.trim(),
      }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.j.url) {
          payBtn.disabled = false;
          setMsg(payMsg, res.j.error || "Sorry, we couldn't start payment. Please try again or call us.", "err");
          return;
        }
        window.location.href = res.j.url;
      })
      .catch(function () {
        payBtn.disabled = false;
        setMsg(payMsg, "Sorry, we couldn't reach the payment provider. Please try again or call us.", "err");
      });
  });
});
