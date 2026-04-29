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

    setPositions();
    // clear render sigs so all cards redraw for the new deal
    document.getElementById('hero-cards')?.removeAttribute('data-sig');
    document.getElementById('board')?.removeAttribute('data-sig');
    document.querySelectorAll('.seat .seat__cards').forEach((el) => el.removeAttribute('data-sig'));
    document.querySelectorAll('.bet-stack').forEach((el) => el.remove());
    document.querySelectorAll('.win-pop, .hand-banner').forEach((el) => el.remove());
    renderAll();
    // visible blind chip stacks
    renderBetStack(everyone[sbIdx]);
    renderBetStack(everyone[bbIdx]);

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
    if (roundComplete()) { advanceStreet(); return; }
    if (p.id === 'you') {
      setHeroToAct(true);
      moveSpotlightTo('you');
      startTimer(p, 'you');
      // honour any pre-action selection
      maybeAutoPreact();
      togglePreactRow(false);
    } else {
      setHeroToAct(false);
      togglePreactRow(true);
      setActiveSeat(p.id);
      showThinking(p.id, true);
      const delay = 1100 + Math.random() * 1400;
      startTimer(p, p.id, delay / 1000);
      setTimeout(() => {
        showThinking(p.id, false);
        doBotAction(p);
      }, delay);
    }
  }

  // ----- pre-action -----
  let preact = null; // 'check-fold' | 'call-any' | 'raise-any' | null
  function togglePreactRow(showRow) {
    const row = document.getElementById('preact-row');
    if (!row) return;
    row.style.display = showRow ? 'flex' : 'none';
    // when it's your turn (showRow=false), clear the selection visually
    if (!showRow) {
      preact = null;
      row.querySelectorAll('.preact-row__btn').forEach((b) => b.classList.remove('is-on'));
    }
  }
  function maybeAutoPreact() {
    if (!preact) return;
    const toCall = state.currentBet - state.hero.bet;
    if (preact === 'check-fold') {
      setTimeout(() => applyAction(state.hero, toCall === 0 ? 'check' : 'fold'), 200);
    } else if (preact === 'call-any') {
      setTimeout(() => applyAction(state.hero, toCall > 0 ? 'call' : 'check'), 200);
    } else if (preact === 'raise-any') {
      const amt = +document.getElementById('bet-range').value || (state.currentBet * 2);
      setTimeout(() => applyAction(state.hero, 'raise', amt), 200);
    }
  }
  document.querySelectorAll('.preact-row__btn').forEach((b) => {
    b.addEventListener('click', () => {
      const k = b.dataset.pre;
      if (preact === k) {
        preact = null;
        b.classList.remove('is-on');
      } else {
        document.querySelectorAll('.preact-row__btn').forEach((x) => x.classList.remove('is-on'));
        preact = k;
        b.classList.add('is-on');
      }
      chipClick();
    });
  });

  // ----- thinking dots -----
  function showThinking(id, on) {
    const seat = id === 'you'
      ? document.querySelector('.hero-seat')
      : document.querySelector(`.seat[data-pos="${SEATS.find((s) => s.id === id)?.pos}"]`);
    if (!seat) return;
    seat.querySelector('.thinking-tag')?.remove();
    if (on) {
      const t = document.createElement('div');
      t.className = 'thinking-tag';
      t.innerHTML = `Thinking<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
      seat.appendChild(t);
    }
  }

  // ----- depleting action timer ring -----
  let timerInterval = null;
  function startTimer(p, id, durationSec = 14) {
    const seat = id === 'you'
      ? document.querySelector('.hero-seat__info')?.parentElement
      : document.querySelector(`.seat[data-pos="${SEATS.find((s) => s.id === id)?.pos}"]`);
    if (!seat) return;
    if (timerInterval) clearInterval(timerInterval);
    seat.querySelector('.timer-ring')?.remove();
    const r = 30;
    const C = 2 * Math.PI * r;
    const ring = document.createElement('div');
    ring.className = 'timer-ring';
    ring.innerHTML = `
      <svg viewBox="0 0 70 70">
        <circle class="track" cx="35" cy="35" r="${r}"/>
        <circle class="fill"  cx="35" cy="35" r="${r}" stroke-dasharray="${C}" stroke-dashoffset="0"/>
      </svg>`;
    // attach to avatar so position is right
    const avatar = seat.querySelector('.seat__avatar');
    if (avatar) avatar.appendChild(ring);
    else seat.appendChild(ring);
    const fill = ring.querySelector('.fill');
    let elapsed = 0;
    timerInterval = setInterval(() => {
      elapsed += 1;
      const pct = Math.max(0, (durationSec - elapsed) / durationSec);
      fill.style.strokeDashoffset = String(C * (1 - pct));
      if (elapsed >= durationSec) clearInterval(timerInterval);
    }, 1000);
  }
  function clearTimerRing() {
    document.querySelectorAll('.timer-ring').forEach((r) => r.remove());
    if (timerInterval) clearInterval(timerInterval);
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
    clearTimerRing();
    showThinking(p.id, false);
    state.streetActed.add(p.id);
    // remember pre-action stack so we can animate the count-down
    p._stackBefore = p.stack;
    state._potBefore = state.pot;
    if (action === 'fold') {
      p.folded = true;
      p.lastAction = 'folded';
      log(p.name === 'You' ? 'YOU' : p.name, 'folds');
      flashSeat(p.id, 'fold');
      if (p.id !== 'you') botChatChance(p, 'fold');
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
      renderBetStack(p);
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
      state.streetActed = new Set([p.id]);
      p.lastAction = `raised to ${p.bet}`;
      log(p.name === 'You' ? 'YOU' : p.name, `raises to <em>${p.bet}</em>`);
      flashSeat(p.id, 'raise');
      renderBetStack(p);
      chipClick(); setTimeout(chipClick, 80);
    }
    // TARGETED render — DON'T re-create hero hole cards (was causing jumps)
    renderActor(p);
    renderPot(state._potBefore);
    renderControls();
    // advance to next actor
    state.toAct = (state.toAct + 1) % state.everyone.length;
    setTimeout(nextAct, 300);
  }

  // re-render only the seat that just acted: stack count-down + bet pill +
  // folded/all-in styling. Never touches cards.
  function renderActor(p) {
    if (p.id === 'you') {
      const heroStackEl = document.querySelector('.hero-seat__stack');
      if (heroStackEl) animateNumber(heroStackEl, p._stackBefore ?? p.stack, p.stack, ' <span class="unit">CHIPS</span>');
      // hide hero cards if folded
      const heroCards = document.getElementById('hero-cards');
      if (heroCards) heroCards.style.opacity = p.folded ? '0.2' : '1';
    } else {
      const seatEl = document.querySelector(`.seat[data-pos="${SEATS.find((s) => s.id === p.id)?.pos}"]`);
      if (!seatEl) return;
      seatEl.classList.toggle('seat--folded', p.folded);
      const stackEl = seatEl.querySelector('.seat__stack');
      if (stackEl) animateNumber(stackEl, p._stackBefore ?? p.stack, p.stack, ' <span class="unit">CHIPS</span>');
      const betEl = seatEl.querySelector('.seat__bet');
      if (betEl) {
        if (p.folded) betEl.textContent = '— folded';
        else if (p.allIn) betEl.textContent = '— all in';
        else if (p.bet > 0) betEl.textContent = `Bet ${p.bet.toLocaleString()}`;
        else if (p.lastAction) betEl.textContent = `— ${p.lastAction}`;
        else betEl.textContent = '';
      }
    }
    renderBetStack(p);
  }

  // animate text number from a → b over ~400ms
  function animateNumber(el, from, to, suffix = '') {
    if (from === to) { el.innerHTML = `${to.toLocaleString()}${suffix}`; return; }
    const start = performance.now();
    const dur = 380;
    const diff = to - from;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + diff * eased);
      el.innerHTML = `${v.toLocaleString()}${suffix}`;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function advanceStreet() {
    if (handIsOver()) {
      const winner = state.everyone.find((p) => !p.folded);
      sweepBetsToPot(() => awardPot([winner], 'last man standing'));
      return;
    }
    // sweep bet stacks visually to the pot, THEN reset
    sweepBetsToPot(() => {
      state.everyone.forEach((p) => { p.bet = 0; });
      state.currentBet = 0;
      state.minRaise = BB;
      state.streetActed = new Set();
      proceedStreet();
    });
  }

  function proceedStreet() {

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
    setTimeout(nextAct, 800);
  }

  function showdown() {
    const live = state.everyone.filter((p) => !p.folded);
    const evals = live.map((p) => ({ p, e: HPPoker.evaluate([...p.hole, ...state.board]) }));
    evals.sort((a, b) => HPPoker.compare(b.e, a.e));
    const winners = [evals[0].p];
    for (let i = 1; i < evals.length; i++) {
      if (HPPoker.compare(evals[i].e, evals[0].e) === 0) winners.push(evals[i].p);
      else break;
    }
    const winnerEval = evals[0].e;
    log('DEALER', `showdown`);

    // cinematic reveal — opponents flip one at a time
    const opponents = live.filter((p) => p.id !== 'you');
    let i = 0;
    const reveal = () => {
      if (i >= opponents.length) {
        // reveal hero's hand name banner, then award
        const heroName = HPPoker.evaluate([...state.hero.hole, ...state.board]).name;
        const winNames = winners.map((w) => w.name === 'You' ? 'YOU' : w.name).join(' & ');
        showBanner(`${winNames} wins`, winnerEval.name);
        setTimeout(() => awardPot(winners, winnerEval.name), 1400);
        return;
      }
      const p = opponents[i];
      p.reveal = true;
      log(p.name, `shows · ${formatCards(p.hole)} · <em>${HPPoker.evaluate([...p.hole, ...state.board]).name}</em>`);
      cardFlip();
      renderSeats();
      i++;
      setTimeout(reveal, 700);
    };
    setTimeout(reveal, 500);
  }

  function showBanner(top, hand) {
    const felt = document.getElementById('felt');
    if (!felt) return;
    document.querySelectorAll('.hand-banner').forEach((b) => b.remove());
    const b = document.createElement('div');
    b.className = 'hand-banner';
    b.innerHTML = `
      <div class="hand-banner__name">${top}</div>
      <div class="hand-banner__hand"><em>${hand}</em></div>
    `;
    felt.appendChild(b);
    setTimeout(() => b.remove(), 3500);
  }

  function botChatChance(p, kind) {
    // kind: 'win' | 'lose' | 'fold'
    const chances = { win: 0.35, lose: 0.18, fold: 0.06 };
    if (Math.random() > (chances[kind] || 0)) return;
    const lines = {
      win:  ['gg', 'easy', 'whew', 'sorry', 'nh', '🔥', '🎩'],
      lose: ['nh', 'gg', 'wp', '😤', '💀'],
      fold: ['🤡', 'meh', 'fold'],
    }[kind] || [];
    const line = lines[Math.floor(Math.random() * lines.length)];
    setTimeout(() => addBotChat(p, line), 400 + Math.random() * 800);
  }
  function addBotChat(p, text) {
    const list = document.getElementById('chat-list');
    if (!list) return;
    const isEmote = /^[\p{Extended_Pictographic}\s]+$/u.test(text);
    const initials = (p.name || '??').slice(0, 2).toUpperCase();
    const row = document.createElement('div');
    row.className = 'chat-msg';
    row.innerHTML = `<div class="chat-msg__avatar">${initials}</div><div class="chat-msg__body"><div class="chat-msg__name">${p.name} · just now</div><div class="chat-msg__text ${isEmote ? 'emote' : ''}">${text}</div></div>`;
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
  }

  function awardPot(winners, reason) {
    const split = Math.floor(state.pot / winners.length);
    // animate chips flying from pot → each winner
    winners.forEach((w) => flyChipsFromPot(w.id, 8));
    winners.forEach((w) => {
      const before = w.stack;
      w.stack += split;
      log(w.name === 'You' ? 'YOU' : w.name, `wins <em>+${split}</em> · <span style="color:var(--neon)">${reason}</span>`);
      if (w.id !== 'you') botChatChance(w, 'win');
      // animate the winner's stack count-up
      const seatStackEl = w.id === 'you'
        ? document.querySelector('.hero-seat__stack')
        : document.querySelector(`.seat[data-pos="${SEATS.find((s) => s.id === w.id)?.pos}"] .seat__stack`);
      if (seatStackEl) {
        setTimeout(() => animateNumber(seatStackEl, before, w.stack, ' <span class="unit">CHIPS</span>'), 500);
      }
    });
    // losers occasionally chat
    state.everyone.forEach((p) => {
      if (!winners.includes(p) && !p.folded && p.id !== 'you') botChatChance(p, 'lose');
    });
    showWinPop(`+${split.toLocaleString()}`);
    if (winners.some((w) => w.id === 'you')) {
      flashWinFelt();
      rainConfetti();
      boom();
    } else {
      thump();
    }
    localStorage.setItem('hp-stack', String(state.hero.stack));
    state.pot = 0;
    renderAll();
    setTimeout(() => {
      state.everyone.forEach((p) => { if (p.stack < BB * 4) p.stack = Math.max(p.stack, 4000); });
      newHand();
    }, 4800);
  }

  function flyChipsFromPot(toId, n) {
    const pot = document.querySelector('.pot')?.getBoundingClientRect();
    const dest = toId === 'you'
      ? document.querySelector('.hero-seat')?.getBoundingClientRect()
      : document.querySelector(`.seat[data-pos="${SEATS.find((s) => s.id === toId)?.pos}"]`)?.getBoundingClientRect();
    if (!pot || !dest) return;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'chip-fly';
      const sx = pot.left + pot.width / 2 - 14 + (Math.random() * 24 - 12);
      const sy = pot.top + pot.height / 2 - 14 + (Math.random() * 16 - 8);
      const ex = dest.left + dest.width / 2 - 14;
      const ey = dest.top  + dest.height / 2 - 14;
      c.style.left = sx + 'px';
      c.style.top  = sy + 'px';
      document.body.appendChild(c);
      const dur = 600 + Math.random() * 280;
      const delay = i * 40;
      c.animate(
        [{ left: sx + 'px', top: sy + 'px', opacity: 0, transform: 'scale(0.5)' },
         { offset: 0.15, opacity: 1, transform: 'scale(1)' },
         { left: ex + 'px', top: ey + 'px', opacity: 1, transform: 'scale(0.85)' }],
        { duration: dur, delay, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
      );
      setTimeout(() => c.remove(), dur + delay + 30);
    }
    chipClick(); setTimeout(chipClick, 80); setTimeout(chipClick, 160);
  }

  function showWinPop(text) {
    const felt = document.getElementById('felt');
    if (!felt) return;
    const p = document.createElement('div');
    p.className = 'win-pop';
    p.textContent = text;
    felt.appendChild(p);
    setTimeout(() => p.remove(), 1900);
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

  // Only re-create hero hole DOM if cards changed. Prevents the
  // deal-in animation re-firing on every bot action.
  function renderHole() {
    const el = document.getElementById('hero-cards');
    if (!el) return;
    const sig = state.hero.hole.join(' ');
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.innerHTML = '';
    state.hero.hole.forEach((c) => el.appendChild(HPCard.render(c)));
    el.style.opacity = state.hero.folded ? '0.2' : '1';
  }

  // ----- bet stack visualization (chips in front of seat) -----
  function renderBetStack(p) {
    const stackEl = ensureBetStack(p);
    if (!stackEl) return;
    if (p.bet > 0) {
      stackEl.style.display = 'flex';
      stackEl.innerHTML = `<span class="bet-stack__chip"></span> ${p.bet.toLocaleString()}`;
    } else {
      stackEl.style.display = 'none';
    }
  }
  function ensureBetStack(p) {
    let host;
    if (p.id === 'you') host = document.querySelector('.hero-seat');
    else host = document.querySelector(`.seat[data-pos="${SEATS.find((s) => s.id === p.id)?.pos}"]`);
    if (!host) return null;
    let el = host.querySelector('.bet-stack');
    if (!el) {
      el = document.createElement('div');
      el.className = 'bet-stack';
      // position varies by seat location
      const pos = p.id === 'you' ? 'hero' : SEATS.find((s) => s.id === p.id)?.pos;
      const placement = {
        hero: { bottom: '92%', left: '50%', transform: 'translateX(-50%)' },
        top:  { top: '92%', left: '50%', transform: 'translateX(-50%)' },
        tl:   { top: '92%', left: '20%' },
        tr:   { top: '92%', right: '20%' },
        ml:   { left: '92%', top: '50%', transform: 'translateY(-50%)' },
        mr:   { right: '92%', top: '50%', transform: 'translateY(-50%)' },
      }[pos];
      Object.assign(el.style, placement || {});
      host.appendChild(el);
    }
    return el;
  }

  function sweepBetsToPot(then) {
    // animate every visible bet stack to the pot center, then run callback
    const pot = document.querySelector('.pot')?.getBoundingClientRect();
    const stacks = document.querySelectorAll('.bet-stack');
    if (!pot || stacks.length === 0) { then && then(); return; }
    let pending = stacks.length;
    stacks.forEach((s) => {
      if (s.style.display === 'none') { pending--; if (!pending) then && then(); return; }
      const rect = s.getBoundingClientRect();
      const dx = (pot.left + pot.width / 2) - (rect.left + rect.width / 2);
      const dy = (pot.top + pot.height / 2) - (rect.top + rect.height / 2);
      s.style.setProperty('--dx', dx + 'px');
      s.style.setProperty('--dy', dy + 'px');
      s.style.animation = 'betSweep 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => {
        s.remove();
        pending--;
        if (!pending) then && then();
      }, 580);
    });
    chipClick(); setTimeout(chipClick, 90);
  }

  // ----- position labels (UTG / MP / CO / BTN / SB / BB) -----
  function setPositions() {
    const N = state.everyone.length;
    // standard 6-handed labels by offset from button
    // 0=BTN, 1=SB, 2=BB, 3=UTG, 4=MP / HJ, 5=CO
    const POS_LABELS = ['BTN','SB','BB','UTG','MP','CO'];
    state.everyone.forEach((p, idx) => {
      const offset = ((idx - state.btnIdx) + N) % N;
      p.position = POS_LABELS[offset] || '';
    });
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
      const stale = el.querySelector('.seat__action-tag');
      if (stale) stale.remove();

      // position chip
      let pc = el.querySelector('.pos-chip');
      if (!pc) { pc = document.createElement('div'); pc.className = 'pos-chip'; el.appendChild(pc); }
      pc.textContent = p.position || '';
      pc.dataset.pos = p.position || '';

      // online dot
      if (!el.querySelector('.seat__online')) {
        const dot = document.createElement('div');
        dot.className = 'seat__online';
        el.appendChild(dot);
      }
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
      // cards: back when hidden, face when revealed, nothing when folded
      // diff against last sig so we don't replay deal-in on every action
      const cardsEl = el.querySelector('.seat__cards');
      if (cardsEl) {
        const sig = p.folded ? 'folded' : (p.reveal ? `face:${p.hole.join('')}` : 'back');
        if (cardsEl.dataset.sig !== sig) {
          cardsEl.dataset.sig = sig;
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

  // Only re-paint the board if it changed (prevents flop/turn/river
  // cards from re-animating when something else triggers a render).
  function renderBoard() {
    const board = document.getElementById('board');
    if (!board) return;
    const sig = state.board.join(' ');
    if (board.dataset.sig === sig) return;
    board.dataset.sig = sig;
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

  function renderPot(fromValue) {
    const a = document.getElementById('pot-amount');
    if (!a) return;
    if (fromValue != null && fromValue !== state.pot) {
      animateNumber(a, fromValue, state.pot);
    } else {
      a.textContent = state.pot.toLocaleString();
    }
  }

  function setHeroToAct(yes) {
    document.querySelectorAll('.action-buttons .btn').forEach((b) => {
      b.disabled = !yes;
    });
    const range = document.getElementById('bet-range');
    const inp = document.getElementById('bet-input');
    if (range) range.disabled = !yes;
    if (inp) inp.disabled = !yes;
    document.querySelector('.action-bar')?.classList.toggle('is-active', yes);
    if (yes) {
      // can the hero raise at all? if call would put them all-in, disable raise
      const toCall = state.currentBet - state.hero.bet;
      const canRaise = state.hero.stack > toCall;
      const raiseBtn = document.getElementById('btn-raise');
      if (raiseBtn) raiseBtn.disabled = !canRaise;
    }
  }
  function setActiveSeat(id) {
    document.querySelectorAll('.seat').forEach((s) => s.classList.remove('seat--active'));
    const sel = `.seat[data-pos="${SEATS.find((s) => s.id === id).pos}"]`;
    document.querySelector(sel)?.classList.add('seat--active');
    moveSpotlightTo(id);
  }
  function moveSpotlightTo(id) {
    const spot = document.getElementById('felt-spot');
    const felt = document.getElementById('felt');
    if (!spot || !felt) return;
    let host;
    if (id === 'you') host = document.querySelector('.hero-seat');
    else host = document.querySelector(`.seat[data-pos="${SEATS.find((s) => s.id === id)?.pos}"]`);
    if (!host) { spot.classList.remove('is-on'); return; }
    const f = felt.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    const x = (h.left + h.width / 2) - f.left;
    const y = (h.top + h.height / 2) - f.top;
    spot.style.left = x + 'px';
    spot.style.top  = y + 'px';
    spot.classList.add('is-on');
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
    const inp = document.getElementById('bet-input');
    if (inp && document.activeElement !== inp) inp.value = v;
    if (raiseAmount) raiseAmount.textContent = v.toLocaleString();
    const pct = ((v - min) / Math.max(1, (max - min))) * 100;
    range.style.setProperty('--val', pct + '%');
  }
  const betInput = document.getElementById('bet-input');
  if (range) range.addEventListener('input', (e) => updateBet(+e.target.value));
  if (betInput) {
    betInput.addEventListener('input', (e) => updateBet(+e.target.value));
    betInput.addEventListener('blur', () => updateBet(+betInput.value));
  }
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
