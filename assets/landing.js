/* ============================================
   Hyper Poker — landing page interactions
   ============================================ */

(() => {
  // --- Treasury live ticker ---------------------------------------------
  const vaultEl = document.getElementById('vault-amount');
  const deltaEl = document.getElementById('vault-delta');

  if (vaultEl) {
    let balance = 418294.31;
    let deltaSinceMidnight = 184.20;

    const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // gentle live drift + occasional fee-inflow burst
    setInterval(() => {
      // small noise
      const drift = (Math.random() - 0.3) * 0.4;
      balance += drift;
      deltaSinceMidnight += Math.max(0, drift);

      // occasional creator-fee inflow
      if (Math.random() < 0.08) {
        const fee = 0.5 + Math.random() * 4.2;
        balance += fee;
        deltaSinceMidnight += fee;
        flashVault();
      }
      vaultEl.textContent = fmt(balance);
      deltaEl.innerHTML = `<span style="color:var(--neon)">+${fmt(deltaSinceMidnight)} SOL</span> · last 24h`;
    }, 1400);
  }

  function flashVault() {
    const v = document.querySelector('.vault');
    if (!v) return;
    v.animate(
      [
        { boxShadow: '0 0 0 0 rgba(0,229,199,0.0), 0 0 0 1px rgba(244,236,223,0.08) inset' },
        { boxShadow: '0 0 60px -10px rgba(0,229,199,0.6), 0 0 0 1px rgba(0,229,199,0.4) inset' },
        { boxShadow: '0 0 0 0 rgba(0,229,199,0.0), 0 0 0 1px rgba(244,236,223,0.08) inset' },
      ],
      { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
  }

  // --- Hero stats slow tick ---------------------------------------------
  const tickInt = (el, from, to, step = 1) => {
    let v = from;
    el.textContent = v.toLocaleString();
    setInterval(() => {
      v += Math.floor(Math.random() * step) + 1;
      if (v > to) v = from;
      el.textContent = v.toLocaleString();
    }, 2200 + Math.random() * 1500);
  };

  const t = document.getElementById('stat-tables');
  const h = document.getElementById('stat-hands');
  const r = document.getElementById('stat-holders');
  if (t) tickInt(t, 138, 160, 2);
  if (h) tickInt(h, 38000, 41000, 12);
  if (r) tickInt(r, 1390, 1430, 1);

  // signal under the cash-tables mode card
  const sig = document.getElementById('signal-tables');
  if (sig) {
    setInterval(() => {
      const n = 138 + Math.floor(Math.random() * 22);
      sig.textContent = `${n} tables`;
    }, 2400);
  }

  // --- Next drain countdown ---------------------------------------------
  const nextDrain = document.getElementById('next-drain');
  if (nextDrain) {
    // Set to next Friday 22:00 UTC
    const target = new Date();
    const day = target.getUTCDay();
    const daysAhead = (5 - day + 7) % 7 || 7;
    target.setUTCDate(target.getUTCDate() + daysAhead);
    target.setUTCHours(22, 0, 0, 0);

    const update = () => {
      const diff = target - new Date();
      if (diff <= 0) { nextDrain.textContent = 'LIVE NOW'; nextDrain.style.color = 'var(--ember)'; return; }
      const d = Math.floor(diff / (1000*60*60*24));
      const hh = Math.floor((diff / (1000*60*60)) % 24);
      const mm = Math.floor((diff / (1000*60)) % 60);
      const ss = Math.floor((diff / 1000) % 60);
      nextDrain.textContent = `${d}d ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    };
    update();
    setInterval(update, 1000);
  }

  // --- Reveal-on-scroll for sections beyond the fold --------------------
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('reveal');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.modes .mode-card, .holders__col, .proof__terminal, .proof__grid > div')
    .forEach((el, i) => {
      el.style.animationDelay = `${i * 0.08}s`;
      obs.observe(el);
    });

  // --- Subtle parallax on hero title ------------------------------------
  const title = document.querySelector('.hero__title');
  if (title && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      title.style.transform = `translate3d(${x * -8}px, ${y * -4}px, 0)`;
    });
  }

  // --- Tournament countdowns --------------------------------------------
  function fmtCountdown(diff, withDays = false) {
    if (diff <= 0) return 'STARTING';
    const d  = Math.floor(diff / 86400000);
    const hh = Math.floor((diff / 3600000) % 24);
    const mm = Math.floor((diff / 60000) % 60);
    const ss = Math.floor((diff / 1000) % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return withDays && d > 0
      ? `${pad(d)}d ${pad(hh)}:${pad(mm)}:${pad(ss)}`
      : `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  }

  // Live tournament — late-reg ends in 14 minutes from page load
  const ltCountdown = document.getElementById('lt-countdown');
  if (ltCountdown) {
    const ends = Date.now() + 14 * 60 * 1000 + 32 * 1000;
    setInterval(() => {
      const diff = ends - Date.now();
      ltCountdown.textContent = diff > 0 ? fmtCountdown(diff) : 'CLOSED';
    }, 1000);
  }

  // Live pool ticker
  const ltPool = document.getElementById('lt-pool');
  if (ltPool) {
    let pool = 2400;
    setInterval(() => {
      pool += Math.random() * 0.4;
      ltPool.textContent = pool.toLocaleString('en-US', { maximumFractionDigits: 1 });
    }, 1800);
  }

  // Daily Degen — next 21:00 UTC
  const cardDaily = document.getElementById('card-daily');
  if (cardDaily) {
    const t = new Date();
    t.setUTCHours(21, 0, 0, 0);
    if (t.getTime() < Date.now()) t.setUTCDate(t.getUTCDate() + 1);
    setInterval(() => {
      cardDaily.textContent = fmtCountdown(t.getTime() - Date.now());
    }, 1000);
  }

  // Friday Main — next Friday 22:00 UTC
  const cardFriday = document.getElementById('card-friday');
  if (cardFriday) {
    const t = new Date();
    const daysAhead = (5 - t.getUTCDay() + 7) % 7 || 7;
    t.setUTCDate(t.getUTCDate() + daysAhead);
    t.setUTCHours(22, 0, 0, 0);
    setInterval(() => {
      cardFriday.textContent = fmtCountdown(t.getTime() - Date.now(), true);
    }, 1000);
  }

  // --- Recent wins ticker -----------------------------------------------
  const winsList = document.getElementById('wins-list');
  if (winsList) {
    const SAMPLE_WINS = [
      { name: 'Roxy',       initials: 'RX', amount: 12400,  pot: 'King-high straight on river', mode: 'Cash · 50/100',     ago: 0,  holder: false },
      { name: 'Saint',      initials: 'SN', amount: 38200,  pot: 'Set over set, all-in turn',   mode: 'Daily Degen',       ago: 2,  holder: true  },
      { name: 'CryptoKid',  initials: 'CK', amount: 7150,   pot: 'Bluff caught, river check',   mode: 'Cash · 25/50',      ago: 5,  holder: false },
      { name: 'Vela',       initials: 'VL', amount: 24800,  pot: 'Wheel straight, slow-played', mode: 'Whale Room',        ago: 8,  holder: true  },
      { name: 'Mox',        initials: 'MX', amount: 4900,   pot: 'Pocket aces, 3-bet pre',      mode: 'Bot mode · GTO',    ago: 11, holder: false },
      { name: 'Atlas',      initials: 'AT', amount: 91200,  pot: 'Final-table bink, AK suited', mode: 'Friday Main',       ago: 14, holder: true  },
      { name: 'DegenKing',  initials: 'DG', amount: 6300,   pot: 'Quads on the river',          mode: 'Cash · 10/20',      ago: 18, holder: false },
      { name: 'Riv',        initials: 'RV', amount: 15400,  pot: 'Flush over flush, check-raise', mode: 'Daily Degen',     ago: 22, holder: false },
    ];

    const fmtAgo = (mins) => mins === 0 ? 'JUST NOW' : `${mins} MIN AGO`;
    const render = (rows) => {
      winsList.innerHTML = rows.map((w) => `
        <div class="wins__row">
          <div class="wins__avatar">${w.initials}</div>
          <div class="wins__main">
            <div class="wins__name">${w.name}${w.holder ? '<span class="holder-tag">$HP</span>' : ''}</div>
            <div class="wins__detail">${w.mode} · <em>${w.pot}</em></div>
          </div>
          <div class="wins__amount">+${w.amount.toLocaleString()}</div>
          <div class="wins__time">${fmtAgo(w.ago)}</div>
        </div>
      `).join('');
    };

    render(SAMPLE_WINS);

    // periodically prepend a fresh "win" to feel live
    setInterval(() => {
      const fresh = SAMPLE_WINS[Math.floor(Math.random() * SAMPLE_WINS.length)];
      const newRow = { ...fresh, ago: 0, amount: fresh.amount + Math.floor(Math.random() * 2000 - 1000) };
      // bump everyone else +1 min, drop tail
      SAMPLE_WINS.forEach((w) => w.ago += 1);
      SAMPLE_WINS.unshift(newRow);
      SAMPLE_WINS.length = 8;
      render(SAMPLE_WINS);
      // flash the new row
      const first = winsList.firstElementChild;
      if (first) {
        first.animate(
          [{ background: 'rgba(0, 229, 199, 0.18)' }, { background: 'rgba(0, 229, 199, 0)' }],
          { duration: 1400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        );
      }
    }, 11000);
  }

  // --- Watch-a-hand modal -----------------------------------------------
  const modal = document.getElementById('watch-modal');
  const watchOpen = document.getElementById('watch-open');
  const watchClose = document.getElementById('watch-close');
  const watchReplay = document.getElementById('watch-replay');
  const watchCards = document.getElementById('watch-cards');
  const watchCaption = document.getElementById('watch-caption');

  const REPLAY = [
    { caption: '<em>You</em> · A♥ K♠ · 3-bet to 200',           cards: ['Ah', 'Ks'] },
    { caption: '<em>Flop</em> · K♣ 7♥ 2♠ · top pair, top kicker', cards: ['Ah', 'Ks', 'Kc', '7h', '2s'] },
    { caption: '<em>Turn</em> · A♦ · two pair',                   cards: ['Ah', 'Ks', 'Kc', '7h', '2s', 'Ad'] },
    { caption: '<em>River</em> · Q♥ · checked through',           cards: ['Ah', 'Ks', 'Kc', '7h', '2s', 'Ad', 'Qh'] },
    { caption: 'Pot <em>+12,400</em> · auto-clip rendered',       cards: ['Ah', 'Ks', 'Kc', '7h', '2s', 'Ad', 'Qh'] },
  ];

  let replayTimer = null;
  function playReplay() {
    if (!watchCards) return;
    if (replayTimer) clearTimeout(replayTimer);
    let i = 0;
    const step = () => {
      if (i >= REPLAY.length) return;
      const frame = REPLAY[i];
      watchCards.innerHTML = '';
      frame.cards.forEach((code) => {
        if (window.HPCard) watchCards.appendChild(HPCard.render(code));
      });
      watchCaption.innerHTML = frame.caption;
      i++;
      replayTimer = setTimeout(step, 2200);
    };
    step();
  }

  function openModal() {
    if (!modal) return;
    modal.classList.add('is-open');
    playReplay();
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    if (replayTimer) clearTimeout(replayTimer);
  }
  if (watchOpen) watchOpen.addEventListener('click', openModal);
  if (watchClose) watchClose.addEventListener('click', closeModal);
  if (watchReplay) watchReplay.addEventListener('click', playReplay);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // --- Leaderboard reset countdown --------------------------------------
  const lbReset = document.getElementById('lb-reset');
  if (lbReset) {
    const t = new Date();
    const daysAhead = (7 - t.getUTCDay()) % 7 || 7;
    t.setUTCDate(t.getUTCDate() + daysAhead);
    t.setUTCHours(0, 0, 0, 0);
    setInterval(() => {
      lbReset.textContent = fmtCountdown(t.getTime() - Date.now(), true);
    }, 1000);
  }

  // --- Terminal typing animation (provably-fair) ------------------------
  const term = document.querySelector('.proof__terminal');
  if (term && 'IntersectionObserver' in window) {
    const original = term.innerHTML;
    term.dataset.original = original;
    term.innerHTML = '';

    const typeIn = () => {
      // Strip the original into segments — type plain text, paste tags
      term.innerHTML = original;
      // animate via clip-path on the parent — simpler + faster
      term.style.clipPath = 'inset(0 100% 0 0)';
      term.animate(
        [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
        { duration: 1800, easing: 'steps(60)', fill: 'forwards' }
      );
      term.style.clipPath = 'inset(0 0 0 0)';
    };

    const tObs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          typeIn();
          tObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    tObs.observe(term);
  }

  // --- Counter count-up on scroll into view -----------------------------
  if ('IntersectionObserver' in window) {
    const upTargets = [
      { el: document.getElementById('vault-amount'), to: 418294.31, decimals: 2 },
      { el: document.getElementById('lt-pool'),      to: 2400,      decimals: 0 },
    ];
    const cObs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const target = upTargets.find((t) => t.el === e.target);
        if (!target) return;
        const start = performance.now();
        const dur = 1400;
        const from = 0;
        const tick = (now) => {
          const p = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          const v = from + (target.to - from) * eased;
          target.el.textContent = v.toLocaleString('en-US', { minimumFractionDigits: target.decimals, maximumFractionDigits: target.decimals });
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        cObs.unobserve(target.el);
      });
    }, { threshold: 0.4 });
    upTargets.forEach((t) => { if (t.el) cObs.observe(t.el); });
  }

  // --- FAQ accordion ----------------------------------------------------
  document.querySelectorAll('.faq__q').forEach((q) => {
    q.addEventListener('click', () => {
      const item = q.closest('.faq__item');
      if (!item) return;
      const wasOpen = item.classList.contains('is-open');
      document.querySelectorAll('.faq__item').forEach((i) => i.classList.remove('is-open'));
      if (!wasOpen) item.classList.add('is-open');
    });
  });

  // --- Wallet modal -----------------------------------------------------
  const walletModal = document.getElementById('wallet-modal');
  const buyModal = document.getElementById('buy-modal');
  const openModalEl = (m) => m && m.classList.add('is-open');
  const closeModalEl = (m) => m && m.classList.remove('is-open');

  document.getElementById('wallet-open')?.addEventListener('click', () => openModalEl(walletModal));
  document.getElementById('wallet-close')?.addEventListener('click', () => closeModalEl(walletModal));
  walletModal?.addEventListener('click', (e) => { if (e.target === walletModal) closeModalEl(walletModal); });

  document.querySelectorAll('.wallet-row').forEach((row) => {
    row.addEventListener('click', () => {
      const w = row.dataset.wallet;
      // brief acknowledgement state (real adapter integration in Phase 2)
      const orig = row.innerHTML;
      row.innerHTML = `<div class="wallet-row__main"><div class="wallet-row__name" style="color: var(--neon);">Connecting to ${w}…</div><div class="wallet-row__sub">Approve in your wallet extension</div></div>`;
      setTimeout(() => {
        row.innerHTML = `<div class="wallet-row__main"><div class="wallet-row__name" style="color: var(--ember);">Adapter coming Phase 2</div><div class="wallet-row__sub">@solana/wallet-adapter wired in production build</div></div>`;
        setTimeout(() => { row.innerHTML = orig; }, 2400);
      }, 1200);
    });
  });

  // Buy modal
  document.getElementById('buy-close')?.addEventListener('click', () => closeModalEl(buyModal));
  document.getElementById('buy-cancel')?.addEventListener('click', () => closeModalEl(buyModal));
  buyModal?.addEventListener('click', (e) => { if (e.target === buyModal) closeModalEl(buyModal); });
  document.getElementById('open-buy')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModalEl(walletModal);
    setTimeout(() => openModalEl(buyModal), 320);
  });

  // ESC closes any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModalEl(walletModal);
      closeModalEl(buyModal);
    }
  });

  // --- Mobile drawer ----------------------------------------------------
  const drawer = document.getElementById('drawer');
  document.querySelector('.nav__hamburger')?.addEventListener('click', () => drawer?.classList.add('is-open'));
  document.getElementById('drawer-close')?.addEventListener('click', () => drawer?.classList.remove('is-open'));
  document.getElementById('drawer-scrim')?.addEventListener('click', () => drawer?.classList.remove('is-open'));
  document.getElementById('drawer-wallet')?.addEventListener('click', () => {
    drawer?.classList.remove('is-open');
    setTimeout(() => openModalEl(walletModal), 250);
  });
  drawer?.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => drawer.classList.remove('is-open'));
  });

  // --- Intro splash on first visit --------------------------------------
  const intro = document.getElementById('intro');
  if (intro) {
    const seen = sessionStorage.getItem('hp-intro-seen');
    if (seen) {
      intro.style.display = 'none';
    } else {
      sessionStorage.setItem('hp-intro-seen', '1');
      setTimeout(() => intro.classList.add('hide'), 1700);
      setTimeout(() => intro.style.display = 'none', 2400);
    }
  }

  // --- Boot transition on table-bound clicks ----------------------------
  const overlay = document.getElementById('boot-overlay');
  document.querySelectorAll('a[href="table.html"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (!overlay) return;
      // honour modifier keys (cmd/ctrl/shift open in new tab)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      overlay.classList.add('is-active');
      setTimeout(() => { window.location.href = href; }, 800);
    });
  });
})();
