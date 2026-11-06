'use strict';
/**
 * Uji konsistensi aturan kombinasi: backend (validator.js) vs frontend (comboDetector.js).
 * Memeriksa SEMUA kombinasi 1, 2, 3, dan 5 kartu dari 52 kartu (≈2,6 juta) dan memastikan
 * kedua sisi memberi hasil yang sama (single/pair/tris/subtype paketan atau tidak sah).
 *
 *   npm run test:combo      (dari folder backend, ±10 detik)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');

const { detectCombo: server, canBeat } = require('../src/game/validator');
const CLIENT_SRC = path.join(__dirname, '../../frontend/src/utils/comboDetector.js');

const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
const SUITS = ['D','C','H','S'];
const deck = RANKS.flatMap(r => SUITS.map(s => ({ rank: r, suit: s, id: r + s })));
const pick = (ids) => ids.map(id => deck.find(c => c.id === id));

const { pathToFileURL } = require('node:url');

(async () => {
  const tmp = path.join(os.tmpdir(), `martil-combo-${process.pid}.mjs`);
  fs.copyFileSync(CLIENT_SRC, tmp);

  const client = await import(pathToFileURL(tmp).href);

  fs.unlinkSync(tmp);
  const kind = (x) => (x ? (x.subtype || x.type) : null);

  // 1) Kasus yang dilaporkan: straight dengan 2 sebagai kartu rendah
  const named = {
    'A-2-3-4-5':       [['AS','2H','3D','4C','5S'], 'straight'],
    '2-3-4-5-6':       [['2S','3H','4D','5C','6S'], 'straight'],
    '7-8-9-10-J':      [['7S','8H','9D','10C','JS'], 'straight'],
    '10-J-Q-K-A':      [['10S','JH','QD','KC','AS'], 'straight'],
    'A-2-3-4-5 flush': [['AD','2D','3D','4D','5D'], 'straightflush'],
    '2-3-4-5-6 flush': [['2H','3H','4H','5H','6H'], 'straightflush'],
    'J-Q-K-A-2':       [['JS','QH','KD','AC','2S'], null],
    'Q-K-A-2-3':       [['QS','KH','AD','2C','3S'], null],
    'K-A-2-3-4':       [['KS','AH','2D','3C','4S'], null],
  };
  for (const [name, [ids, expected]] of Object.entries(named)) {
    const cards = pick(ids);
    assert.equal(kind(server(cards)), expected, `server: ${name}`);
    assert.equal(kind(client.detectCombo(cards)), expected, `klien: ${name}`);
  }
  console.log('  PASS  kasus straight bernama (server dan klien sama)');

  // 2) Tangan terurut 3…K-A-2: urutan kartu di tangan tidak boleh berubah
  const handOrder = client.sortHand(pick(['2S','AS','3D','KC','5H'])).map(c => c.rank).join(',');
  assert.equal(handOrder, '3,5,K,A,2');
  console.log('  PASS  sortHand tetap 3 < … < K < A < 2');

  // 3) Seluruh kombinasi
  let total = 0; const bad = []; const valid = [];   // valid: semua kombinasi sah (untuk uji canBeat)
  const check = (cards) => {
    total++;
    if (server(cards)) valid.push(cards);
    const a = kind(server(cards)), b = kind(client.detectCombo(cards));
    if (a !== b && bad.length < 10) bad.push(`${cards.map(c => c.id).join(' ')} → server=${a} klien=${b}`);
    else if (a !== b) bad.push(null);
  };
  const n = deck.length;
  for (let i = 0; i < n; i++) check([deck[i]]);
  for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++) check([deck[i], deck[j]]);
  for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++) for (let k = j+1; k < n; k++) check([deck[i], deck[j], deck[k]]);
  for (let a = 0; a < n; a++) for (let b = a+1; b < n; b++) for (let c = b+1; c < n; c++)
    for (let d = c+1; d < n; d++) for (let e = d+1; e < n; e++) check([deck[a], deck[b], deck[c], deck[d], deck[e]]);
  assert.equal(bad.length, 0, `${bad.length} kombinasi tidak konsisten, contoh:\n   ${bad.filter(Boolean).join('\n   ')}`);
  console.log(`  PASS  ${total.toLocaleString('id-ID')} kombinasi: server dan klien identik`);

  // 3b) canBeat: klien (dipakai tombol PLAY dan urutan Combo Detector) harus sama dengan server
  const byLen = (n) => valid.filter(c => c.length === n);
  let seedN = 987654321;
  const rnd = () => (seedN = (seedN * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const beat = (x, y) => [canBeat(server(x), server(y)), client.canBeat(client.detectCombo(x), client.detectCombo(y))];
  let pairsChecked = 0; const badBeat = [];
  const cmp = (x, y) => {
    pairsChecked++;
    const [a, b] = beat(x, y);
    if (a !== b && badBeat.length < 10) badBeat.push(`${x.map(c => c.id)} vs ${y.map(c => c.id)} → server=${a} klien=${b}`);
  };
  for (const n of [1, 2, 3]) { const L = byLen(n); for (const x of L) for (const y of L) cmp(x, y); }   // semua pasangan
  for (let i = 0; i < 400; i++) cmp(valid[Math.floor(rnd() * valid.length)], valid[Math.floor(rnd() * valid.length)]);   // lintas jenis
  const five = byLen(5);
  for (let i = 0; i < 300000; i++) cmp(five[Math.floor(rnd() * five.length)], five[Math.floor(rnd() * five.length)]);
  // sama subtype dan sama kartu penentu (selisih hanya kartu pendamping): tidak ada yang mengalahkan
  const fk = five.filter(c => server(c).subtype === 'fourofakind').slice(0, 200);
  for (const x of fk) for (const y of fk.slice(0, 20)) cmp(x, y);
  assert.equal(badBeat.length, 0, `canBeat tidak konsisten:\n   ${badBeat.join('\n   ')}`);
  console.log(`  PASS  canBeat: server dan klien identik pada ${pairsChecked.toLocaleString('id-ID')} pasangan (semua single/pair/tris + sampel paketan & lintas jenis)`);

  // 4) Urutan kekuatan straight: dinilai dari kartu paling kanan yang ditulis
  //    A-2-3-4-5 < 2-3-4-5-6 < 3-4-5-6-7 < … < 10-J-Q-K-A
  const seqs = [
    ['A','2','3','4','5'], ['2','3','4','5','6'], ['3','4','5','6','7'], ['4','5','6','7','8'],
    ['5','6','7','8','9'], ['6','7','8','9','10'], ['7','8','9','10','J'], ['8','9','10','J','Q'],
    ['9','10','J','Q','K'], ['10','J','Q','K','A'],
  ];
  const mixedSuits = ['S','H','D','C','S'];             // bukan flush
  const build = (seq, suits) => seq.map((r, i) => deck.find(c => c.rank === r && c.suit === suits[i % suits.length]));
  for (let i = 0; i < seqs.length; i++) {
    for (let j = i + 1; j < seqs.length; j++) {
      for (const [kind, suits] of [['straight', mixedSuits], ['straightflush', ['H']]]) {
        if (kind === 'straightflush' && j === seqs.length - 1 && seqs[j][0] === '10') continue; // 10-J-Q-K-A satu suit = royal flush
        const lo = server(build(seqs[i], suits)), hi = server(build(seqs[j], suits));
        assert.equal(lo.subtype, kind); assert.equal(hi.subtype, kind);
        assert.equal(canBeat(hi, lo), true,  `${seqs[j].join('-')} harus mengalahkan ${seqs[i].join('-')} (${kind})`);
        assert.equal(canBeat(lo, hi), false, `${seqs[i].join('-')} tidak boleh mengalahkan ${seqs[j].join('-')} (${kind})`);
      }
    }
  }
  // straight yang sama: kartu ujung kanan menentukan suit (♠ > ♥ > ♣ > ♦)
  const lowA = server(build(['A','2','3','4','5'], ['D','C','H','S','D']));   // ujung kanan 5♦
  const lowB = server(build(['A','2','3','4','5'], ['D','C','H','D','S']));   // ujung kanan 5♠
  assert.equal(lowA.highCard.id, '5D'); assert.equal(lowB.highCard.id, '5S');
  assert.equal(canBeat(lowB, lowA), true); assert.equal(canBeat(lowA, lowB), false);
  console.log('  PASS  urutan straight: A-2-3-4-5 < 2-3-4-5-6 < … < 10-J-Q-K-A (biasa dan straight flush)');

  // 5) Urutan tampil di meja: straight rendah ditulis A-2-3-4-5 / 2-3-4-5-6; yang lain tidak berubah
  const shown = (ids) => client.displayOrder(client.detectCombo(client.sortHand(pick(ids)))).map(c => c.rank).join('-');
  assert.equal(shown(['AS','2H','3D','4C','5S']), 'A-2-3-4-5');
  assert.equal(shown(['2S','3H','4D','5C','6S']), '2-3-4-5-6');
  assert.equal(shown(['AD','2D','3D','4D','5D']), 'A-2-3-4-5');          // straight flush
  assert.equal(shown(['2H','3H','4H','5H','6H']), '2-3-4-5-6');
  assert.equal(shown(['7S','8H','9D','10C','JS']), '7-8-9-10-J');
  assert.equal(shown(['10S','JH','QD','KC','AS']), '10-J-Q-K-A');
  assert.equal(shown(['3S','3H','3D','KC','KS']), '3-3-3-K-K');          // full house: tidak diubah
  assert.equal(shown(['2S']), '2');
  // server mengirim kartu dalam urutan tangan (3,4,5,A,2) — tampilannya yang diubah, bukan datanya
  const serverOrder = server(pick(['AS','2H','3D','4C','5S'])).cards.map(c => c.rank).join('-');
  assert.equal(serverOrder, '3-4-5-A-2');
  console.log('  PASS  tampilan meja: A-2-3-4-5 dan 2-3-4-5-6 ditulis berurutan, kombinasi lain tidak berubah');

  // 6) Sanity perbandingan di server (tidak diubah): straight tetap kalah dari flush, dst.
  const st = server(pick(['3S','4H','5D','6C','7S']));
  const fl = server(pick(['3S','5S','8S','JS','KS']));
  assert.equal(canBeat(fl, st), true);
  assert.equal(canBeat(st, fl), false);
  console.log('  PASS  urutan kekuatan paketan di server tidak berubah');
  console.log('\nSemua uji konsistensi combo lulus');
})().catch(e => { console.log('  FAIL ', e.message); process.exit(1); });
