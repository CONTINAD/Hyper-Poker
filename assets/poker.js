/* ============================================================
   Hyper Poker — core engine
   - Fisher-Yates shuffle (seedable for provably-fair demo)
   - Standard 52-card deck
   - 7-card hand evaluator (ranks pair → royal flush)
   - Bot AI: preflop range + simple postflop equity heuristic
   API:
     HPPoker.deck(seed?)              → string[52] (e.g. 'As')
     HPPoker.evaluate(cards7)         → { rank, name, kickers, code }
     HPPoker.compare(a, b)            → -1 | 0 | 1
     HPPoker.botAction(bot, ctx)      → { action, amount }
   ============================================================ */
(function (global) {
  // ----------------------------------------------------------------------
  //  RNG (xorshift32, seedable)
  // ----------------------------------------------------------------------
  function rngFromSeed(seed) {
    let s = (seed | 0) || 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 0xFFFFFFFF) / 0xFFFFFFFF;
    };
  }
  const defaultRng = Math.random;

  // ----------------------------------------------------------------------
  //  Deck
  // ----------------------------------------------------------------------
  const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const SUITS = ['s','h','d','c'];

  function freshDeck() {
    const out = [];
    for (const r of RANKS) for (const s of SUITS) out.push(r + s);
    return out;
  }

  function shuffle(arr, rng) {
    const r = rng || defaultRng;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function deck(seed) {
    const rng = seed != null ? rngFromSeed(seed) : defaultRng;
    return shuffle(freshDeck(), rng);
  }

  // ----------------------------------------------------------------------
  //  Hand evaluator
  // ----------------------------------------------------------------------
  const RANK_VAL = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
  const HAND_NAMES = [
    'High card','Pair','Two pair','Three of a kind','Straight',
    'Flush','Full house','Four of a kind','Straight flush','Royal flush',
  ];

  // returns { rank: 0-9, vals: number[], name: string }
  function evalFive(cards) {
    const vals = cards.map((c) => RANK_VAL[c[0]]).sort((a,b) => b - a);
    const suits = cards.map((c) => c[1]);
    const isFlush = suits.every((s) => s === suits[0]);

    // straight detection
    const sorted = [...new Set(vals)].sort((a,b) => b - a);
    let straightHigh = 0;
    if (sorted.length >= 5) {
      // standard
      for (let i = 0; i <= sorted.length - 5; i++) {
        if (sorted[i] - sorted[i+4] === 4) { straightHigh = sorted[i]; break; }
      }
      // wheel A-2-3-4-5
      if (!straightHigh && sorted.includes(14) && sorted.includes(5) && sorted.includes(4) && sorted.includes(3) && sorted.includes(2)) {
        straightHigh = 5;
      }
    }

    // count by rank
    const counts = {};
    vals.forEach((v) => counts[v] = (counts[v] || 0) + 1);
    const groups = Object.entries(counts).map(([v, c]) => [+v, c])
      .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const top = groups[0], second = groups[1] || [0,0];

    if (straightHigh && isFlush) {
      if (straightHigh === 14) return { rank: 9, vals: [14], name: 'Royal flush' };
      return { rank: 8, vals: [straightHigh], name: 'Straight flush' };
    }
    if (top[1] === 4) return { rank: 7, vals: [top[0], second[0]], name: 'Four of a kind' };
    if (top[1] === 3 && second[1] >= 2) return { rank: 6, vals: [top[0], second[0]], name: 'Full house' };
    if (isFlush) return { rank: 5, vals, name: 'Flush' };
    if (straightHigh) return { rank: 4, vals: [straightHigh], name: 'Straight' };
    if (top[1] === 3) return { rank: 3, vals: [top[0], ...vals.filter((v) => v !== top[0]).slice(0, 2)], name: 'Three of a kind' };
    if (top[1] === 2 && second[1] === 2) {
      const kicker = vals.find((v) => v !== top[0] && v !== second[0]);
      return { rank: 2, vals: [top[0], second[0], kicker], name: 'Two pair' };
    }
    if (top[1] === 2) return { rank: 1, vals: [top[0], ...vals.filter((v) => v !== top[0]).slice(0, 3)], name: 'Pair' };
    return { rank: 0, vals: vals.slice(0, 5), name: 'High card' };
  }

  // best 5 of N (5..7)
  function evaluate(cards) {
    if (cards.length < 5) return { rank: -1, vals: [], name: '—' };
    if (cards.length === 5) return evalFive(cards);
    let best = null;
    const N = cards.length;
    for (let a = 0; a < N - 4; a++)
      for (let b = a+1; b < N - 3; b++)
        for (let c = b+1; c < N - 2; c++)
          for (let d = c+1; d < N - 1; d++)
            for (let e = d+1; e < N; e++) {
              const r = evalFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);
              if (!best || compare(r, best) > 0) best = r;
            }
    return best;
  }

  function compare(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const len = Math.max(a.vals.length, b.vals.length);
    for (let i = 0; i < len; i++) {
      const av = a.vals[i] || 0, bv = b.vals[i] || 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  }

  // ----------------------------------------------------------------------
  //  Bot AI — preflop range + simple postflop heuristic
  // ----------------------------------------------------------------------
  // preflop "Chen formula"-ish: hand strength as a number 0-1
  function preflopStrength(hole) {
    const r1 = RANK_VAL[hole[0][0]];
    const r2 = RANK_VAL[hole[1][0]];
    const suited = hole[0][1] === hole[1][1];
    const pair = r1 === r2;
    const high = Math.max(r1, r2), low = Math.min(r1, r2);
    let score = (high * 0.6 + low * 0.4) / 14;
    if (pair) score += 0.2 + (high / 14) * 0.1;
    if (suited) score += 0.06;
    const gap = Math.abs(r1 - r2);
    if (!pair) {
      if (gap === 1) score += 0.04;
      else if (gap === 2) score += 0.02;
      else if (gap >= 5) score -= 0.05;
    }
    return Math.max(0, Math.min(1, score));
  }

  // very rough postflop strength using hand category as proxy
  // strength = made-hand rank / 9, plus draw bonus (handled outside via outs)
  function postStrength(hole, board) {
    const ev = evaluate([...hole, ...board]);
    let s = ev.rank / 9;
    // draw bonus (rough): count flush/straight outs
    const all = [...hole, ...board];
    const suitCount = {};
    all.forEach((c) => suitCount[c[1]] = (suitCount[c[1]] || 0) + 1);
    const flushDraw = Object.values(suitCount).some((n) => n === 4);
    if (flushDraw && ev.rank < 5) s += 0.15;
    const ranks = all.map((c) => RANK_VAL[c[0]]).sort((a,b) => a-b);
    let openEnded = false;
    for (let i = 0; i <= ranks.length - 4; i++) {
      const slice = ranks.slice(i, i+4);
      if (slice[3] - slice[0] === 3) { openEnded = true; break; }
    }
    if (openEnded && ev.rank < 4) s += 0.1;
    return Math.min(1, s);
  }

  /**
   * Pick a bot action.
   * @param bot  { id, style: 'tight'|'loose'|'gto'|'fish' }
   * @param ctx  { hole, board, toCall, pot, stack, minRaise, street }
   * @returns    { action: 'fold'|'check'|'call'|'raise', amount?: number }
   */
  function botAction(bot, ctx) {
    const { hole, board, toCall, pot, stack, minRaise, street } = ctx;
    const strength = street === 'pre'
      ? preflopStrength(hole)
      : postStrength(hole, board);

    // style modifiers
    const style = bot.style || 'gto';
    const modifiers = {
      tight: { foldThresh: 0.42, raiseThresh: 0.72, raiseFreq: 0.5  },
      loose: { foldThresh: 0.18, raiseThresh: 0.55, raiseFreq: 0.65 },
      gto:   { foldThresh: 0.32, raiseThresh: 0.62, raiseFreq: 0.55 },
      fish:  { foldThresh: 0.10, raiseThresh: 0.78, raiseFreq: 0.30 },
    }[style] || { foldThresh: 0.32, raiseThresh: 0.62, raiseFreq: 0.55 };

    // pot odds: when there's a bet to call
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    const equityNeeded = potOdds + 0.05; // a little fold-equity buffer
    const winProb = strength * 0.85 + 0.05; // crude conversion to chance to win

    // facing no bet → check or random raise
    if (toCall === 0) {
      if (strength > modifiers.raiseThresh && Math.random() < modifiers.raiseFreq) {
        return { action: 'raise', amount: clampRaise(Math.round(pot * (0.5 + Math.random() * 0.5)), minRaise, stack) };
      }
      return { action: 'check' };
    }

    // facing a bet → fold / call / raise
    if (winProb < equityNeeded || strength < modifiers.foldThresh) {
      return { action: 'fold' };
    }
    if (strength > modifiers.raiseThresh && Math.random() < modifiers.raiseFreq) {
      const target = Math.round((pot + toCall) * (0.6 + Math.random() * 0.6));
      return { action: 'raise', amount: clampRaise(target, Math.max(minRaise, toCall * 2), stack) };
    }
    return { action: 'call' };
  }

  function clampRaise(target, min, stack) {
    return Math.max(min, Math.min(stack, Math.round(target / 25) * 25));
  }

  // ----------------------------------------------------------------------
  //  Provably-fair seed util
  // ----------------------------------------------------------------------
  async function sha256(s) {
    if (!global.crypto || !global.crypto.subtle) {
      // fallback: simple FNV-1a hash
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h * 16777619) >>> 0;
      }
      return h.toString(16).padStart(8, '0').repeat(8);
    }
    const buf = new TextEncoder().encode(s);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  global.HPPoker = {
    freshDeck, shuffle, deck, evaluate, compare, botAction, sha256, RANK_VAL, HAND_NAMES,
  };
})(window);
