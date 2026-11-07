(function () {
  "use strict";

  /* ============================================================
     Helpers
     ============================================================ */
  const data = window.__BRAND__ || {};
  const $  = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fineHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const escHTML = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function safe(fn, name) { try { fn(); } catch (e) { console.warn("[" + name + "]", e); } }

  const SPLASH_OUT = "saryian:splash-out";
  let splashOut = false;

  /* ============================================================
     Enlaces a redes (una sola fuente: lib/manifest.js)
     ============================================================ */
  function initSocialLinks() {
    const links = { "[data-ig]": data.instagram, "[data-tt]": data.tiktok };
    Object.keys(links).forEach(sel => {
      const url = links[sel] && links[sel].url;
      if (!url) return;
      $$(sel).forEach(a => {
        if (a.getAttribute("href") !== url) a.setAttribute("href", url);
      });
    });
  }

  function initYear() {
    $$("[data-year]").forEach(el => { el.textContent = String(new Date().getFullYear()); });
  }

  /* ============================================================
     Splash (el CSS lo oculta a los 4.5 s si esto falla)
     ============================================================ */
  function initSplash() {
    const splash = $("[data-splash]");
    let done = false;
    const hide = () => {
      if (done) return;
      done = true;
      splashOut = true;
      if (splash) splash.classList.add("is-out");
      document.dispatchEvent(new Event(SPLASH_OUT));
    };
    if (!splash) { hide(); return; }
    const MIN_VISIBLE = 1300; // ms desde que empezó a cargar la página
    const hideAfterMin = () => setTimeout(hide, Math.max(0, MIN_VISIBLE - performance.now()));
    if (document.readyState === "complete") hideAfterMin();
    else window.addEventListener("load", hideAfterMin, { once: true });
    setTimeout(hide, 4000);
  }

  /* ============================================================
     Navegación + menú móvil
     ============================================================ */
  function initNav() {
    const nav = $("[data-nav]");
    if (!nav) return;
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const toggle = $("[data-menu-toggle]");
    const menu = $("[data-menu]");
    if (!toggle || !menu) return;
    const label = $(".nav-toggle-label", toggle);

    const setOpen = (open) => {
      menu.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      if (label) label.textContent = open ? "Cerrar" : "Menú";
      document.documentElement.style.overflow = open ? "hidden" : "";
      if (open) {
        const first = $("a", menu);
        if (first) setTimeout(() => first.focus({ preventScroll: true }), 350);
      }
    };
    toggle.addEventListener("click", () => setOpen(!menu.classList.contains("is-open")));
    menu.addEventListener("click", e => { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && menu.classList.contains("is-open")) { setOpen(false); toggle.focus(); }
    });
    const desktop = matchMedia("(min-width: 960px)");
    const onChange = e => { if (e.matches) setOpen(false); };
    if (desktop.addEventListener) desktop.addEventListener("change", onChange);
  }

  function initSmoothAnchors() {
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || a.classList.contains("skip-link")) return;
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      const nav = $("[data-nav]");
      const offset = nav ? nav.offsetHeight : 72;
      const top = id === "#inicio" ? 0 : el.getBoundingClientRect().top + window.scrollY - offset + 1;
      window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    });
  }

  /* ============================================================
     FIRMA — La luz del hero
     Todo está oscuro menos un círculo de luz cálida que sigue
     al cursor (o al dedo). Al cargar, el foco "parpadea" y se
     enciende sobre la playera; si nadie lo mueve, deriva solo.
     ============================================================ */
  function initSpotlight() {
    const hero = $("[data-spotlight]");
    if (!hero) return;
    const img = $(".hero-photo img", hero);
    if (!img) return;

    // Dónde está la frase de la playera dentro de cada foto (0–1)
    const FOCUS_LANDSCAPE = [0.5, 0.77];
    const FOCUS_PORTRAIT  = [0.5, 0.54];
    const portraitMQ = matchMedia("(max-width: 959px), (orientation: portrait)");

    const home = { x: 0, y: 0 };
    const tgt  = { x: 0, y: 0 };
    const cur  = { x: 0, y: 0, r: 0 };
    let W = 0, H = 0, baseR = 300;
    let pointerInside = false;
    let lastInput = -Infinity;
    let power = 0;            // 0 apagado → 1 encendido
    let introStart = null;
    let visible = true;
    let raf = 0;

    // Parpadeo de foco al encenderse: [ms, potencia]
    const FLICKER = [[0, 0], [90, .55], [170, .08], [310, .8], [390, .3], [540, 1]];

    function measure() {
      W = hero.clientWidth;
      H = hero.clientHeight;
      const fallback = portraitMQ.matches ? [1080, 1440] : [1920, 1331];
      const iw = img.naturalWidth || fallback[0];
      const ih = img.naturalHeight || fallback[1];
      const focus = iw < ih ? FOCUS_PORTRAIT : FOCUS_LANDSCAPE;
      const scale = Math.max(W / iw, H / ih);
      const dw = iw * scale, dh = ih * scale;
      const pos = getComputedStyle(img).objectPosition.split(" ").map(v => parseFloat(v) / 100);
      const px = isNaN(pos[0]) ? 0.5 : pos[0];
      const py = isNaN(pos[1]) ? 0.5 : pos[1];
      home.x = (W - dw) * px + focus[0] * dw;
      home.y = (H - dh) * py + focus[1] * dh;
      baseR = W < 720 ? clamp(W * 0.55, 180, 380) : clamp(W * 0.24, 260, 440);
      if (!pointerInside) { tgt.x = home.x; tgt.y = home.y; }
    }

    function powerAt(t) {
      if (reduced) return clamp(t / 600, 0, 1);
      let p = 0;
      for (let i = 0; i < FLICKER.length; i++) if (t >= FLICKER[i][0]) p = FLICKER[i][1];
      return p;
    }

    function frame(now) {
      raf = 0;
      if (introStart !== null) {
        const t = now - introStart;
        power = powerAt(t);
        if (t > 640) { power = 1; introStart = null; }
      }

      // Sin interacción: el foco deriva despacio alrededor de la playera
      if (!pointerInside && now - lastInput > 2600) {
        tgt.x = home.x + (reduced ? 0 : Math.sin(now * 0.00055) * W * 0.05);
        tgt.y = home.y + (reduced ? 0 : Math.cos(now * 0.0007) * H * 0.03);
      }

      cur.x += (tgt.x - cur.x) * 0.1;
      cur.y += (tgt.y - cur.y) * 0.1;
      const breathe = reduced ? 1 : 1 + Math.sin(now * 0.0012) * 0.035;
      cur.r = Math.max(1, baseR * power * breathe);

      hero.style.setProperty("--spot-x", cur.x.toFixed(1) + "px");
      hero.style.setProperty("--spot-y", cur.y.toFixed(1) + "px");
      hero.style.setProperty("--spot-r", cur.r.toFixed(1) + "px");

      if (visible) raf = requestAnimationFrame(frame);
    }

    const start = () => { if (!raf && visible) raf = requestAnimationFrame(frame); };

    // Ratón
    if (fineHover) {
      hero.addEventListener("mousemove", e => {
        const r = hero.getBoundingClientRect();
        tgt.x = e.clientX - r.left;
        tgt.y = e.clientY - r.top;
        pointerInside = true;
        lastInput = performance.now();
      });
      hero.addEventListener("mouseout", e => {
        if (hero.contains(e.relatedTarget)) return;
        pointerInside = false;
        lastInput = performance.now();
        tgt.x = home.x; tgt.y = home.y;
      });
    }

    // Táctil: el dedo mueve la luz sin bloquear el scroll
    const onTouch = e => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      const r = hero.getBoundingClientRect();
      tgt.x = t.clientX - r.left;
      tgt.y = t.clientY - r.top;
      lastInput = performance.now();
    };
    hero.addEventListener("touchstart", onTouch, { passive: true });
    hero.addEventListener("touchmove", onTouch, { passive: true });

    // Medidas
    measure();
    cur.x = tgt.x = home.x;
    cur.y = tgt.y = home.y;
    hero.style.setProperty("--spot-r", "1px"); // apagado mientras está el splash
    hero.style.setProperty("--spot-x", cur.x.toFixed(1) + "px");
    hero.style.setProperty("--spot-y", cur.y.toFixed(1) + "px");
    if (!img.complete) img.addEventListener("load", measure, { once: true });
    let resizeRaf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(measure);
    });

    // Solo animar mientras el hero está en pantalla
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }, { threshold: 0 }).observe(hero);
    }

    // Encender cuando se va el splash
    const turnOn = () => { if (power === 0 && introStart === null) introStart = performance.now(); start(); };
    if (splashOut) turnOn();
    else document.addEventListener(SPLASH_OUT, turnOn, { once: true });
    setTimeout(turnOn, 4600);
    start();
  }

  /* ============================================================
     Texto palabra por palabra (conserva <em> y <br>)
     ============================================================ */
  function splitWords(el) {
    const original = el.textContent.trim().replace(/\s+/g, " ");
    let i = 0;
    const wrap = text => text.split(/(\s+)/).map(w =>
      /^\s*$/.test(w) ? w : `<span class="split-word" style="--i:${i++}">${escHTML(w)}</span>`
    ).join("");
    const html = Array.from(el.childNodes).map(node => {
      if (node.nodeType === 3) return wrap(node.textContent);
      if (node.nodeName === "BR") return "<br>";
      if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        return `<${tag}>${wrap(node.textContent)}</${tag}>`;
      }
      return "";
    }).join("");
    el.innerHTML = `<span class="sr-only">${escHTML(original)}</span><span aria-hidden="true">${html}</span>`;
  }

  function initSplitText() {
    if (!("IntersectionObserver" in window)) return;
    const els = $$("[data-split]");
    els.forEach(el => {
      if (el.dataset.splitDone) return;   // idempotente
      el.dataset.splitDone = "1";
      el.classList.remove("reveal");
      splitWords(el);
      el.classList.add("is-split");
    });
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("is-split-in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -4% 0px" });
    els.forEach(el => io.observe(el));
    setTimeout(() => {
      els.forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-split-in");
      });
    }, 6000);
  }

  /* ============================================================
     Revelado al hacer scroll
     ============================================================ */
  function initReveals() {
    const els = $$("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      els.forEach(el => el.classList.add("is-revealed"));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("is-revealed"); io.unobserve(e.target); }
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -4% 0px" });
    els.forEach(el => io.observe(el));
    // Red de seguridad: a los 6 s, mostrar todo lo que ya debería verse
    setTimeout(() => {
      els.forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-revealed");
      });
    }, 6000);
  }

  /* ============================================================
     Tilt 3D sutil + halo en las fotos de la pieza
     ============================================================ */
  function initTilt() {
    if (!fineHover) return;
    $$("[data-tilt]").forEach(card => {
      if (card.dataset.tiltBound) return;
      card.dataset.tiltBound = "1";
      card.classList.add("has-tilt");
      const MAX = 6;
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
      const loop = () => {
        cx += (tx - cx) * 0.15;
        cy += (ty - cy) * 0.15;
        card.style.setProperty("--rx", cx.toFixed(2) + "deg");
        card.style.setProperty("--ry", cy.toFixed(2) + "deg");
        if (Math.abs(tx - cx) > 0.02 || Math.abs(ty - cy) > 0.02) {
          raf = requestAnimationFrame(loop);
        } else {
          raf = 0;
          if (tx === 0 && ty === 0) card.classList.remove("is-tilting");
        }
      };
      card.addEventListener("mousemove", e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        tx = -(py - 0.5) * MAX;
        ty = (px - 0.5) * MAX;
        card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
        card.classList.add("is-tilting");
        if (!raf) raf = requestAnimationFrame(loop);
      });
      card.addEventListener("mouseout", e => {
        if (card.contains(e.relatedTarget)) return;
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(loop);
      });
    });
  }

  /* ============================================================
     Botón flotante "Pedir por DM"
     ============================================================ */
  function initFloatingCta() {
    const btn = $("[data-float-cta]");
    if (!btn) return;
    const hero = $("[data-spotlight]");
    const contact = $("#contacto");
    let contactInView = false;
    const update = () => {
      const past = window.scrollY > (hero ? hero.offsetHeight * 0.75 : 400);
      btn.classList.toggle("is-visible", past && !contactInView);
    };
    if (contact && "IntersectionObserver" in window) {
      new IntersectionObserver(entries => {
        contactInView = entries[0].isIntersecting;
        update();
      }, { threshold: 0 }).observe(contact);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  /* ============================================================
     Contacto: la luz se queda encendida
     ============================================================ */
  function initContactLight() {
    const sec = $("[data-light]");
    if (!sec) return;
    if (!("IntersectionObserver" in window)) { sec.classList.add("is-lit"); return; }
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { sec.classList.add("is-lit"); io.disconnect(); }
    }, { threshold: 0.01, rootMargin: "0px 0px -25% 0px" });
    io.observe(sec);
    setTimeout(() => {
      if (sec.getBoundingClientRect().top < window.innerHeight) sec.classList.add("is-lit");
    }, 6000);
  }

  /* ============================================================
     Parallax con GSAP + ScrollTrigger
     ============================================================ */
  function initParallax() {
    gsap.registerPlugin(ScrollTrigger);

    gsap.to(".hero-inner", {
      y: -60, opacity: 0.15, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
    });

    // Desplazamientos grandes: solo sin "movimiento reducido"
    if (!reduced) {
      gsap.to(".hero-photo", {
        yPercent: 12, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
      });
      gsap.fromTo(".detalle-figure img", { yPercent: -6 }, {
        yPercent: 6, ease: "none",
        scrollTrigger: { trigger: ".detalle-figure", start: "top bottom", end: "bottom top", scrub: true }
      });
    }

    // Columnas del lookbook a distinta velocidad (≤ 30 px)
    gsap.matchMedia().add("(min-width: 720px)", () => {
      const shifts = [26, -26, 14];
      $$(".look .look-frame").forEach((frame, i) => {
        const d = shifts[i] || 0;
        gsap.fromTo(frame, { y: d }, {
          y: -d, ease: "none",
          scrollTrigger: { trigger: ".look-grid", start: "top bottom", end: "bottom top", scrub: true }
        });
      });
    });
  }

  /* ============================================================
     Arranque
     ============================================================ */
  function boot() {
    safe(initSocialLinks, "initSocialLinks");
    safe(initYear, "initYear");
    safe(initSplash, "initSplash");
    safe(initNav, "initNav");
    safe(initSmoothAnchors, "initSmoothAnchors");
    safe(initSpotlight, "initSpotlight");
    safe(initSplitText, "initSplitText");
    safe(initReveals, "initReveals");
    safe(initTilt, "initTilt");
    safe(initFloatingCta, "initFloatingCta");
    safe(initContactLight, "initContactLight");
    if (window.gsap && window.ScrollTrigger) safe(initParallax, "initParallax");
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
