(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------------
     Scroll reveal — elements fade 0 → 100 and glide up as they enter view.
     Elements entering together are staggered in document order (Apple-style).
     ------------------------------------------------------------------------ */
  function initReveal() {
    const items = $$('[data-reveal]');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(el => el.removeAttribute('data-reveal'));
      return;
    }

    // Once revealed, drop the reveal hooks so the element's own hover transitions apply again.
    const settle = el => {
      el.removeAttribute('data-reveal');
      el.classList.remove('is-in');
      el.style.removeProperty('--d');
    };

    const io = new IntersectionObserver(entries => {
      const entering = entries
        .filter(e => e.isIntersecting)
        .map(e => e.target)
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

      entering.forEach((el, i) => {
        const delay = Math.min(i * 0.09, 0.63);
        el.style.setProperty('--d', `${delay}s`);
        el.classList.add('is-in');
        io.unobserve(el);
        setTimeout(() => settle(el), (delay + 1.25) * 1000);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });

    items.forEach(el => io.observe(el));
  }

  /* ------------------------------------------------------------------------
     Spring physics (Framer-Motion-like) used by the liquid-glass nav pill.
     ------------------------------------------------------------------------ */
  const SPRING_FAST = { stiffness: 560, damping: 34 };
  const SPRING_SLOW = { stiffness: 250, damping: 25 };

  function createSpring(value) {
    return { x: value, v: 0, target: value, ...SPRING_FAST };
  }

  function stepSpring(s, dt) {
    const force = -s.stiffness * (s.x - s.target) - s.damping * s.v;
    s.v += force * dt;
    s.x += s.v * dt;
  }

  const isSettled = s => Math.abs(s.x - s.target) < 0.1 && Math.abs(s.v) < 0.1;

  /* ------------------------------------------------------------------------
     Sidebar navigation — one glass pill springs under the hovered item.
     The leading edge uses a stiff spring and the trailing edge a soft one,
     so the pill stretches like liquid while travelling and settles back.
     ------------------------------------------------------------------------ */
  function initNav() {
    const list = $('[data-nav]');
    const pill = $('[data-nav-pill]');
    if (!list || !pill) return;

    const links = $$('.side-link', list);
    let active = links.find(l => l.classList.contains('is-active')) || links[0];
    let under = null;
    let start = null; // top edge
    let end = null;   // bottom edge
    let raf = 0;
    let last = 0;

    const rectOf = link => ({ a: link.offsetTop, b: link.offsetTop + link.offsetHeight });

    function render() {
      const size = Math.max(end.x - start.x, 0);
      const speed = Math.max(Math.abs(start.v), Math.abs(end.v));
      const squash = Math.min(speed / 9000, 0.06);
      pill.style.height = `${size}px`;
      pill.style.transform = `translateY(${start.x}px) scaleX(${1 - squash})`;
      pill.style.setProperty('--sheen', Math.min(speed / 1600, 1).toFixed(3));
      pill.style.setProperty('--sheen-y', end.v >= 0 ? '85%' : '15%');
    }

    function tick(now) {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const sub = 4;
      for (let i = 0; i < sub; i++) {
        stepSpring(start, dt / sub);
        stepSpring(end, dt / sub);
      }
      render();
      if (isSettled(start) && isSettled(end)) {
        start.x = start.target; end.x = end.target; start.v = end.v = 0;
        render();
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function moveTo(link, instant = false) {
      if (!link) return;
      if (under) under.classList.remove('is-under');
      under = link;
      link.classList.add('is-under');

      const { a, b } = rectOf(link);
      if (!start || instant || reduceMotion) {
        start = createSpring(a);
        end = createSpring(b);
        render();
        return;
      }

      const movingDown = a > start.target;
      Object.assign(movingDown ? end : start, SPRING_FAST);
      Object.assign(movingDown ? start : end, SPRING_SLOW);
      start.target = a;
      end.target = b;

      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    }

    links.forEach(link => {
      link.addEventListener('pointerenter', () => moveTo(link));
      link.addEventListener('focus', () => moveTo(link));
      link.addEventListener('click', () => {
        active.classList.remove('is-active');
        active.removeAttribute('aria-current');
        active = link;
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
        moveTo(link);
      });
    });
    list.addEventListener('pointerleave', () => moveTo(active));
    list.addEventListener('focusout', e => {
      if (!list.contains(e.relatedTarget)) moveTo(active);
    });

    const snap = () => moveTo(under || active, true);
    window.addEventListener('resize', snap);
    document.fonts && document.fonts.ready.then(snap);
    moveTo(active, true);
  }

  /* ------------------------------------------------------------------------
     Sidebar: account card expands inline (member), and below 1024px the whole
     sidebar becomes a drawer opened from the top bar.
     ------------------------------------------------------------------------ */
  function initSidebar() {
    const sidebar = $('[data-sidebar]');
    if (!sidebar) return;

    const accountBtn = $('[data-account-toggle]', sidebar);
    const accountMenu = $('[data-account-menu]', sidebar);
    const setAccount = open => {
      if (!accountBtn) return;
      accountBtn.setAttribute('aria-expanded', String(open));
      accountMenu.classList.toggle('is-open', open);
      accountMenu.inert = !open;
    };
    if (accountBtn) {
      setAccount(false);
      accountBtn.addEventListener('click', () => setAccount(accountBtn.getAttribute('aria-expanded') !== 'true'));
    }

    const toggle = $('[data-drawer-toggle]');
    const scrim = $('[data-scrim]');
    const drawerMode = window.matchMedia('(max-width: 1023px)');
    const setDrawer = open => {
      sidebar.classList.toggle('is-open', open);
      scrim && scrim.classList.toggle('is-open', open);
      if (toggle) {
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
      }
      sidebar.inert = drawerMode.matches && !open;
    };
    setDrawer(false);
    toggle && toggle.addEventListener('click', () => setDrawer(!sidebar.classList.contains('is-open')));
    scrim && scrim.addEventListener('click', () => setDrawer(false));
    $$('a', sidebar).forEach(a => a.addEventListener('click', () => { if (drawerMode.matches) setDrawer(false); }));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && sidebar.classList.contains('is-open')) { setDrawer(false); toggle && toggle.focus(); }
    });
    drawerMode.addEventListener('change', () => setDrawer(false));
    document.addEventListener('authchange', () => setAccount(false));
  }

  /* ------------------------------------------------------------------------
     Promo carousel — slide 1 is the intro video. Autoplays every 5s when there
     is more than one slide, and pauses while the video is playing.
     The slide artwork is drawn on the 736×368 Figma stage and scaled to fit.
     ------------------------------------------------------------------------ */
  function initPromo() {
    const promo = $('[data-promo]');
    if (!promo) return;
    const viewport = $('.promo__viewport', promo);
    const track = $('[data-promo-track]', promo);
    const slides = $$('[data-slide]', promo);
    const dotsBox = $('[data-promo-dots]', promo);
    const stages = $$('[data-stage]', promo);
    let index = 0;
    let playing = false;

    const fit = () => stages.forEach(s => s.style.setProperty('--stage-scale', (viewport.clientWidth / 736).toFixed(4)));
    fit();
    new ResizeObserver(fit).observe(viewport);

    const dots = slides.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `Slide ${i + 1}`);
      b.addEventListener('click', () => go(i));
      return dotsBox.appendChild(b);
    });

    function go(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = `translateX(${-index * 100}%)`;
      dots.forEach((d, k) => d.classList.toggle('is-active', k === index));
      slides.forEach((s, k) => s.inert = k !== index);
    }
    $('[data-promo-prev]', promo).addEventListener('click', () => go(index - 1));
    $('[data-promo-next]', promo).addEventListener('click', () => go(index + 1));
    go(0);
    if (slides.length > 1) autoplay(promo, 5000, () => { if (!playing) go(index + 1); });

    // Swipe / drag between slides; a swipe never triggers the slide's link
    let x0 = null;
    let swiped = false;
    viewport.addEventListener('pointerdown', e => {
      if (e.target.closest('[data-player]')) return;
      x0 = e.clientX; swiped = false;
    });
    viewport.addEventListener('pointerup', e => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) { swiped = true; go(index + (dx < 0 ? 1 : -1)); }
    });
    viewport.addEventListener('pointercancel', () => { x0 = null; });
    viewport.addEventListener('click', e => { if (swiped) { e.preventDefault(); swiped = false; } }, true);
    viewport.addEventListener('dragstart', e => e.preventDefault());

    // Video player UI
    const video = $('[data-video]', promo);
    const playBtn = $('[data-play]', promo);
    const time = $('[data-time]', promo);
    const duration = $('[data-duration]', promo);
    const progress = $('[data-progress]', promo);
    const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    if (!video || !playBtn) return;

    playBtn.addEventListener('click', () => {
      const src = video.dataset.src;
      if (!src) { console.info('[Empire] Set data-src on the intro <video> to enable playback.'); return; }
      if (!video.src) video.src = src;
      video.hidden = false;
      video.paused ? video.play() : video.pause();
    });
    video.addEventListener('play', () => { playing = true; playBtn.textContent = '❚❚'; playBtn.setAttribute('aria-label', 'Tạm dừng'); });
    video.addEventListener('pause', () => { playing = false; playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Phát video'); });
    video.addEventListener('loadedmetadata', () => { duration.textContent = fmt(video.duration); });
    video.addEventListener('timeupdate', () => {
      time.textContent = fmt(video.currentTime);
      if (video.duration) progress.style.width = `${(video.currentTime / video.duration) * 100}%`;
    });
    $('[data-fullscreen]', promo).addEventListener('click', () => {
      if (!video.hidden && video.requestFullscreen) video.requestFullscreen();
    });
  }

  /* Horizontal card rows (teachers, news): drag with the mouse, swipe on touch */
  function initHScroll() {
    $$('[data-hscroll]').forEach(row => {
      let x0 = 0;
      let left0 = 0;
      let moved = false;
      row.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        x0 = e.clientX; left0 = row.scrollLeft; moved = false;
        const move = ev => {
          const dx = ev.clientX - x0;
          if (Math.abs(dx) > 4) { moved = true; row.classList.add('is-dragging'); }
          row.scrollLeft = left0 - dx;
        };
        const up = () => {
          row.classList.remove('is-dragging');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
      // A drag shouldn't count as a click on the card underneath
      row.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
      row.addEventListener('dragstart', e => e.preventDefault());
    });
  }

  /* ------------------------------------------------------------------------
     Auth state (demo). Your backend should render <html data-auth="member">
     for signed-in users; until then "Đăng nhập" / "Đăng xuất" switch the
     header so every state can be reviewed. Also supports ?auth=member|guest.
     ------------------------------------------------------------------------ */
  function initAuth() {
    const setAuth = state => {
      document.documentElement.dataset.auth = state;
      try { localStorage.setItem('empire-auth', state); } catch (e) { /* storage unavailable */ }
      document.dispatchEvent(new CustomEvent('authchange', { detail: state }));
    };
    $$('[data-login]').forEach(btn => btn.addEventListener('click', e => {
      e.preventDefault();
      setAuth('member');
    }));
    $$('[data-logout]').forEach(btn => btn.addEventListener('click', () => setAuth('guest')));
    window.EmpireAuth = { setAuth };
  }

  /* Header gets a stronger glass treatment once the page scrolls */
  function initHeader() {
    const header = $('[data-header]');
    if (!header) return;
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  /* Run `fn` on an interval only while `el` is on screen, the tab is visible and the user isn't hovering */
  function autoplay(el, ms, fn) {
    let visible = false;
    let hovered = false;
    let timer = 0;
    const sync = () => {
      const run = visible && !hovered && !document.hidden && !reduceMotion;
      if (run && !timer) timer = setInterval(fn, ms);
      if (!run && timer) { clearInterval(timer); timer = 0; }
    };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { threshold: 0.25 }).observe(el);
    el.addEventListener('pointerenter', () => { hovered = true; sync(); });
    el.addEventListener('pointerleave', () => { hovered = false; sync(); });
    document.addEventListener('visibilitychange', sync);
    return { restart() { if (timer) { clearInterval(timer); timer = 0; } sync(); } };
  }

  /* ------------------------------------------------------------------------
     Thủ khoa lanes — auto-scroll every 3s, infinite loop, dots follow.
     ------------------------------------------------------------------------ */
  function initLanes() {
    $$('[data-lane]').forEach(lane => {
      const track = $('[data-lane-track]', lane);
      const dotsBox = $('[data-lane-dots]', lane);
      const originals = [...track.children];
      const n = originals.length;
      if (n < 2) return;

      originals.forEach(card => {
        const clone = card.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      });

      const dots = originals.map(() => dotsBox.appendChild(document.createElement('span')));
      let index = 0;
      const step = () => originals[1].offsetLeft - originals[0].offsetLeft;

      function go(next, animate = true) {
        index = next;
        track.classList.toggle('is-animating', animate);
        track.style.transform = `translateX(${-index * step()}px)`;
        dots.forEach((d, i) => d.classList.toggle('is-active', i === index % n));
      }

      track.addEventListener('transitionend', e => {
        if (e.target !== track || index < n) return;
        go(index - n, false);
        void track.offsetWidth;
      });

      dots.forEach((d, i) => d.addEventListener('click', () => go(i)));
      window.addEventListener('resize', () => go(index % n, false));
      go(0, false);
      autoplay(lane, 3000, () => go(index + 1));
    });
  }

  /* ------------------------------------------------------------------------
     Feedback slider — autoplay 4s, loop, pause on hover, HSA / V-ACT filter.
     ------------------------------------------------------------------------ */
  function initFeedback() {
    const slider = $('[data-fb-slider]');
    const track = $('[data-fb-track]');
    const filter = $('[data-fb-filter]');
    if (!slider || !track) return;

    const source = [...track.children];
    const STEP = 300; // 280px slide + 20px gap
    let slides = [];
    let n = 0;
    let start = 0;
    let index = 0;

    const offset = () => Math.min(300, Math.max(0, (slider.clientWidth - 340) / 2));

    function layout(animate) {
      track.classList.toggle('is-animating', animate);
      track.style.transform = `translateX(${offset() - index * STEP}px)`;
      slides.forEach((s, k) => {
        const d = k - index;
        s.classList.toggle('is-active', d === 0);
        s.classList.toggle('is-near', d >= 0 && d <= 2);
      });
    }

    function build(exam) {
      const items = source.filter(s => s.dataset.exam === exam);
      n = items.length;
      const copies = Math.max(3, Math.ceil(14 / n));
      const middle = Math.floor(copies / 2);
      track.replaceChildren();
      for (let c = 0; c < copies; c++) {
        items.forEach(s => {
          const clone = s.cloneNode(true);
          if (c !== middle) clone.setAttribute('aria-hidden', 'true');
          track.appendChild(clone);
        });
      }
      slides = [...track.children];
      start = n * middle;
      index = start;
      track.classList.add('no-anim');
      layout(false);
      void track.offsetWidth;
      track.classList.remove('no-anim');
    }

    track.addEventListener('transitionend', e => {
      if (e.target !== track || e.propertyName !== 'transform' || index < start + n) return;
      index -= n;
      track.classList.add('no-anim');
      layout(false);
      void track.offsetWidth;
      track.classList.remove('no-anim');
    });

    const player = autoplay(slider, 4000, () => { index += 1; layout(true); });

    if (filter) {
      const buttons = $$('[data-filter]', filter);
      buttons.forEach(btn => btn.addEventListener('click', () => {
        buttons.forEach(b => {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', String(on));
        });
        build(btn.dataset.filter);
        player.restart();
      }));
    }

    window.addEventListener('resize', () => layout(false));
    build((filter && $('.is-active[data-filter]', filter)?.dataset.filter) || 'hsa');
  }

  /* ------------------------------------------------------------------------
     Stats count-up when the numbers enter view
     ------------------------------------------------------------------------ */
  function initCounters() {
    const nums = $$('[data-count]');
    if (reduceMotion || !nums.length) return;
    const fmt = new Intl.NumberFormat('vi-VN');
    const easeOutExpo = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const io = new IntersectionObserver(entries => {
      entries.forEach(({ isIntersecting, target }) => {
        if (!isIntersecting) return;
        io.unobserve(target);
        const end = Number(target.dataset.count);
        const suffix = target.dataset.suffix || '';
        const t0 = performance.now();
        const dur = 1600;
        const frame = now => {
          const p = Math.min((now - t0) / dur, 1);
          target.textContent = fmt.format(Math.round(end * easeOutExpo(p))) + suffix;
          if (p < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    }, { threshold: 0.6 });
    nums.forEach(el => io.observe(el));
  }

  /* ------------------------------------------------------------------------
     Small controls: exam toggles, leaderboard tabs, news ticker
     ------------------------------------------------------------------------ */
  function initToggles() {
    $$('[data-exam-toggle]').forEach(group => {
      const buttons = $$('button', group);
      buttons.forEach(btn => btn.addEventListener('click', () => {
        buttons.forEach(b => {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-checked', String(on));
        });
      }));
    });

    $$('[data-tabs]').forEach(tabs => {
      const ind = $('[data-tabs-ind]', tabs);
      const buttons = $$('[role="tab"]', tabs);
      const place = (btn, animate) => {
        ind.style.transition = animate && !reduceMotion
          ? 'transform .55s cubic-bezier(.34,1.56,.64,1), width .55s cubic-bezier(.34,1.56,.64,1)'
          : 'none';
        ind.style.width = `${btn.offsetWidth}px`;
        ind.style.transform = `translateX(${btn.offsetLeft - 4}px)`;
      };
      buttons.forEach(btn => btn.addEventListener('click', () => {
        buttons.forEach(b => {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', String(on));
        });
        place(btn, true);
      }));
      const current = () => buttons.find(b => b.classList.contains('is-active')) || buttons[0];
      window.addEventListener('resize', () => place(current(), false));
      place(current(), false);
    });
  }

  function initTicker() {
    const track = $('[data-ticker]');
    if (!track) return;
    [...track.children].forEach(item => {
      const clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.tabIndex = -1;
      track.appendChild(clone);
    });
    const pxPerSecond = 60;
    track.style.setProperty('--ticker-dur', `${Math.round(track.scrollWidth / 2 / pxPerSecond)}s`);
  }

  /* ------------------------------------------------------------------------
     Lead forms — client-side validation + confirmation (no backend wired yet)
     ------------------------------------------------------------------------ */
  function initForms() {
    $$('[data-lead-form]').forEach(form => {
      const note = $('[data-form-note]', form);
      const original = note ? note.textContent : '';

      form.addEventListener('submit', e => {
        e.preventDefault();
        const name = form.elements.name;
        const phone = form.elements.phone;
        const nameOk = name.value.trim().length > 1;
        const phoneOk = /^[0-9+ ]{9,13}$/.test(phone.value.trim());
        name.classList.toggle('is-invalid', !nameOk);
        phone.classList.toggle('is-invalid', !phoneOk);

        if (!nameOk || !phoneOk) {
          note.textContent = !nameOk ? 'Vui lòng nhập họ và tên.' : 'Số điện thoại chưa hợp lệ.';
          note.className = 'cap lead__note is-error';
          (!nameOk ? name : phone).focus();
          return;
        }

        note.textContent = '✓ Cảm ơn bạn! Empire sẽ liên hệ trong thời gian sớm nhất.';
        note.className = 'cap lead__note is-success';
        form.reset();
        setTimeout(() => {
          note.textContent = original;
          note.className = 'cap lead__note';
        }, 6000);
      });

      $$('input', form).forEach(input => input.addEventListener('input', () => input.classList.remove('is-invalid')));
    });
  }

  initHeader();
  initNav();
  initSidebar();
  initPromo();
  initHScroll();
  initAuth();
  initLanes();
  initFeedback();
  initCounters();
  initToggles();
  initTicker();
  initForms();
  initReveal();
})();
