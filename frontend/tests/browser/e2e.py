import sys, os
from playwright.sync_api import sync_playwright
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import state, setup, FLUSH, card

CHROME = os.environ.get('CHROME_PATH')   # kosong = browser bawaan Playwright
passed = failed = 0
def check(name, cond, detail=''):
    global passed, failed
    if cond: passed += 1; print('  PASS ', name)
    else: failed += 1; print('  FAIL ', name, detail)

RECT = '''el => { const r = el.getBoundingClientRect(); return {l:r.left, t:r.top, r:r.right, b:r.bottom, w:r.width, h:r.height} }'''
def rect(page, sel): return page.eval_on_selector(sel, RECT)
def rects(page, sel): return page.eval_on_selector_all(sel, f'els => els.map({RECT})')
def inside(r, W, H, tol=1): return r['l'] >= -tol and r['t'] >= -tol and r['r'] <= W + tol and r['b'] <= H + tol
def overlap(a, b): return a['l'] < b['r'] and b['l'] < a['r'] and a['t'] < b['b'] and b['t'] < a['b']
def btn(page, text): return page.locator(f'button:text-is("{text}")')

VIEWPORTS = [(1366,650),(1366,768),(1280,620),(1440,760),(1536,730),(1920,950),(1920,1080),(2560,1300),(1024,600),(1024,768),(844,390),(390,780),(360,640)]

