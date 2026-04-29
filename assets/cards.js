/* ============================================
   Hyper Poker — card factory + face-card SVG art
   Number cards 2-10 use pip layouts at absolute %.
   A uses an oversized centerpiece glyph.
   K/Q/J get a stylized SVG ornament + bold letter.
   API: HPCard.render(card) → HTMLDivElement
   ============================================ */

(function (global) {
  const SUIT_GLYPH = { h: '♥', d: '♦', c: '♣', s: '♠' };
  const RED_SUITS = new Set(['h', 'd']);

  // Each entry: array of [x%, y%] within the card "body" (corner→corner).
  // y > 50 means lower half — we flip those pips upside-down so the suit
  // faces the bottom-half corner index, like real playing cards.
  const PIPS = {
    2:  [[50,18],[50,82]],
    3:  [[50,18],[50,50],[50,82]],
    4:  [[28,18],[72,18],[28,82],[72,82]],
    5:  [[28,18],[72,18],[50,50],[28,82],[72,82]],
    6:  [[28,18],[72,18],[28,50],[72,50],[28,82],[72,82]],
    7:  [[28,18],[72,18],[50,32],[28,50],[72,50],[28,82],[72,82]],
    8:  [[28,18],[72,18],[50,32],[28,50],[72,50],[50,68],[28,82],[72,82]],
    9:  [[28,16],[72,16],[28,38],[72,38],[50,50],[28,62],[72,62],[28,84],[72,84]],
    10: [[28,16],[72,16],[50,28],[28,40],[72,40],[28,60],[72,60],[50,72],[28,84],[72,84]],
  };

  // ----- face-card ornaments --------------------------------------------
  function faceArtSvg(rank, colorClass) {
    const stroke = colorClass === 'red' ? '#7A0E1F' : '#2A1A18';
    const fill   = colorClass === 'red' ? '#7A0E1F' : '#2A1A18';
    if (rank === 'K') {
      return `
        <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
          <g stroke="${stroke}" stroke-width="2" stroke-linejoin="round" fill="${fill}" opacity="0.85">
            <path d="M14 30 L22 14 L32 24 L40 10 L48 24 L58 14 L66 30 L66 52 L14 52 Z"/>
            <rect x="14" y="52" width="52" height="5"/>
          </g>
          <g fill="#fff4d6" stroke="${stroke}" stroke-width="1.2">
            <circle cx="22" cy="14" r="2.6"/>
            <circle cx="40" cy="10" r="3"/>
            <circle cx="58" cy="14" r="2.6"/>
          </g>
          <g stroke="${stroke}" stroke-width="1.4" fill="none" stroke-linecap="round">
            <path d="M22 62 L58 62 M28 68 L52 68"/>
          </g>
        </svg>`;
    }
    if (rank === 'Q') {
      return `
        <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
          <g stroke="${stroke}" stroke-width="1.6" fill="none" stroke-linecap="round">
            <path d="M14 30 Q40 8 66 30"/>
            <path d="M16 32 Q40 22 64 32"/>
          </g>
          <g fill="${fill}" stroke="${stroke}" stroke-width="1.2">
            <circle cx="40" cy="16" r="3"/>
            <circle cx="22" cy="24" r="2.2"/>
            <circle cx="58" cy="24" r="2.2"/>
          </g>
          <g stroke="${stroke}" stroke-width="1.2" fill="${fill}" opacity="0.85">
            <path d="M22 42 Q40 34 58 42 Q40 50 22 42 Z"/>
            <path d="M28 56 Q40 50 52 56 Q40 62 28 56 Z" opacity="0.7"/>
          </g>
          <g stroke="${stroke}" stroke-width="1.2" fill="none">
            <path d="M36 70 L44 70"/>
          </g>
        </svg>`;
    }
    if (rank === 'J') {
      return `
        <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
          <g stroke="${stroke}" stroke-width="1.4" fill="${fill}" opacity="0.85">
            <path d="M40 10 L32 18 L24 14 L26 26 L18 30 L28 34 L24 42 L34 38 L40 48 L46 38 L56 42 L52 34 L62 30 L54 26 L56 14 L48 18 Z"/>
          </g>
          <g stroke="${stroke}" stroke-width="1.2" fill="none" stroke-linejoin="round" stroke-linecap="round">
            <path d="M26 58 Q40 66 54 58"/>
            <path d="M30 62 L36 68 M44 68 L50 62"/>
          </g>
          <g fill="${fill}">
            <circle cx="34" cy="60" r="1.6"/>
            <circle cx="46" cy="60" r="1.6"/>
          </g>
        </svg>`;
    }
    return '';
  }

  // ----- pip cluster html ----------------------------------------------
  function pipsHtml(rank, glyph) {
    const layout = PIPS[rank];
    if (!layout) return '';
    return layout.map(([x, y]) => {
      const flip = y > 55 ? 'flip' : '';
      return `<span class="pip ${flip}" style="left:${x}%; top:${y}%;">${glyph}</span>`;
    }).join('');
  }

  // ----- main render ----------------------------------------------------
  function render(card) {
    let rank, suit;
    if (typeof card === 'string') {
      const c = card.replace('10', 'T');
      rank = c[0] === 'T' ? '10' : c[0];
      suit = c.slice(-1).toLowerCase();
    } else {
      rank = String(card.rank);
      suit = String(card.suit).toLowerCase();
    }
    if (rank === 'T') rank = '10';

    const isRed = RED_SUITS.has(suit);
    const colorClass = isRed ? 'red' : 'black';
    const glyph = SUIT_GLYPH[suit] || suit;

    const el = document.createElement('div');
    el.className = `card ${colorClass}`;
    el.dataset.suit = suit;
    el.dataset.rank = rank;

    let body = `<span class="rank">${rank}</span><span class="suit">${glyph}</span>`;

    if (rank === 'A') {
      body += `<span class="ace-pip">${glyph}</span>`;
    } else if (['K','Q','J'].includes(rank)) {
      body += `<span class="face-art">${faceArtSvg(rank, colorClass)}</span>`;
      body += `<span class="face-letter">${rank}</span>`;
    } else {
      body += `<span class="pip-cluster">${pipsHtml(rank, glyph)}</span>`;
    }

    body += `<span class="corner-bl"><span class="rank">${rank}</span><span class="suit">${glyph}</span></span>`;
    el.innerHTML = body;
    return el;
  }

  global.HPCard = { render };
})(window);
