# Uji browser halaman Game (opsional)

Menguji `GamePage.jsx` ASLI di Chromium sungguhan pada zoom 100%: tidak ada scroll/terpotong di 13 resolusi,
kursi/kartu tidak saling menimpa, klik Combo Detector, PLAY, SKIP, CLEAR, GROUP/UNGROUP, seleksi eksklusif,
posisi tombol GROUP, dan resize jendela. Socket/router/zustand diganti stub (lihat `*.js`); backend tidak ikut berjalan.

Kebutuhan: `esbuild`, `react`, `react-dom` (sudah ada di node_modules proyek setelah `npm install`) dan `pip install playwright`
+ `playwright install chromium` (atau set `CHROME_PATH`).

    cd frontend
    node tests/browser/build.cjs
    python3 tests/browser/e2e.py        # screenshot disimpan di tests/browser/shots (atau SHOT_DIR)
