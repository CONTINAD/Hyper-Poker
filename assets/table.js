/* ============================================================
   Hyper Poker — Table runtime (engine-driven)
   Real shuffle, real bots, real hand eval.
   ============================================================ */

(() => {
  if (!window.HPPoker || !window.HPCard) {
    console.error('Engine not loaded');
    return;
  }

  // ----------------------------------------------------------------------
  //  AUDIO
  // ----------------------------------------------------------------------
  let audioCtx = null;
  function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  const soundOn = () => !window.__hpSoundOn || window.__hpSoundOn();

  function chipClick() {
    if (!soundOn()) return;
    const ctx = ac(); const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.07);
  }
  function cardFlip() {
    if (!soundOn()) return;
    const ctx = ac(); const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2200;
    const g = ctx.createGain(); g.gain.value = 0.18;
    noise.connect(f).connect(g).connect(ctx.destination);
    noise.start(t);
  }
  function thump() {
    if (!soundOn()) return;
    const ctx = ac(); const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.22);
  }
  function boom() {
    if (!soundOn()) return;
    const ctx = ac(); const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.72);
  }

  // ----------------------------------------------------------------------
  //  ROOM / HAND STATE
  // ----------------------------------------------------------------------
  const SEATS = [
    { id: 'sk', name: 'Skinny',    pos: 'top', style: 'tight', stack: 8420 },
    { id: 'dg', name: 'DegenKing', pos: 'tl',  style: 'loose', stack: 6100 },
    { id: 'ar', name: 'Aria',      pos: 'tr',  style: 'gto',   stack: 14800 },
    { id: 'vl', name: 'Volt',      pos: 'ml',  style: 'fish',  stack: 3950 },
    { id: 'rx', name: 'Roxy',      pos: 'mr',  style: 'tight', stack: 11200 },
  ];
  const HERO = { id: 'you', name: 'You', stack: parseInt(localStorage.getItem('hp-stack') || '9950', 10) };

  const SB = 25, BB = 50;

  let state = null;

  function newHand() {
    const seed = Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF);
    const fullDeck = HPPoker.deck(seed);
    let i = 0;
    // deal 2 hole cards to each active seat (5 bots) + hero
    const seats = SEATS.map((s) => ({ ...s, hole: [], folded: false, bet: 0, totalBet: 0, lastAction: null, allIn: false }));
    const hero = { ...HERO, hole: [], folded: false, bet: 0, totalBet: 0, lastAction: null, allIn: false };
    const everyone = [hero, ...seats];
    for (let pass = 0; pass < 2; pass++) {
      for (const p of everyone) p.hole.push(fullDeck[i++]);
    }
    // pick dealer button — rotate based on hand counter
    const handNum = parseInt(localStorage.getItem('hp-hand-num') || '0', 10) + 1;
    localStorage.setItem('hp-hand-num', String(handNum));
    const btnIdx = (handNum - 1) % everyone.length;
    const sbIdx = (btnIdx + 1) % everyone.length;
    const bbIdx = (btnIdx + 2) % everyone.length;

    everyone[sbIdx].bet = SB;
    everyone[sbIdx].stack -= SB;
    everyone[sbIdx].totalBet = SB;
    everyone[bbIdx].bet = BB;
    everyone[bbIdx].stack -= BB;
    everyone[bbIdx].totalBet = BB;

    state = {
      seed,
      handNum,
      deck: fullDeck,
      deckIdx: i,
      hero,
      seats,
      everyone,
      board: [],
      pot: SB + BB,
      currentBet: BB,
      minRaise: BB,
      street: 'pre',
      btnIdx,
      sbIdx,
      bbIdx,
      toAct: (bbIdx + 1) % everyone.length,  // UTG
      lastAggressor: bbIdx,
      streetActed: new Set(),
      committed: SB + BB,
    };

    renderAll();
    log('DEALER', `Hand <em>#${handNum}</em> · seed ${String(seed).slice(-6)} · BB ${BB}`);
    log('DEALER', `posts SB ${SB} (${everyone[sbIdx].name}), BB ${BB} (${everyone[bbIdx].name})`);

    // begin betting round
    nextAct();
  }

  function nextAct() {
    if (handIsOver()) { advanceStreet(); return; }
    const p = state.everyone[state.toAct];
    if (p.folded || p.allIn) {
      state.toAct = (state.toAct + 1) % state.everyone.length;
      return nextAct();
    }
    // round complete?
    if (roundComplete()) {
      advanceStreet();
      return;
    }
    if (p.id === 'you') {
      // wait for human input via action buttons
      setHeroToAct(true);
    } else {
      setHeroToAct(false);
      setActiveSeat(p.id);
      // bot decides after a small delay
      const delay = 700 + Math.random() * 900;
      setTimeout(() => doBotAction(p), delay);
    }
  }

  function roundComplete() {
    // round over when every non-folded, non-allIn player has acted on this street
    // and matched current bet (or checked when 0)
    const live = state.everyone.filter((p) => !p.folded && !p.allIn);
    if (live.length <= 1) return true;
    const allActed = live.every((p) => state.streetActed.has(p.id));
    const allMatched = live.every((p) => p.bet === state.currentBet);
    return allActed && allMatched;
  }

  function handIsOver() {
    const live = state.everyone.filter((p) => !p.folded);
    return live.length <= 1;
  }

  function doBotAction(p) {
    const ctx = {
      hole: p.hole,
      board: state.board,
      toCall: state.currentBet - p.bet,
      pot: state.pot,
      stack: p.stack,
      minRaise: state.minRaise,
      street: state.street,
    };
    const dec = HPPoker.botAction({ id: p.id, style: p.style }, ctx);
    applyAction(p, dec.action, dec.amount);
  }

  function applyAction(p, action, amount) {
    state.streetActed.add(p.id);
    if (action === 'fold') {
      p.folded = true;
      p.lastAction = 'folded';
      log(p.name === 'You' ? 'YOU' : p.name, 'folds');
      flashSeat(p.id, 'fold');
    } else if (action === 'check') {
      p.lastAction = 'checked';
      log(p.name === 'You' ? 'YOU' : p.name, 'checks');
      flashSeat(p.id, 'check');
    } else if (action === 'call') {
      const owe = state.currentBet - p.bet;
      const pay = Math.min(owe, p.stack);
      p.stack -= pay;
      p.bet += pay;
      p.totalBet += pay;
      state.pot += pay;
      if (p.stack === 0) p.allIn = true;
      p.lastAction = `called ${pay}`;
      log(p.name === 'You' ? 'YOU' : p.name, `calls <em>${pay}</em>`);
      flashSeat(p.id, 'call');
      flyChips(p.id, 2 + Math.floor(pay / 200));
      chipClick();
    } else if (action === 'raise') {
      const target = Math.max(state.minRaise, amount || state.currentBet * 2);
      const owe = target - p.bet;
      const pay = Math.min(owe, p.stack);
      p.stack -= pay;
      p.bet += pay;
      p.totalBet += pay;
      state.pot += pay;
      if (p.stack === 0) p.allIn = true;
      const raiseSize = p.bet - state.currentBet;
      state.minRaise = Math.max(state.minRaise, raiseSize);
      state.currentBet = p.bet;
      state.lastAggressor = state.everyone.indexOf(p);
      // raising re-opens the round for everyone else
      state.streetActed = new Set([p.id]);
      p.lastAction = `raised to ${p.bet}`;
      log(p.name === 'You' ? 'YOU' : p.name, `raises to <em>${p.bet}</em>`);
      flashSeat(p.id, 'raise');
      flyChips(p.id, 3 + Math.floor(p.bet / 400));
      chipClick(); setTimeout(chipClick, 80);
    }
    renderAll();
    // advance to next actor
    state.toAct = (state.toAct + 1) % state.everyone.length;
    setTimeout(nextAct, 300);
  }

  function advanceStreet() {
    if (handIsOver()) {
      // single survivor wins the pot
      const winner = state.everyone.find((p) => !p.folded);
      awardPot([winner], 'last man standing');
      return;
    }
    // collect bets — already in pot; reset
    state.everyone.forEach((p) => { p.bet = 0; });
    state.currentBet = 0;
    state.minRaise = BB;
    state.streetActed = new Set();

    if (state.street === 'pre') {
      state.street = 'flop';
      state.board.push(state.deck[state.deckIdx++]);
      state.board.push(state.deck[state.deckIdx++]);
      state.board.push(state.deck[state.deckIdx++]);
      log('DEALER', `flop · ${formatCards(state.board)}`);
    } else if (state.street === 'flop') {
      state.street = 'turn';
      state.board.push(state.deck[state.deckIdx++]);
      log('DEALER', `turn · ${formatCards([state.board[3]])}`);
    } else if (state.street === 'turn') {
      state.street = 'river';
      state.board.push(state.deck[state.deckIdx++]);
      log('DEALER', `river · ${formatCards([state.board[4]])}`);
    } else if (state.street === 'river') {
      showdown();
      return;
    }

    // first to act postflop = SB or first live seat after button
    let idx = (state.btnIdx + 1) % state.everyone.length;
    while (state.everyone[idx].folded || state.everyone[idx].allIn) {
      idx = (idx + 1) % state.everyone.length;
      if (idx === state.btnIdx) break;
    }
    state.toAct = idx;

    renderAll();
    setTimeout(nextAct, 700);
  }

  function showdown() {
    const live = state.everyone.filter((p) => !p.folded);
    // reveal opponents' hole cards for showdown
    live.forEach((p) => {
      if (p.id !== 'you') p.reveal = true;
    });
    // evaluate each
    const evals = live.map((p) => ({ p, e: HPPoker.evaluate([...p.hole, ...state.board]) }));
    evals.sort((a, b) => HPPoker.compare(b.e, a.e));
    // group winners
    const winners = [evals[0].p];
    for (let i = 1; i < evals.length; i++) {
      if (HPPoker.compare(evals[i].e, evals[0].e) === 0) winners.push(evals[i].p);
      else break;
    }
    const winnerEval = evals[0].e;
    log('DEALER', `showdown · ${live.map((p) => `${p.name}: ${HPPoker.evaluate([...p.hole, ...state.board]).name}`).join(' · ')}`);
    awardPot(winners, winnerEval.name);
  }

  function awardPot(winners, reason) {
    const split = Math.floor(state.pot / winners.length);
    winners.forEach((w) => {
      w.stack += split;
      log(w.name === 'You' ? 'YOU' : w.name, `wins <em>+${split}</em> · <span style="color:var(--neon)">${reason}</span>`);
    });
    if (winners.some((w) => w.id === 'you')) {
      flashWinFelt();
      rainConfetti();
      boom();
    }
    // persist hero stack
    localStorage.setItem('hp-stack', String(state.hero.stack));
    state.pot = 0;
    renderAll();
    // schedule new hand
    setTimeout(() => {
      // remove busted bots? for prototype: top them up
      state.everyone.forEach((p) => { if (p.stack < BB * 4) p.stack = Math.max(p.stack, 4000); });
      newHand();
    }, 4500);
  }

  // ----------------------------------------------------------------------
  //  RENDER
  // ----------------------------------------------------------------------
  function renderAll() {
    renderHole();
    renderSeats();
    renderBoard();
    renderPot();
    renderControls();
  }

  function renderHole() {
    const el = document.getElementById('hero-cards');
    if (!el) return;
    el.innerHTML = '';
    state.hero.hole.forEach((c) => el.appendChild(HPCard.render(c)));
  }

  function renderSeats() {
    const seatEls = {
      sk: document.querySelector('.seat[data-pos="top"]'),
      dg: document.querySelector('.seat[data-pos="tl"]'),
      ar: document.querySelector('.seat[data-pos="tr"]'),
      vl: document.querySelector('.seat[data-pos="ml"]'),
      rx: document.querySelector('.seat[data-pos="mr"]'),
    };
    state.seats.forEach((p) => {
      const el = seatEls[p.id];
      if (!el) return;
      el.classList.toggle('seat--folded', p.folded);
      // remove the static action-tag from old markup (engine drives seat__bet now)
      const stale = el.querySelector('.seat__action-tag');
      if (stale) stale.remove();
      const stackEl = el.querySelector('.seat__stack');
      if (stackEl) stackEl.innerHTML = `${p.stack.toLocaleString()} <span class="unit">CHIPS</span>`;
      const betEl = el.querySelector('.seat__bet');
      if (betEl) {
        if (p.folded) betEl.textContent = '— folded';
        else if (p.allIn) betEl.textContent = '— all in';
        else if (p.bet > 0) betEl.textContent = `Bet ${p.bet.toLocaleString()}`;
        else if (p.lastAction) betEl.textContent = `— ${p.lastAction}`;
        else betEl.textContent = '';
      }
      // show cards (back) for non-folded players, or face for showdown
      const cardsEl = el.querySelector('.seat__cards');
      if (cardsEl) {
        cardsEl.innerHTML = '';
        if (!p.folded) {
          if (p.reveal) {
            p.hole.forEach((c) => {
              const mini = HPCard.render(c);
              mini.classList.add('mini-face');
              mini.style.transform = 'scale(0.45)';
              mini.style.transformOrigin = 'top left';
              cardsEl.appendChild(mini);
            });
          } else {
            for (let i = 0; i < 2; i++) {
              const back = document.createElement('div');
              back.className = 'mini-back';
              cardsEl.appendChild(back);
            }
          }
        }
      }
      // dealer button placement
      el.classList.toggle('has-button', state.everyone.indexOf(p) === state.btnIdx);
    });

    // active seat ring
    document.querySelectorAll('.seat').forEach((s) => s.classList.remove('seat--active'));
    const actor = state.everyone[state.toAct];
    if (actor && actor.id !== 'you' && !actor.folded) {
      const seatEl = seatEls[actor.id];
      if (seatEl) seatEl.classList.add('seat--active');
    }
  }

  function renderBoard() {
    const board = document.getElementById('board');
    if (!board) return;
    board.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      if (i < state.board.length) {
        const card = HPCard.render(state.board[i]);
        board.appendChild(card);
      } else {
        const slot = document.createElement('div');
        slot.className = 'card-slot';
        slot.dataset.slot = String(i);
        board.appendChild(slot);
      }
    }
  }

  function renderPot() {
    const a = document.getElementById('pot-amount');
    if (a) a.textContent = state.pot.toLocaleString();
  }

  function setHeroToAct(yes) {
    document.querySelectorAll('.action-buttons .btn').forEach((b) => {
      b.disabled = !yes;
      b.style.opacity = yes ? '1' : '0.45';
    });
    document.getElementById('bet-range').disabled = !yes;
    if (yes) {
      const heroSeat = document.querySelector('.hero-seat__info');
      if (heroSeat) heroSeat.classList.add('is-acting');
    }
  }
  function setActiveSeat(id) {
    document.querySelectorAll('.seat').forEach((s) => s.classList.remove('seat--active'));
    const sel = `.seat[data-pos="${SEATS.find((s) => s.id === id).pos}"]`;
    document.querySelector(sel)?.classList.add('seat--active');
  }

  function renderControls() {
    const toCall = state.currentBet - state.hero.bet;
    const callBtn = document.getElementById('btn-call');
    const raiseBtn = document.getElementById('btn-raise');
    const range = document.getElementById('bet-range');
    if (callBtn) {
      if (toCall <= 0) callBtn.innerHTML = 'Check';
      else callBtn.innerHTML = `Call <span style="color:var(--bone-3); margin-left:6px;">${toCall.toLocaleString()}</span>`;
    }
    const minR = Math.max(state.currentBet * 2, state.minRaise + state.currentBet, BB * 2);
    const maxR = state.hero.stack + state.hero.bet;
    if (range) {
      range.min = minR;
      range.max = maxR;
      if (+range.value < minR) range.value = Math.min(minR + 200, maxR);
    }
    updateBet(+range.value);

    // top-bar your-bag
    const bag = document.querySelector('.table-top__right .table-top__stat:last-child .val--ember');
    if (bag) bag.textContent = `${state.hero.stack.toLocaleString()} CHIPS`;
    // hero seat stack
    const heroStack = document.querySelector('.hero-seat__stack');
    if (heroStack) heroStack.innerHTML = `${state.hero.stack.toLocaleString()} <span class="unit">CHIPS</span>`;
  }

  function flashSeat(id, type) {
    const seatEl = id === 'you'
      ? document.querySelector('.hero-seat__info')
      : document.querySelector(`.seat[data-pos="${SEATS.find((s) => s.id === id).pos}"]`);
    if (!seatEl) return;
    const colors = { fold: 'rgba(244,236,223,0.06)', check: 'rgba(244,236,223,0.1)', call: 'rgba(0,229,199,0.2)', raise: 'rgba(255,45,111,0.3)' };
    seatEl.animate(
      [{ background: colors[type] || 'rgba(255,255,255,0.05)' }, { background: 'transparent' }],
      { duration: 700, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
  }

  function flyChips(fromId, n) {
    const start = fromId === 'you'
      ? document.querySelector('.hero-seat')?.getBoundingClientRect()
      : document.querySelector(`.seat[data-pos="${SEATS.find((s) => s.id === fromId)?.pos}"]`)?.getBoundingClientRect();
    const pot = document.querySelector('.pot')?.getBoundingClientRect();
    if (!start || !pot) return;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'chip-fly';
      const sx = start.left + start.width / 2 - 14;
      const sy = start.top + start.height / 2 - 14;
      const ex = pot.left + pot.width / 2 - 14 + (Math.random() * 20 - 10);
      const ey = pot.top + 12 + (Math.random() * 12 - 6);
      c.style.left = sx + 'px';
      c.style.top = sy + 'px';
      document.body.appendChild(c);
      const dur = 520 + Math.random() * 220;
      c.animate(
        [{ left: sx + 'px', top: sy + 'px', opacity: 0, transform: 'scale(0.5)' },
         { offset: 0.2, opacity: 1, transform: 'scale(1)' },
         { left: ex + 'px', top: ey + 'px', opacity: 1, transform: 'scale(0.85)' }],
        { duration: dur, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
      );
      setTimeout(() => c.remove(), dur + 30);
    }
  }

  function flashWinFelt() {
    const felt = document.getElementById('felt');
    if (!felt) return;
    felt.animate(
      [{ filter: 'brightness(1)' }, { filter: 'brightness(1.4)' }, { filter: 'brightness(1)' }],
      { duration: 1400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
  }

  function rainConfetti() {
    const variants = ['', 'gold', 'neon'];
    const N = 80;
    for (let i = 0; i < N; i++) {
      const c = document.createElement('div');
      c.className = `confetti-piece ${variants[i % 3]}`;
      const x = Math.random() * window.innerWidth;
      const drift = (Math.random() - 0.5) * 220;
      const dur = 1800 + Math.random() * 1600;
      const delay = Math.random() * 400;
      const rot = Math.random() * 720 - 360;
      const sz = 8 + Math.random() * 10;
      c.style.left = x + 'px';
      c.style.width = sz + 'px';
      c.style.height = sz + 'px';
      document.body.appendChild(c);
      c.animate(
        [{ transform: `translate(0, 0) rotate(0)`, opacity: 1 },
         { transform: `translate(${drift}px, ${window.innerHeight + 60}px) rotate(${rot}deg)`, opacity: 0.9 }],
        { duration: dur, delay, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' }
      );
      setTimeout(() => c.remove(), dur + delay + 50);
    }
  }

  // ----------------------------------------------------------------------
  //  HUMAN ACTION HANDLERS
  // ----------------------------------------------------------------------
  document.getElementById('btn-fold')?.addEventListener('click', () => {
    if (state.everyone[state.toAct].id !== 'you') return;
    applyAction(state.hero, 'fold');
  });
  document.getElementById('btn-call')?.addEventListener('click', () => {
    if (state.everyone[state.toAct].id !== 'you') return;
    const toCall = state.currentBet - state.hero.bet;
    applyAction(state.hero, toCall > 0 ? 'call' : 'check');
  });
  document.getElementById('btn-raise')?.addEventListener('click', () => {
    if (state.everyone[state.toAct].id !== 'you') return;
    const range = document.getElementById('bet-range');
    applyAction(state.hero, 'raise', +range.value);
  });

  // ----------------------------------------------------------------------
  //  BET SLIDER + PRESETS
  // ----------------------------------------------------------------------
  const range = document.getElementById('bet-range');
  const betAmount = document.getElementById('bet-amount');
  const raiseAmount = document.getElementById('raise-amount');
  function updateBet(v) {
    if (!range) return;
    const min = +range.min, max = +range.max;
    v = Math.max(min, Math.min(max, Math.round(v / 25) * 25));
    range.value = v;
    if (betAmount) betAmount.textContent = v.toLocaleString();
    if (raiseAmount) raiseAmount.textContent = v.toLocaleString();
    const pct = ((v - min) / Math.max(1, (max - min))) * 100;
    range.style.setProperty('--val', pct + '%');
  }
  if (range) range.addEventListener('input', (e) => updateBet(+e.target.value));
  document.querySelectorAll('.bet-presets button').forEach((b) => {
    b.addEventListener('click', () => {
      const pct = +b.dataset.pct;
      let v;
      if (pct === 200) v = state.hero.stack + state.hero.bet;
      else v = (state.currentBet - state.hero.bet) + Math.round(state.pot * pct / 100);
      updateBet(v);
      chipClick();
    });
  });

  // ----------------------------------------------------------------------
  //  RAIL TABS
  // ----------------------------------------------------------------------
  document.querySelectorAll('.rail__tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.rail__tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.rail__body').forEach((body) => {
        if (body.dataset.tab === target) {
          body.style.display = target === 'chat' ? 'flex' : '';
        } else body.style.display = 'none';
      });
    });
  });

  // chat
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const chatList = document.getElementById('chat-list');
  function escapeHtml(s) { return s.replace(/[<>&"']/g, (c) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c])); }
  function sendChat() {
    if (!chatInput || !chatList) return;
    const text = chatInput.value.trim();
    if (!text) return;
    const isEmote = /^[\p{Extended_Pictographic}\s]+$/u.test(text);
    const row = document.createElement('div');
    row.className = 'chat-msg';
    row.innerHTML = `<div class="chat-msg__avatar" style="background: var(--ember); color: var(--ink);">YOU</div><div class="chat-msg__body"><div class="chat-msg__name"><span class="me">YOU · just now</span></div><div class="chat-msg__text ${isEmote ? 'emote' : ''}">${escapeHtml(text)}</div></div>`;
    chatList.appendChild(row);
    chatList.scrollTop = chatList.scrollHeight;
    chatInput.value = '';
    chipClick();
  }
  if (chatSend) chatSend.addEventListener('click', sendChat);
  if (chatInput) chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  // emote rail
  const emoteToggle = document.getElementById('emote-toggle');
  const emoteRail = document.getElementById('emote-rail');
  if (emoteToggle && emoteRail) {
    emoteToggle.addEventListener('click', () => emoteRail.classList.toggle('is-open'));
    emoteRail.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        sendEmote(b.dataset.emote);
        emoteRail.classList.remove('is-open');
      });
    });
  }
  function sendEmote(glyph) {
    const heroSeat = document.querySelector('.hero-seat');
    if (!heroSeat) return;
    const rect = heroSeat.getBoundingClientRect();
    const bubble = document.createElement('div');
    bubble.className = 'emote-bubble';
    bubble.textContent = glyph;
    bubble.style.left = (rect.left + rect.width / 2 - 16) + 'px';
    bubble.style.top  = (rect.top - 30) + 'px';
    document.body.appendChild(bubble);
    setTimeout(() => bubble.remove(), 1900);
    chipClick();
  }

  // settings panel
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsPanel = document.getElementById('settings-panel');
  if (settingsToggle && settingsPanel) {
    settingsToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsPanel.classList.toggle('is-open');
    });
    document.addEventListener('click', (e) => {
      if (!settingsPanel.contains(e.target) && !settingsToggle.contains(e.target)) {
        settingsPanel.classList.remove('is-open');
      }
    });
  }
  const prefs = JSON.parse(localStorage.getItem('hp-prefs') || '{}');
  const defaultPrefs = { sound: true, anim: true, fourcolor: false, autoclip: true };
  Object.assign(defaultPrefs, prefs);
  document.querySelectorAll('.toggle[data-pref]').forEach((t) => {
    const key = t.dataset.pref;
    if (defaultPrefs[key]) t.classList.add('on'); else t.classList.remove('on');
    t.addEventListener('click', () => {
      t.classList.toggle('on');
      defaultPrefs[key] = t.classList.contains('on');
      localStorage.setItem('hp-prefs', JSON.stringify(defaultPrefs));
      applyPrefs();
    });
  });
  function applyPrefs() {
    document.body.classList.toggle('fourcolor', !!defaultPrefs.fourcolor);
  }
  applyPrefs();
  window.__hpSoundOn = () => defaultPrefs.sound !== false;

  // ----------------------------------------------------------------------
  //  HAND LOG
  // ----------------------------------------------------------------------
  function log(who, what) {
    const el = document.getElementById('hand-log');
    if (!el) return;
    const t = new Date();
    const time = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span class="t">${time}</span><span class="who">${who}</span><span class="what">${what}</span>`;
    el.appendChild(row);
    el.scrollTop = el.scrollHeight;
  }
  function formatCards(codes) {
    const map = { s:'♠', h:'♥', d:'♦', c:'♣' };
    return codes.map((c) => {
      const r = c[0] === 'T' ? '10' : c[0];
      const s = c.slice(-1);
      const color = (s === 'h' || s === 'd') ? 'var(--ember)' : 'var(--bone)';
      return `<span style="color:${color}; font-weight:700;">${r}${map[s]}</span>`;
    }).join(' ');
  }

  // clear initial seed log content (was sample-data)
  document.getElementById('hand-log').innerHTML = '';

  // ----------------------------------------------------------------------
  //  KICKOFF
  // ----------------------------------------------------------------------
  newHand();
})();
