/* ============================================
   Hyper Poker — Table interactions (prototype)
   - Fake hand state, but interactions feel real
   - Bet slider, presets, fold/call/raise actions
   - Deals flop/turn/river on call sequence
   - Web Audio synth for chip click + card flip
   ============================================ */

(() => {

  // ----------------------------------------------------------------------
  //  RENDER HERO HAND from data-cards on load
  // ----------------------------------------------------------------------
  const heroCardsEl = document.getElementById('hero-cards');
  if (heroCardsEl && window.HPCard) {
    const codes = (heroCardsEl.dataset.cards || 'Ah Ks').split(/\s+/).filter(Boolean);
    heroCardsEl.innerHTML = '';
    codes.forEach((code) => heroCardsEl.appendChild(HPCard.render(code)));
  }

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
    if (window.__hpSoundOn && !window.__hpSoundOn()) return;
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
    if (window.__hpSoundOn && !window.__hpSoundOn()) return;
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
    if (window.__hpSoundOn && !window.__hpSoundOn()) return;
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
    const slots = document.querySelectorAll('.board .card-slot, .board .card');
    const codeMap = { '♠':'s','♥':'h','♦':'d','♣':'c' };
    for (let i = from; i < to; i++) {
      setTimeout(() => {
        const slot = slots[i];
        if (!slot) return;
        const c = board[i];
        const code = c.rank + (codeMap[c.suit] || c.suit.toLowerCase());
        const card = window.HPCard ? HPCard.render(code) : (() => {
          const el = document.createElement('div');
          el.className = `card ${c.color}`;
          el.innerHTML = `<span class="rank">${c.rank}</span><span class="suit">${c.suit}</span><span class="center">${c.suit}</span><span class="corner-bl"><span class="rank">${c.rank}</span><span class="suit">${c.suit}</span></span>`;
          return el;
        })();
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
    rainConfetti();
    boom();
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
        [
          { transform: `translate(0, 0) rotate(0)`,                               opacity: 1 },
          { transform: `translate(${drift}px, ${window.innerHeight + 60}px) rotate(${rot}deg)`, opacity: 0.9 },
        ],
        { duration: dur, delay, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' }
      );
      setTimeout(() => c.remove(), dur + delay + 50);
    }
  }

  function boom() {
    if (window.__hpSoundOn && !window.__hpSoundOn()) return;
    // big bass thump on showdown win
    const ctx = ac();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.72);
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
  //  RAIL TABS — toggle active panel by data-tab
  // ----------------------------------------------------------------------
  document.querySelectorAll('.rail__tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.rail__tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.rail__body').forEach((body) => {
        body.style.display = body.dataset.tab === target ? '' : 'none';
        if (body.dataset.tab === 'chat' && target === 'chat') body.style.display = 'flex';
      });
    });
  });

  // ----------------------------------------------------------------------
  //  CHAT — send message
  // ----------------------------------------------------------------------
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const chatList = document.getElementById('chat-list');

  function sendChat() {
    if (!chatInput || !chatList) return;
    const text = chatInput.value.trim();
    if (!text) return;
    const isEmote = /^[\p{Extended_Pictographic}\s]+$/u.test(text);
    const row = document.createElement('div');
    row.className = 'chat-msg';
    row.innerHTML = `
      <div class="chat-msg__avatar" style="background: var(--ember); color: var(--ink);">YOU</div>
      <div class="chat-msg__body">
        <div class="chat-msg__name"><span class="me">YOU · just now</span></div>
        <div class="chat-msg__text ${isEmote ? 'emote' : ''}">${escapeHtml(text)}</div>
      </div>
    `;
    chatList.appendChild(row);
    chatList.scrollTop = chatList.scrollHeight;
    chatInput.value = '';
    chipClick();
  }
  function escapeHtml(s) {
    return s.replace(/[<>&"']/g, (c) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
  }
  if (chatSend) chatSend.addEventListener('click', sendChat);
  if (chatInput) chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  // ----------------------------------------------------------------------
  //  SETTINGS PANEL
  // ----------------------------------------------------------------------
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

  // load saved prefs
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
    document.body.dataset.soundOff = defaultPrefs.sound ? '' : '1';
    document.body.dataset.animOff  = defaultPrefs.anim  ? '' : '1';
  }
  applyPrefs();

  // expose pref check globally for sfx functions to gate themselves
  window.__hpSoundOn = () => defaultPrefs.sound !== false;

  // ----------------------------------------------------------------------
  //  AI TELL — opponent chip bobbing + time-pressure ring
  // ----------------------------------------------------------------------
  const activeSeat = document.querySelector('.seat--active');
  if (activeSeat) {
    let secs = 14;
    setInterval(() => {
      if (secs <= 5) activeSeat.classList.add('is-pressure');
      else activeSeat.classList.remove('is-pressure');
      secs = secs > 0 ? secs - 1 : 14;
    }, 1000);
  }

  // ----------------------------------------------------------------------
  //  EMOTE RAIL — bubble drifts up from your hero seat
  // ----------------------------------------------------------------------
  const emoteToggle = document.getElementById('emote-toggle');
  const emoteRail = document.getElementById('emote-rail');

  if (emoteToggle && emoteRail) {
    emoteToggle.addEventListener('click', () => {
      emoteRail.classList.toggle('is-open');
    });
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

    // tiny click sfx
    const ctx = ac();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 720;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.13);
  }

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
