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
     Header navigation — one glass pill springs under the hovered item.
     The leading edge uses a stiff spring and the trailing edge a soft one,
     so the pill stretches like liquid while travelling and settles back.
     ------------------------------------------------------------------------ */
  function initNav() {
    const list = $('[data-nav]');
    const pill = $('[data-nav-pill]');
    if (!list || !pill) return;

    const links = $$('.nav__link', list);
    let active = links.find(l => l.classList.contains('is-active')) || links[0];
    let under = null;
    let left = null;
    let right = null;
    let raf = 0;
    let last = 0;

    const rectOf = link => ({ l: link.offsetLeft, r: link.offsetLeft + link.offsetWidth });

    function render() {
      const width = Math.max(right.x - left.x, 0);
      const speed = Math.max(Math.abs(left.v), Math.abs(right.v));
      const squash = Math.min(speed / 9000, 0.08);
      pill.style.width = `${width}px`;
      pill.style.transform = `translateX(${left.x}px) scaleY(${1 - squash})`;
      pill.style.setProperty('--sheen', Math.min(speed / 1600, 1).toFixed(3));
      pill.style.setProperty('--sheen-x', right.v >= 0 ? '78%' : '22%');
    }

    function tick(now) {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const sub = 4;
      for (let i = 0; i < sub; i++) {
        stepSpring(left, dt / sub);
        stepSpring(right, dt / sub);
      }
      render();
      if (isSettled(left) && isSettled(right)) {
        left.x = left.target; right.x = right.target; left.v = right.v = 0;
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

      const { l, r } = rectOf(link);
      if (!left || instant || reduceMotion) {
        left = createSpring(l);
        right = createSpring(r);
        render();
        return;
      }

      const movingRight = l > left.target;
      Object.assign(movingRight ? right : left, SPRING_FAST);
      Object.assign(movingRight ? left : right, SPRING_SLOW);
      left.target = l;
      right.target = r;

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
        // font-weight changes the width slightly; re-measure next frame
        requestAnimationFrame(() => moveTo(link));
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
  initLanes();
  initFeedback();
  initCounters();
  initToggles();
  initTicker();
  initForms();
  initReveal();
})();
