/* ============================================
   Hyper Poker — Table interactions (prototype)
   - Fake hand state, but interactions feel real
   - Bet slider, presets, fold/call/raise actions
   - Deals flop/turn/river on call sequence
   - Web Audio synth for chip click + card flip
   ============================================ */

(() => {

  // ----------------------------------------------------------------------
  //  STATE
  // ----------------------------------------------------------------------
  const state = {
    pot: 1250,
    toCall: 400,
    yourStack: 9950,
    bet: 1200,
    minRaise: 800,
    maxRaise: 9950,
    street: 'pre',  // pre | flop | turn | river | showdown
  };

  // The flop/turn/river to reveal as the hand progresses
  const board = [
    { rank: 'K', suit: '♣', color: 'black' },
    { rank: '7', suit: '♥', color: 'red' },
    { rank: '2', suit: '♠', color: 'black' },
    { rank: 'A', suit: '♦', color: 'red' },
    { rank: 'Q', suit: '♥', color: 'red' },
  ];

  // ----------------------------------------------------------------------
  //  AUDIO — synthesised so the prototype works offline
  // ----------------------------------------------------------------------
  let audioCtx = null;
  function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function chipClick() {
    const ctx = ac();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.07);
  }

  function cardFlip() {
    const ctx = ac();
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    noise.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    noise.connect(f).connect(g).connect(ctx.destination);
    noise.start(t);
  }

  function thump() {
    const ctx = ac();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.22);
  }

  // ----------------------------------------------------------------------
  //  BET SLIDER
  // ----------------------------------------------------------------------
  const range = document.getElementById('bet-range');
  const betAmount = document.getElementById('bet-amount');
  const raiseAmount = document.getElementById('raise-amount');

  function updateBet(v) {
    state.bet = Math.max(state.minRaise, Math.min(state.maxRaise, Math.round(v / 25) * 25));
    if (range) range.value = state.bet;
    if (betAmount) betAmount.textContent = state.bet.toLocaleString();
    if (raiseAmount) raiseAmount.textContent = state.bet.toLocaleString();
    if (range) {
      const pct = ((state.bet - range.min) / (range.max - range.min)) * 100;
      range.style.setProperty('--val', pct + '%');
    }
  }
  if (range) {
    range.addEventListener('input', (e) => updateBet(+e.target.value));
    updateBet(state.bet);
  }

  document.querySelectorAll('.bet-presets button').forEach((b) => {
    b.addEventListener('click', () => {
      const pct = +b.dataset.pct;
      let v;
      if (pct === 200) v = state.yourStack;            // ALL-IN
      else v = Math.round(state.pot * pct / 100);
      updateBet(v);
      chipClick();
      flashButton(b);
    });
  });

  function flashButton(el) {
    el.animate(
      [
        { boxShadow: '0 0 0 0 rgba(255,45,111,0)' },
        { boxShadow: '0 0 0 6px rgba(255,45,111,0.4)' },
        { boxShadow: '0 0 0 12px rgba(255,45,111,0)' },
      ],
      { duration: 360, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
  }

  // ----------------------------------------------------------------------
  //  ACTION BUTTONS
  // ----------------------------------------------------------------------
  const btnFold  = document.getElementById('btn-fold');
  const btnCall  = document.getElementById('btn-call');
  const btnRaise = document.getElementById('btn-raise');

  if (btnFold)  btnFold.addEventListener('click', onFold);
  if (btnCall)  btnCall.addEventListener('click', onCall);
  if (btnRaise) btnRaise.addEventListener('click', onRaise);

  function onFold() {
    thump();
    log('YOU', 'folds');
    document.querySelector('.hero-seat__cards')?.animate(
      [{ transform: 'translateY(0) rotate(0)', opacity: 1 },
       { transform: 'translateY(120px) rotate(-12deg)', opacity: 0 }],
      { duration: 600, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', fill: 'forwards' }
    );
    setTimeout(() => alert('Hand over. (prototype — replay screen would render here)'), 700);
  }

  function onCall() {
    chipClick();
    log('YOU', `calls <em>${state.toCall}</em>`);
    flyChips(3);
    addPot(state.toCall);
    advanceStreet();
  }

  function onRaise() {
    chipClick();
    setTimeout(chipClick, 80);
    setTimeout(chipClick, 140);
    log('YOU', `raises to <em>${state.bet.toLocaleString()}</em>`);
    flyChips(5);
    addPot(state.bet);
    state.toCall = state.bet;
    advanceStreet();
  }

  // ----------------------------------------------------------------------
  //  STREET / DEAL ANIMATIONS
  // ----------------------------------------------------------------------
  function advanceStreet() {
    if (state.street === 'pre') {
      state.street = 'flop';
      setTimeout(() => dealCards(0, 3), 420);
    } else if (state.street === 'flop') {
      state.street = 'turn';
      setTimeout(() => dealCards(3, 4), 420);
    } else if (state.street === 'turn') {
      state.street = 'river';
      setTimeout(() => dealCards(4, 5), 420);
    } else if (state.street === 'river') {
      state.street = 'showdown';
      setTimeout(showdown, 600);
    }
  }

  function dealCards(from, to) {
    const slots = document.querySelectorAll('.board .card-slot');
    for (let i = from; i < to; i++) {
      setTimeout(() => {
        const slot = slots[i];
        if (!slot) return;
        const c = board[i];
        const card = document.createElement('div');
        card.className = `card ${c.color}`;
        card.style.animationDelay = `0s`;
        card.innerHTML = `
          <span class="rank">${c.rank}</span><span class="suit">${c.suit}</span>
          <span class="center">${c.suit}</span>
          <span class="corner-bl"><span class="rank">${c.rank}</span><span class="suit">${c.suit}</span></span>
        `;
        slot.replaceWith(card);
        cardFlip();
      }, (i - from) * 180);
    }
    setTimeout(() => log('DEALER', `deals the ${state.street}`), (to - from) * 200);
  }

  function showdown() {
    log('DEALER', 'showdown — <em>winner: YOU (pair of aces)</em>');
    const pot = state.pot;
    state.pot = 0;
    state.yourStack += pot;
    document.getElementById('pot-amount').textContent = '0';
    flashWin();
    setTimeout(() => {
      const cb = document.querySelector('.share-callout');
      if (cb) cb.animate(
        [{ transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,45,111,0)' },
         { transform: 'scale(1.03)', boxShadow: '0 0 50px -8px rgba(255,45,111,0.6)' },
         { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,45,111,0)' }],
        { duration: 1200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
      );
    }, 600);
  }

  function flashWin() {
    const felt = document.getElementById('felt');
    if (!felt) return;
    felt.animate(
      [
        { boxShadow: '0 0 0 6px var(--ink-3), 0 0 0 8px var(--gold-2), 0 0 0 12px var(--ink-2), 0 30px 80px -10px rgba(0,0,0,0.8)' },
        { boxShadow: '0 0 0 6px var(--ink-3), 0 0 0 8px var(--gold), 0 0 0 12px var(--ink-2), 0 0 120px rgba(230,180,80,0.45)' },
        { boxShadow: '0 0 0 6px var(--ink-3), 0 0 0 8px var(--gold-2), 0 0 0 12px var(--ink-2), 0 30px 80px -10px rgba(0,0,0,0.8)' },
      ],
      { duration: 1600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
  }

  // ----------------------------------------------------------------------
  //  POT / CHIPS / LOG
  // ----------------------------------------------------------------------
  function addPot(n) {
    state.pot += n;
    document.getElementById('pot-amount').textContent = state.pot.toLocaleString();
  }

  function flyChips(n) {
    const heroCards = document.querySelector('.hero-seat__cards');
    const pot = document.querySelector('.pot');
    if (!heroCards || !pot) return;
    const start = heroCards.getBoundingClientRect();
    const end = pot.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'chip-fly';
      const sx = start.left + start.width / 2 - 14;
      const sy = start.top - 10;
      const ex = end.left + end.width / 2 - 14 + (Math.random() * 12 - 6);
      const ey = end.top + 10 + (Math.random() * 8 - 4);
      c.style.left = sx + 'px';
      c.style.top = sy + 'px';
      document.body.appendChild(c);
      const dur = 520 + Math.random() * 180;
      c.animate(
        [
          { left: sx + 'px', top: sy + 'px', opacity: 0, transform: 'scale(0.5)' },
          { offset: 0.2, opacity: 1, transform: 'scale(1)' },
          { left: ex + 'px', top: ey + 'px', opacity: 1, transform: 'scale(0.85)' },
        ],
        { duration: dur, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
      );
      setTimeout(() => c.remove(), dur + 30);
    }
  }

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

  // ----------------------------------------------------------------------
  //  RAIL TABS
  // ----------------------------------------------------------------------
  document.querySelectorAll('.rail__tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.rail__tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // ----------------------------------------------------------------------
  //  ACTION TIMER on active opponent (cosmetic)
  // ----------------------------------------------------------------------
  const tag = document.querySelector('.seat--active .seat__action-tag');
  if (tag) {
    let s = 14;
    setInterval(() => {
      s = s > 0 ? s - 1 : 14;
      tag.textContent = `Thinking · 0:${String(s).padStart(2,'0')}`;
    }, 1000);
  }

})();