with sync_playwright() as p:
    b = p.chromium.launch(**({'executable_path': CHROME} if CHROME else {}), args=['--no-sandbox'])
    ctx = b.new_context(device_scale_factor=1)           # zoom 100%
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

    # ── 1. tata letak: tidak ada yang terpotong / bertumpuk pada zoom 100% ──
    for W, H in VIEWPORTS:
        setup(page, W, H, state(table=FLUSH, hand=['3C','4C','5D','6H','7D','8D','10C','10H','JD','KC','KH','AS','2C']))
        tag = f'{W}x{H}'
        sw = page.evaluate('[document.documentElement.scrollWidth, document.documentElement.scrollHeight]')
        check(f'{tag}: halaman tidak perlu scroll (tanpa zoom-out)', sw[0] <= W and sw[1] <= H, sw)
        hand = rects(page, '[data-testid="hand"] [data-card]')
        check(f'{tag}: 13 kartu tangan utuh di dalam layar', len(hand) == 13 and all(inside(c, W, H) for c in hand), [round(c['r']) for c in hand][-2:])
        sc = page.eval_on_selector('[data-testid="hand"]', 'el => { const s = el.parentElement; return [s.scrollWidth, s.clientWidth] }')
        check(f'{tag}: deretan kartu tanpa scroll horizontal', sc[0] <= sc[1] + 1, sc)
        for label in ['PLAY','SKIP','CLEAR']:
            r = btn(page, label).first.bounding_box()
            check(f'{tag}: tombol {label} utuh di dalam layar', r and inside({'l':r['x'],'t':r['y'],'r':r['x']+r['width'],'b':r['y']+r['height']}, W, H), r)
        seats = {s: rect(page, f'[data-seat="{s}"]') for s in ['left','top','right','me']}
        check(f'{tag}: semua kursi di dalam layar', all(inside(r, W, H) for r in seats.values()), {k: (round(v['l']), round(v['r'])) for k, v in seats.items()})
        tbl = rects(page, '[data-testid="table"] [data-card]')
        check(f'{tag}: kartu di meja tidak menimpa kursi pemain', not any(overlap(c, seats[s]) for c in tbl for s in ['left','top','right']))
        check(f'{tag}: kartu di meja tidak menimpa kartu tangan', not any(overlap(c, h) for c in tbl for h in hand))
        names = ['left','top','right']
        check(f'{tag}: kursi lawan tidak saling bertumpuk', not any(overlap(seats[a], seats[c]) for i, a in enumerate(names) for c in names[i+1:]))
        check(f'{tag}: kursi lawan tidak menimpa kartu tangan', not any(overlap(seats[s], h) for s in names for h in hand))
        if W >= 720:
            det = rects(page, '[data-testid="detector"] button')
            check(f'{tag}: Combo Detector tidak menimpa kursi lawan', not any(overlap(d, seats[s]) for d in det for s in names))
    check('tidak ada error JS di console', not errs, errs[:3])

    # ── 2. interaksi di browser asli (1366x650) ──
    HAND = ['3C','4C','5D','6H','7D','8D','10C','10H','JD','KC','KH','AS','2C']
    def fresh(**kw): setup(page, 1366, 650, state(**{'hand': HAND, **kw})); page.evaluate('window.__emits.length = 0')
    def raised(): return page.eval_on_selector_all('[data-testid="hand"] [data-card]', "els => els.filter(e => getComputedStyle(e).transform !== 'none' && new DOMMatrix(getComputedStyle(e).transform).m42 < -2).map(e => e.dataset.card)")
    def wait(): page.wait_for_timeout(260)

    fresh(); btn(page, 'Pair').click(); wait()
    r1 = sorted(raised()); check('Combo Detector: klik Pair mengangkat 2 kartu', len(r1) == 2, r1)
    btn(page, 'Pair 1/2').click() if page.locator('button:text-is("Pair 1/2")').count() else None; wait()
    r2 = sorted(raised()); check('Combo Detector: klik berulang berganti ke pair berikutnya', r2 != r1 and len(r2) == 2, (r1, r2))
    page.locator('button:text-matches("^Pair 2/2$")').click(); wait()
    check('Combo Detector: setelah alternatif terakhir kembali ke pertama', sorted(raised()) == r1)
    check('PLAY aktif untuk pair sah pada meja kosong', btn(page, 'PLAY').is_enabled())
    btn(page, 'PLAY').click(); wait()
    em = page.evaluate('window.__emits'); check('PLAY mengirim play_cards dengan kartu terpilih', len(em) == 1 and em[0][0] == 'play_cards' and sorted(em[0][1]['cardIds']) == r1, em)
    check('seleksi dibersihkan setelah PLAY', raised() == [])

    fresh(); btn(page, 'SKIP').click(); wait(); em = page.evaluate('window.__emits')
    check('SKIP mengirim skip_turn', len(em) == 1 and em[0][0] == 'skip_turn', em)

    fresh(); page.click('[data-card="5D"]'); wait(); check('klik kartu mengangkatnya', raised() == ['5D'])
    btn(page, 'CLEAR').click(); wait(); check('CLEAR membersihkan seleksi', raised() == [])

    # GROUP: muncul di atas seleksi, di tengah-tengah
    fresh(); page.click('[data-card="5D"]'); page.click('[data-card="7D"]'); wait()
    g = page.locator('button:text-is("GROUP")'); check('tombol GROUP muncul untuk 2 kartu dek utama', g.count() == 1)
    gb = g.bounding_box(); a = rect(page, '[data-card="5D"]'); c = rect(page, '[data-card="7D"]')
    center = (a['l'] + c['r']) / 2
    check('GROUP berada di tengah-tengah seleksi', abs((gb['x'] + gb['width'] / 2) - center) <= 3, (gb['x'] + gb['width'] / 2, center))
    check('GROUP berada tepat di atas kartu terpilih (tidak menimpa)', gb['y'] + gb['height'] <= min(a['t'], c['t']) + 1 and min(a['t'], c['t']) - (gb['y'] + gb['height']) < 16, (gb['y'] + gb['height'], a['t']))
    page.click('[data-card="8D"]'); wait(); check('tombol GROUP tetap satu dengan 3 kartu', page.locator('button:text-is("GROUP")').count() == 1)
    page.click('[data-card="8D"]'); wait()
    g.click(); wait()
    check('setelah GROUP: seleksi kosong, tombol GROUP hilang', raised() == [] and page.locator('button:text-is("GROUP")').count() == 0)
    deck = rects(page, '[data-testid="hand"] > div:first-child [data-card]'); grp = rects(page, '[data-group="0"] [data-card]')
    check('kartu grup di kanan dek utama, lebih kecil', len(grp) == 2 and min(x['l'] for x in grp) > max(x['r'] for x in deck) - 1 and grp[0]['h'] < deck[0]['h'] * 0.8, (grp[0]['h'], deck[0]['h']))
    gcol = page.eval_on_selector('[data-group="0"] [data-card]', "e => getComputedStyle(e).backgroundImage")
    check('kartu grup berwarna agak abu-abu', 'rgb(211, 217, 226)' in gcol or 'rgb(180, 189, 202)' in gcol, gcol)
    check('dek utama berkurang 2 kartu', len(deck) == 11)

    # pilih grup, UNGROUP
    page.click('[data-group="0"] [data-card]'); wait()
    check('klik grup mengangkat seluruh kartunya', sorted(raised()) == ['5D', '7D'], raised())
    ub = page.locator('button:text-is("UNGROUP")'); check('tombol UNGROUP muncul di atas grup', ub.count() == 1)
    ubb = ub.bounding_box(); gr = rects(page, '[data-group="0"] [data-card]')
    check('UNGROUP di atas grup dan di tengahnya', ubb['y'] + ubb['height'] <= min(x['t'] for x in gr) + 1 and abs(ubb['x'] + ubb['width'] / 2 - (min(x['l'] for x in gr) + max(x['r'] for x in gr)) / 2) <= 3)
    check('GROUP tidak muncul saat grup terpilih', page.locator('button:text-is("GROUP")').count() == 0)

    # eksklusif: dek -> grup, grup -> grup, grup -> dek
    fresh()
    for ids in (['3C','4C'], ['10C','10H']):
        for i in ids: page.click(f'[data-card="{i}"]')
        page.locator('button:text-is("GROUP")').click(); wait()
    page.click('[data-card="KC"]'); page.click('[data-card="KH"]'); wait()
    page.click('[data-group="0"] [data-card]'); wait()
    check('dek utama → klik grup: seleksi dek dibersihkan, hanya grup aktif', sorted(raised()) == ['3C', '4C'], raised())
    check('perpindahan sumber tidak memunculkan GROUP', page.locator('button:text-is("GROUP")').count() == 0)
    page.click('[data-group="1"] [data-card]'); wait(); check('Group A → Group B: A turun, B naik', sorted(raised()) == ['10C', '10H'], raised())
    page.click('[data-card="KC"]'); wait(); check('grup → dek utama: grup turun, dek aktif', raised() == ['KC'], raised())
    check('1 kartu dek: belum ada GROUP', page.locator('button:text-is("GROUP")').count() == 0)
    page.click('[data-card="KH"]'); wait(); check('≥2 kartu dek: GROUP muncul', page.locator('button:text-is("GROUP")').count() == 1)
    check('jumlah grup tetap 2 (tidak ada penggabungan otomatis)', page.locator('[data-group]').count() == 2)

    # umpan balik seleksi tidak menimpa kursi/kartu
    fresh(table=FLUSH); page.click('[data-card="3C"]'); page.click('[data-card="4C"]'); wait()
    hint = rect(page, '[data-testid="hint"]'); txt = page.inner_text('[data-testid="hint"]')
    check('umpan balik seleksi tampil (kombinasi tidak bisa mengalahkan meja)', 'mengalahkan meja' in txt or 'tidak valid' in txt, txt)
    check('umpan balik seleksi tidak menimpa kursi, kartu meja, maupun kartu tangan',
          not any(overlap(hint, r) for r in [rect(page, f'[data-seat="{s}"]') for s in ['left','top','right']] + rects(page, '[data-testid="table"] [data-card]') + rects(page, '[data-testid="hand"] [data-card]')))
    for W, H in [(1280,620),(844,390),(390,780)]:
        setup(page, W, H, state(table=FLUSH, hand=HAND, sel=['3C','4C'])); page.wait_for_timeout(200)
        h2 = rect(page, '[data-testid="hint"]')
        check(f'{W}x{H}: umpan balik seleksi utuh di layar dan tidak menimpa kartu meja/kursi', inside(h2, W, H) and not any(overlap(h2, r) for r in rects(page, '[data-testid="table"] [data-card]') + [rect(page, f'[data-seat="{s}"]') for s in ['left','top','right']]), h2)

    # Combo Detector bukan giliran
    fresh(turn='Player2623032'); btn(page, 'Pair').click(); wait()
    check('bukan giliran: detektor tetap memilih kartu', len(raised()) == 2); check('bukan giliran: PLAY & SKIP nonaktif', btn(page, 'PLAY').is_disabled() and btn(page, 'SKIP').is_disabled())

    # Combo Detector mengambil kartu dari grup
    fresh()
    for i in ('10C', '10H'): page.click(f'[data-card="{i}"]')
    page.locator('button:text-is("GROUP")').click(); wait(); btn(page, 'Pair').click(); wait()
    check('Combo Detector dapat memilih kartu yang berada di grup', any(c in raised() for c in ('10C', '10H')), raised())

    # ukuran viewport berubah: layout menyesuaikan tanpa reload
    fresh(); page.set_viewport_size({'width': 1920, 'height': 950}); page.wait_for_timeout(300)
    c1 = rect(page, '[data-testid="hand"] [data-card]')['w']; page.set_viewport_size({'width': 1280, 'height': 620}); page.wait_for_timeout(300)
    c2 = rect(page, '[data-testid="hand"] [data-card]')['w']; check('ukuran kartu menyesuaikan saat jendela diubah', c1 > c2 > 40, (c1, c2))
    check('tidak ada error JS selama interaksi', not errs, errs[:3])

    # ── 3. screenshot untuk laporan ──
    out = os.environ.get('SHOT_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots'))
    os.makedirs(out, exist_ok=True)
    def shot(name, W, H, **kw):
        setup(page, W, H, state(**{'table': FLUSH, 'hand': HAND, **kw}))
        return page
    shot('a', 1366, 650, sel=['5D','7D'])
    page.screenshot(path=f'{out}/1-desktop-1366x650-seleksi.png')
    shot('b', 1920, 950, turn='Player2623032'); page.screenshot(path=f'{out}/2-desktop-1920x950-giliran-lawan.png')
    shot('c', 1366, 650); 
    for ids in (['3C','4C'], ['10C','10H']):
        for i in ids: page.click(f'[data-card="{i}"]')
        page.locator('button:text-is("GROUP")').click(); page.wait_for_timeout(200)
    page.click('[data-group="1"] [data-card]'); page.wait_for_timeout(300); page.screenshot(path=f'{out}/3-desktop-1366x650-group-chain.png')
    shot('d', 390, 780, sel=['5D','6H']); page.screenshot(path=f'{out}/4-hp-portrait-390x780.png')
    shot('e', 844, 390); page.screenshot(path=f'{out}/5-hp-landscape-844x390.png')
    b.close()
print(f'\n{passed}/{passed + failed} lulus (browser)'); sys.exit(1 if failed else 0)
