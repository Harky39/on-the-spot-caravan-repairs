/* On The Spot Caravan Repairs — main.js */
(function () {
  "use strict";

  /* ---------- Shared data config (admin-managed content + quote sync) ---------- */
  var DATA_BASE = "https://harky39.github.io/on-the-spot-data";
  var SITE_KEY = "van"; // "car" or "van" — which site this is
  // Fine-grained GitHub token with Contents access to Harky39/on-the-spot-data.
  // If empty, quotes still arrive by email; the staff panel can set an override (Settings tab).
  var GITHUB_TOKEN = "";

  function getDataToken() {
    try { return (localStorage.getItem("otsDataToken") || "").trim() || GITHUB_TOKEN; } catch (_) { return GITHUB_TOKEN; }
  }

  /* ---------- GitHub Contents API helpers (data repo) ---------- */
  function ghHeaders() {
    return {
      Authorization: "Bearer " + getDataToken(),
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    };
  }

  // NOTE: the data repo is served by GitHub Pages from its `gh-pages` branch.
  function ghGet(path) {
    return fetch("https://api.github.com/repos/Harky39/on-the-spot-data/contents/" + path, { headers: ghHeaders() })
      .then(function (r) { if (!r.ok) throw new Error("GitHub API " + r.status); return r.json(); });
  }

  function ghPut(path, base64Content, message, sha) {
    var body = { message: message, content: base64Content, branch: "gh-pages" };
    if (sha) body.sha = sha;
    return fetch("https://api.github.com/repos/Harky39/on-the-spot-data/contents/" + path, {
      method: "PUT", headers: ghHeaders(), body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error("GitHub API " + r.status); return r.json(); });
  }

  function utf8ToBase64(str) { return btoa(unescape(encodeURIComponent(str))); }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var bytes = new Uint8Array(reader.result);
          var binary = "";
          for (var i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          resolve(btoa(binary));
        } catch (err) { reject(err); }
      };
      reader.onerror = function () { reject(new Error("read failed")); };
      reader.readAsArrayBuffer(blob);
    });
  }

  /* ---------- Save quote + photos to the data repo (staff panel) ---------- */
  function saveQuoteToDataRepo(fields, photoFiles) {
    if (!getDataToken()) return Promise.reject(new Error("no data token configured"));
    var id = "q-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    var photos = [];

    function uploadPhoto(file, i) {
      return blobToBase64(file).then(function (b64) {
        var path = "quotes/" + id + "/photo-" + (i + 1) + ".jpg";
        photos.push(path);
        return ghPut(path, b64, "Add quote photo: " + path);
      });
    }

    var chain = Promise.resolve();
    Array.prototype.slice.call(photoFiles || []).slice(0, 4).forEach(function (f, i) {
      chain = chain.then(function () { return uploadPhoto(f, i); });
    });

    return chain.then(function () {
      var quote = {
        id: id, site: SITE_KEY, name: fields.name, phone: fields.phone, type: fields.type,
        message: fields.message || "", photos: photos,
        createdAt: new Date().toISOString(), status: "new"
      };
      return ghPut("quotes/" + id + ".json", utf8ToBase64(JSON.stringify(quote, null, 2)), "Add quote: " + id)
        .then(function () { return updateQuoteIndex(quote); });
    });
  }

  function updateQuoteIndex(quote) {
    return ghGet("quotes/index.json").then(function (fileData) {
      var list = [];
      try { list = JSON.parse(atob(fileData.content)) || []; } catch (_) {}
      if (!Array.isArray(list)) list = [];
      list.unshift({
        id: quote.id, site: quote.site, name: quote.name, phone: quote.phone,
        type: quote.type, createdAt: quote.createdAt, photoCount: quote.photos.length, status: "new"
      });
      return ghPut("quotes/index.json", utf8ToBase64(JSON.stringify(list, null, 2)), "Add quote to index: " + quote.id, fileData.sha);
    });
  }

  /* ---------- Load admin-managed content (showcase + gallery) ---------- */
  function renderGallery(items) {
    var grid = document.getElementById("galleryGrid");
    var title = document.getElementById("galleryTitle");
    if (!grid) return;
    grid.innerHTML = "";
    items.forEach(function (item) {
      if (!item || !item.image) return;
      var fig = document.createElement("figure");
      fig.className = "gallery-card";
      var chipText = item.chip === "Before" ? "Before" : item.chip === "After" ? "After" : "In progress";
      var chipClass = item.chip === "Before" ? "chip-before" : item.chip === "After" ? "chip-after" : "chip-progress";
      var chip = document.createElement("span");
      chip.className = "chip " + chipClass;
      chip.setAttribute("aria-hidden", "true");
      chip.textContent = chipText;
      var img = document.createElement("img");
      img.src = item.image;
      img.alt = item.caption || "Workshop photo";
      img.loading = "lazy";
      var cap = document.createElement("figcaption");
      cap.textContent = item.caption || "";
      fig.appendChild(chip);
      fig.appendChild(img);
      if (item.caption) fig.appendChild(cap);
      grid.appendChild(fig);
    });
    if (title) title.hidden = items.length === 0;
    grid.style.display = items.length ? "" : "none";
  }

  function applyContent(data) {
    if (!data || typeof data !== "object") return;
    var sc = data.showcase;
    if (sc && document.getElementById("baSlider")) {
      var imgs = document.querySelectorAll("#baSlider img");
      // first <img> is the after shot, second (.ba-before) is the before shot
      if (sc.after && imgs[0]) { imgs[0].src = sc.after; }
      if (sc.before && imgs[1]) { imgs[1].src = sc.before; }
    }
    if (Array.isArray(data.gallery)) renderGallery(data.gallery);
  }

  fetch(DATA_BASE + "/" + SITE_KEY + "/content.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(applyContent)
    .catch(function () { /* keep the built-in content if the data site is unreachable */ });

  /* ---------- Sticky header shadow ---------- */
  var header = document.getElementById("siteHeader");
  function onScroll() {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile navigation ---------- */
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("siteNav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    // Close the menu after choosing a link (mobile)
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Highlight active nav link on scroll ---------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll("main section[id]"));
  var navLinks = Array.prototype.slice.call(nav ? nav.querySelectorAll('a[href^="#"]') : []);

  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          navLinks.forEach(function (link) {
            link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id);
          });
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- Reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var ro = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("visible");
          ro.unobserve(entry.target);
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) {
      var delay = el.getAttribute("data-delay");
      if (delay) el.style.transitionDelay = delay + "ms";
      ro.observe(el);
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ---------- Before / after comparison slider ---------- */
  var baSlider = document.getElementById("baSlider");
  if (baSlider) {
    var baHandle = document.getElementById("baHandle");

    function setBaPos(pct) {
      pct = Math.max(0, Math.min(100, pct));
      baSlider.style.setProperty("--pos", pct + "%");
      if (baHandle) baHandle.setAttribute("aria-valuenow", String(Math.round(pct)));
    }

    function baPosFromEvent(e) {
      var r = baSlider.getBoundingClientRect();
      return ((e.clientX - r.left) / r.width) * 100;
    }

    var baDragging = false;
    baSlider.addEventListener("pointerdown", function (e) {
      baDragging = true;
      try { baSlider.setPointerCapture(e.pointerId); } catch (_) {}
      setBaPos(baPosFromEvent(e));
    });
    baSlider.addEventListener("pointermove", function (e) {
      if (baDragging) setBaPos(baPosFromEvent(e));
    });
    ["pointerup", "pointercancel"].forEach(function (ev) {
      baSlider.addEventListener(ev, function () { baDragging = false; });
    });

    if (baHandle) {
      baHandle.addEventListener("keydown", function (e) {
        var cur = parseFloat(baSlider.style.getPropertyValue("--pos")) || 50;
        if (e.key === "ArrowLeft") { setBaPos(cur - 4); e.preventDefault(); }
        else if (e.key === "ArrowRight") { setBaPos(cur + 4); e.preventDefault(); }
      });
    }
  }

  /* ---------- Quote form -> email with photos (FormSubmit), mailto fallback ---------- */
  var form = document.getElementById("quoteForm");
  if (form) {
    var submitBtn = document.getElementById("quoteSubmit");
    var successBox = document.getElementById("formSuccess");
    var successMsg = document.getElementById("formSuccessMsg");
    var formNote = document.getElementById("formNote");

    function buildMailto(name, phone, type, message) {
      var subject = "Quote request — On The Spot Caravan Repairs";
      var body =
        "Name: " + name + "\n" +
        "Phone: " + phone + "\n" +
        "Caravan type: " + type + "\n\n" +
        (message || "(no details provided)") + "\n";
      return (
        "mailto:peter.hark89@gmail.com?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(body)
      );
    }

    function compressImage(file, maxDim, quality) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () {
            var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            var canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(function (blob) {
              blob ? resolve(blob) : reject(new Error("compress failed"));
            }, "image/jpeg", quality);
          };
          img.onerror = function () { reject(new Error("load failed")); };
          img.src = reader.result;
        };
        reader.onerror = function () { reject(new Error("read failed")); };
        reader.readAsDataURL(file);
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = (document.getElementById("name").value || "").trim();
      var phone = (document.getElementById("phone").value || "").trim();
      var type = document.getElementById("type").value;
      var message = (document.getElementById("message").value || "").trim();

      if (!name || !phone) {
        form.reportValidity ? form.reportValidity() : null;
        return;
      }

      var photosInput = document.getElementById("photos");
      var files = Array.prototype.slice.call(photosInput.files || []).slice(0, 4);

      function resetBtn() {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Send request"; }
      }

      function fallbackMailto(noteText) {
        window.location.href = buildMailto(name, phone, type, message);
        if (formNote && noteText) formNote.textContent = noteText;
      }

      var tasks = files.map(function (f, i) {
        return compressImage(f, 1600, 0.82).then(function (blob) {
          var dot = f.name.lastIndexOf(".");
          var base = dot > 0 ? f.name.slice(0, dot) : "photo-" + (i + 1);
          try { return new File([blob], base + ".jpg", { type: "image/jpeg" }); }
          catch (_) { return blob; }
        });
      });

      Promise.all(tasks).then(function (compressed) {
        var fd = new FormData();
        fd.append("name", name);
        fd.append("phone", phone);
        fd.append("type", type);
        fd.append("message", message || "(no details provided)");
        compressed.forEach(function (f, i) { fd.append("photos", f, "photo-" + (i + 1) + ".jpg"); });
        fd.append("_subject", "Quote request — On The Spot Caravan Repairs");
        fd.append("_template", "table");
        fd.append("_captcha", "false");
        fd.append("_honey", "");

        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }

        fetch("https://formsubmit.co/ajax/peter.hark89@gmail.com", {
          method: "POST",
          body: fd,
          headers: { Accept: "application/json" }
        }).then(function (r) { return r.json(); }).then(function (data) {
          if (!data || String(data.success) !== "true") throw new Error("form not accepted");
          if (successBox && successMsg) {
            form.hidden = true;
            successBox.hidden = false;
            successMsg.textContent = files.length
              ? "Thanks " + name + " — your request and " + files.length +
                " photo" + (files.length > 1 ? "s are" : " is") +
                " on their way. We'll get back to you with a quote shortly."
              : "Thanks " + name + " — we've got your details and will get back to you with a quote shortly.";
            successBox.scrollIntoView({ behavior: "smooth", block: "center" });
          }

          // Best-effort copy for the staff panel (the email above is primary).
          saveQuoteToDataRepo(
            { name: name, phone: phone, type: type, message: message },
            compressed
          ).catch(function (err) { console.warn("Quote not saved to data repo:", err && err.message); });
        }).catch(function () {
          resetBtn();
          fallbackMailto("We couldn't reach the online form, so we've opened your email app instead — attach photos there if you like.");
        });
      }).catch(function () {
        resetBtn();
        fallbackMailto();
      });
    });

    var againBtn = document.getElementById("formAgain");
    if (againBtn && successBox) {
      againBtn.addEventListener("click", function () {
        form.reset();
        successBox.hidden = true;
        form.hidden = false;
        resetBtn();
      });
    }
  }

  /* ---------- Instant estimate ---------- */
  var ESTIMATE = {
    vehicleMult: { mobile: 1, static: 1.2 },
    panelMult: { "1": 1, "2": 1.7, "3": 2.4 },
    damage: {
      crack: {
        label: "How big is the crack or chip?",
        sizes: [
          ["Small — under 10 cm", 80, 150],
          ["Medium — 10–30 cm", 150, 400],
          ["Large — over 30 cm", 300, 700],
          ["Whole panel", 450, 900]
        ]
      },
      puncture: {
        label: "How bad is the impact damage?",
        sizes: [
          ["Small puncture or stone chip", 120, 250],
          ["Impact up to 30 cm", 250, 500],
          ["Large impact damage", 400, 800],
          ["Structural / major repair", 600, 1500]
        ]
      },
      respray: {
        label: "How much needs spraying?",
        sizes: [
          ["Localised area", 200, 450],
          ["Single panel or section", 300, 600],
          ["Multiple areas", 500, 1000],
          ["Full respray", 700, 1800]
        ],
        noPanels: true
      }
    }
  };

  var estVehicle = document.getElementById("estVehicle");
  if (estVehicle) {
    var estDamage = document.getElementById("estDamage");
    var estSizeLabel = document.getElementById("estSizeLabel");
    var estSize = document.getElementById("estSize");
    var estPanelsWrap = document.getElementById("estPanelsWrap");
    var estPanels = document.getElementById("estPanels");
    var estPrompt = document.getElementById("estPrompt");
    var estPriceWrap = document.getElementById("estPriceWrap");
    var estPrice = document.getElementById("estPrice");
    var estNote = document.getElementById("estNote");

    function round5(n) { return Math.round(n / 5) * 5; }
    function gbp(n) { return "\u00a3" + n.toLocaleString("en-GB"); }

    function fillSizes() {
      var cfg = ESTIMATE.damage[estDamage.value];
      if (!cfg) return;
      estSizeLabel.textContent = cfg.label;
      estSize.innerHTML = "";
      cfg.sizes.forEach(function (s, i) {
        var opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = s[0];
        estSize.appendChild(opt);
      });
      if (estPanelsWrap) estPanelsWrap.style.display = cfg.noPanels ? "none" : "";
    }

    function updateEstimate() {
      var cfg = ESTIMATE.damage[estDamage.value];
      if (!cfg || !estSize.options.length) return;
      var sizeIdx = parseInt(estSize.value, 10);
      if (isNaN(sizeIdx)) sizeIdx = 0;
      var row = cfg.sizes[sizeIdx] || cfg.sizes[0];
      var lo = row[1], hi = row[2];

      if (!cfg.noPanels && estPanels) {
        var pm = ESTIMATE.panelMult[estPanels.value] || 1;
        lo *= pm; hi *= pm;
      }
      var vm = ESTIMATE.vehicleMult[estVehicle.value] || 1;
      lo = round5(lo * vm);
      hi = round5(hi * vm);

      estPrompt.hidden = true;
      estPriceWrap.hidden = false;
      estPrice.textContent = gbp(lo) + " \u2013 " + gbp(hi);

      var notes = [];
      if (estVehicle.value === "van") notes.push("Vans & 4x4s are priced towards the higher end of each range.");
      if (!cfg.noPanels && estPanels && estPanels.value === "3") notes.push("For three or more panels we'll always confirm by phone — treat this as a ballpark only.");
      notes.push("Includes repair, preparation and colour-matched respray. Most jobs are done on site in half a day to two days (paint needs time to cure).");
      estNote.textContent = notes.join(" ");
    }

    estVehicle.addEventListener("change", updateEstimate);
    estDamage.addEventListener("change", function () { fillSizes(); updateEstimate(); });
    estSize.addEventListener("change", updateEstimate);
    if (estPanels) estPanels.addEventListener("change", updateEstimate);
    fillSizes();
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
