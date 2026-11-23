# HANDOFF: Proyek Martil

Satu-satunya file status kerja. Diperbarui di setiap tahap (lewat patch docs yang sama dengan README), bukan dibuat ulang. Dokumentasi produk dan teknis ada di [README.md](README.md); jangan menyalinnya ke sini.

## Cap pembaruan

**Pembaruan terakhir:** tahap R1 (import tak terpakai), 2026-11-23, patch terakhir r1-0002

## Cara memakai file ini

Untuk chat baru, lampirkan ZIP proyek terbaru, lalu tempel tiga baris ini:

1. Baca `HANDOFF.md` dan `README.md` di ZIP. ZIP adalah satu-satunya sumber kebenaran; verifikasi ke kode.
2. Jalankan `npm test` dan cocokkan dengan bagian Baseline tes; laporkan selisih.
3. Ikuti bagian Tugas berikutnya.

## Konteks

Martil adalah game kartu multiplayer untuk tepat 4 pemain (backend Node.js, Express, Socket.IO, SQLite lewat `node:sqlite`, JWT; frontend React 18, Vite, Zustand). Homepage, Room, Game, dan Result adalah EMPAT keadaan berbeda; Homepage dan Room berbagi route `/lobby` dan komponen LobbyPage, dibedakan oleh ada/tidaknya `roomInfo`. Detailnya di [README.md](README.md).

## Cara kerja

- Penjelasan: Indonesia, santai, singkat. Kode, komentar, commit message: English.
- Audit/rencana singkat dulu, kerjakan setelah saya setuju. Kalau langkahnya sudah jelas, langsung kerjakan; jangan muter-muter.
- Satu patch per perubahan (`git apply -p1`) plus ZIP berkas yang berubah; patch dokumentasi dipisah dari patch kode. Verifikasi: patch bisa diterapkan berurutan di salinan bersih ZIP, hasilnya identik dengan tree yang diuji, bisa di-rollback, dan bisa diterapkan di tree CRLF dengan `--ignore-whitespace`.
- Tiap perubahan: tes otomatis baru + mutation check manual dengan skrip kecil di luar proyek (tiap mutan harus lolos `node --check` supaya tidak ada kill palsu karena syntax error; mutan ekuivalen dijelaskan, bukan dibiarkan). Jalankan tes lama dan baru, laporkan hasil sebelum dan sesudah.
- Jelaskan TERPISAH apa yang benar-benar teruji dan apa yang tidak (browser/React asli, Windows, Socket.IO asli, Express asli tidak ada di sandbox).
- Jangan lanjut ke tahap berikutnya sebelum saya memeriksa hasilnya.
- Jangan hapus atau lemahkan tes. Kalau spesifikasi berubah, ubah tesnya dan jelaskan persis baris mana dan kenapa. Bila menemukan bug di kode produksi saat menambah tes: laporkan dan tunggu keputusan saya, jangan diperbaiki diam-diam.
- Dokumentasi: `README.md` = dokumentasi utama (apa yang ada di kode dan cara memakainya; tanpa hasil tes atau instruksi kerja). `HANDOFF.md` = satu-satunya file status kerja. Jangan membuat file `.md` baru; tes `tools:docs` menegakkannya. Dokumentasi khusus hanya bila benar-benar perlu, dengan mengubah daftar izin di tes itu secara sengaja.
- README harus sesuai implementasi aktual. Jangan menulis versi Node sebagai "teruji" kalau belum diuji. Jangan tampilkan nilai rahasia. Database lokal dan `.env` tidak boleh ikut terunggah.

## Larangan

Kecuali saya minta eksplisit: jangan ubah aturan permainan, sistem giliran, Combo Detector, Group Chain, Host Kick, atau mekanisme reconnect. Jangan ubah ID internal pemain. Jangan tambah TypeScript. Jangan refactor besar sekaligus.

## Lingkungan

- Sandbox: Linux, Node v22.23.4, tanpa jaringan dan tanpa `node_modules` proyek (express, socket.io, jsonwebtoken, bcryptjs, jest TIDAK ada). `node:sqlite` asli tersedia. Jest dijalankan lewat shim kecil di luar proyek (Jest asli lulus di komputer saya).
- Tes render frontend: esbuild dan React ada di `/opt/npm-tools/node_modules`; jalankan dengan `NODE_PATH=/opt/npm-tools/node_modules`. React di sandbox 19.x, proyek memakai React 18, jadi hasil render sandbox belum membuktikan React 18: saya jalankan sendiri di komputer saya.
- Skrip bantu verifikasi (mutation, verifikasi patch, shim Jest) disimpan di luar proyek.
- Saya di Windows (Node v22.23.1), memasang patch lokal dan push setelah tiap langkah terverifikasi. Berkas yang saya ubah lokal: commit dulu, lalu `git apply --3way`. Bila akhir baris CRLF: `git apply --ignore-whitespace`.
- Perintah cek manual untuk PowerShell, bukan bash (here-string `@' ... '@ | node -` untuk skrip Node pendek). Suite berbasis bash di frontend: atur `MARTIL_BASH` bila `bash` di PATH adalah WSL.

## Posisi saat ini

Sudah diterapkan di ZIP terbaru: patch 0001-0011, h6-0001/0002, h7-0001/0002, h7fix-0001..0006, s1-0001..0003, a1-0001..0004, h8-0001/0002, r3-0001/0002, r3fix-0001, s8-0001/0002, s9-0001/0002, s2-0001/0002, d1-0001/0002.

Dikirim dan MENUNGGU VERIFIKASI SAYA (sunting baris ini bila sudah diterapkan): s3-0001/0002/0003 (konstanta Room/game satu definisi di backend + penjaga drift frontend; s3-0003 menyelaraskan status S2 dan D1 di HANDOFF.md), r1-0001/0002 (penjaga import tak terpakai, suite `tools:imports`; dipasang SETELAH s3-0001 karena ikut memeriksa backend).

| Item | Status |
|---|---|
| H1-H7 (validasi cardIds, guard payload, timer, jeda antar-game, maxGames 3/4/5, satu akun satu Room, pesan error server di UI) | SELESAI |
| H8 higiene konfigurasi (`JWT_SECRET` fail-fast di production, `.env.example`) | SELESAI |
| R3 log `[rally-debug]` di engine opsional (`MARTIL_DEBUG`) | SELESAI |
| r3fix flaky `intermission.sim` (jam dibekukan saat jeda berakhir) | SELESAI |
| S1 helper nama pemain | SELESAI |
| S8 skema DB berversi + `bootDatabase()` menutup Room basi saat start | SELESAI |
| S9 `npm test` terpadu + harness SQLite asli di memori + `db-persistence.sim.js` | SELESAI |
| S2 normalisasi kode Room (semua event berkode menerima huruf besar/kecil) | SELESAI |
| D1 perapian dokumentasi (satu README utama, satu HANDOFF.md, tes `tools:docs`) | SELESAI |
| S3 konstanta bersama: backend satu definisi (`backend/src/constants.js`), frontend dijaga tes (tidak diubah) | dikirim, menunggu verifikasi |
| S3b frontend memakai satu modul konstanta (menggantikan literal; butuh ubah enam harness tes frontend yang membangun berkas satu per satu) | belum |
| S4 kurangi state ganda di store (`currentTurn`, `roomCode`, `roomInfo.game` vs `gameState`, events sebagai bus) | belum |
| S5 pecah LobbyPage jadi HomeView dan RoomView (route tetap `/lobby`) | belum |
| S6 pisahkan tanggung jawab backend bertahap (timer, akses DB, payload) | belum |
| S7 rapikan event (`player_joined` mati, `kick_done` tak didengar, error ganda, `join_room` menyiarkan state satu pemain) | belum |
| R1 import/ekspor tak terpakai: import dibersihkan dan dijaga tes `tools:imports`; ekspor tidak diubah (lihat Temuan terbuka) | dikirim, menunggu verifikasi |
| R2 selector pada `useGameStore()` | belum |
| R4 dependency/berkas (`ioredis`, `martil: file:..`, field `engines`, `trace-sockets.js`, folder `Patch/`) | belum |
| R5 minor (cabang `!next` engine, auth/me, register race 409, `emitPrivateStates` O(n), logout tidak kirim `leave_room`) | belum |

## Roadmap fitur

Spesifikasi lengkap ada di [README.md](README.md#-keterbatasan-dan-rencana). Status kerja:

| Item | Status |
|---|---|
| A posisi kursi berlawanan arah jarum jam | SELESAI |
| B profil pemain | SEBAGIAN: nama asli tampil. Belum: avatar, level, info profil, username unik case-insensitive |
| C wallet virtual (saldo awal 20.000; saldo berubah HANYA setelah set selesai) | belum |
| D validasi saldo Room di backend | belum |
| E arsitektur Wallet modular, terpisah dari Game Engine, idempoten | belum |

Catatan teknis untuk C-E dan username: migrasi skema tinggal menambah fungsi baru di array `MIGRATIONS` (`backend/src/db/database.js`, versi 2 dan seterusnya), tiap migrasi dalam transaksi. Harness tes memakai SQLite asli, jadi tes wallet bisa langsung menguji SQL sungguhan. Username unik case-insensitive butuh keputusan soal data lama yang namanya hanya beda huruf besar/kecil.

## Keputusan final

- Nominal Room menskalakan perubahan saldo: Room 5K = +5K/+3K/-3K/-5K, Room 10K = +10K/+6K/-6K/-10K.
- Jumlah game per set hanya 3, 4, atau 5.
- Username nantinya unik dan case-insensitive.
- Host dipertahankan selama masa tunggu reconnect 60 dtk; pindah hanya bila Host benar-benar keluar atau masa tunggu habis; Host yang digeser saat game berjalan mendapat peran kembali saat reconnect.
- Tombol Kick sudah dihapus dari halaman Result; Kick hanya di Room.
- `NODE_ENV` tidak diset = development (`JWT_SECRET` kosong hanya warning); fail-fast hanya bila `NODE_ENV=production`. Panjang minimum secret hanya rekomendasi di README, tidak dipaksa di kode.
- Flag log debug engine: `MARTIL_DEBUG`, menyala hanya untuk `1` atau `true`.
- Saat boot, Room `waiting`/`playing` di DB menjadi `closed` (tanpa status baru); Room `done` dan `sets.ended_at` dibiarkan. DB dengan versi skema lebih baru dari kode menghentikan server (exit 1, satu baris `[db] FATAL: ...`).
- `npm test` di root adalah runner terpadu (backend `npm test` = suite backend; Jest sendiri lewat `npm run test:jest`). Suite berbasis bash dijalankan lewat bash bila ada (atau `MARTIL_BASH`), selain itu SKIP dengan pesan jelas; porting ke Node ditunda. SKIP tidak membuat exit code gagal kecuali `--strict`.
- Semua event Socket.IO yang membawa `roomCode` menerima huruf besar/kecil (di-uppercase tanpa trim); frontend tidak diubah.
- Konstanta Room/game (4 pemain, kode 6 karakter, pilihan game 3/4/5 dengan default 4, timer giliran 30 dtk) didefinisikan sekali di `backend/src/constants.js`; nama kode error `NEED_4_PLAYERS` tetap (bagian protokol klien). Frontend belum memakai modul bersama (harness tesnya membangun berkas satu per satu): `backend/tests/constants.sim.js` membaca literal di `frontend/src` dan gagal bila berbeda dari backend atau polanya hilang. Aturan validasi kode di UI Join (`code.length < 4`) sengaja tidak diubah.
- Dokumentasi: README utama, satu HANDOFF.md, folder `Patch/` tidak disentuh sebelum R4, `frontend/tests/browser/README.md` dipertahankan.

## Belum diputuskan

JANGAN diasumsikan atau diimplementasikan: peringkat seri (poin sama); perlakuan set yang tidak selesai (`sets.ended_at` NULL sengaja dibiarkan); apakah server juga membatasi Kick hanya saat Room menunggu (server masih menerima Kick mode Result); env var untuk masa tunggu reconnect (usulan, belum diminta); celah tes `kick-ui` (label tombol "Back to Room" tidak terdeteksi bila diganti); aturan skip saat meja kosong; kewajiban membuka game 1 dengan 3♠. Dua yang pertama menahan wallet (C-E).

## Temuan terbuka

Sudah dilaporkan, BELUM dikerjakan; tunggu keputusan saya:

- `generateCode()` hanya mengecek Room di memori, sedangkan `rooms.code` UNIQUE di DB bertahan melewati restart dan Room tertutup. Tabrakan sangat jarang, tetapi bila terjadi `INSERT` melempar error setelah Room sudah masuk memori (kandidat S6/R5 atau fase sebelum online).
- `PORT` dan `CLIENT_URL` jatuh ke nilai localhost bila kosong, juga di production; `frontend/.env.example` (`VITE_SERVER_URL`) belum ada (fase sebelum online; ada di checklist README).
- `auth/routes.js` (login, register, me) belum punya tes sama sekali (butuh express/bcryptjs; kandidat R5).
- Tabel `room_players` dibuat tetapi tidak dipakai server.
- State Room hidup di memori dan hilang saat server restart (fase sebelum online).
- Validasi join di frontend memakai `code.length < 4`, tidak konsisten dengan kode Room 6 karakter. Mengubahnya mengubah perilaku UI (pesan lokal vs `ROOM_NOT_FOUND` dari server), jadi menunggu keputusan saya; kandidat S3b.
- Folder `Patch/` tidak lengkap (berhenti di s1) dan riwayat sebenarnya ada di git: pindahkan ke luar repo atau hapus (keputusan di R4).
- `import React` tidak dipakai secara eksplisit di 9 berkas frontend, tetapi sengaja dipertahankan: Vite memakai runtime JSX otomatis, sedangkan harness render (`combo-ui`, `kick-ui`, `lobby-ui`) mengompilasi dengan `jsx: 'transform'` dan butuh `React` di scope. Pengecualiannya tertulis (dengan alasan) di `ALLOWED_UNUSED` pada `scripts/imports-check.test.mjs`.
- Ekspor yang tidak diimpor berkas `src` lain hampir semuanya dipakai internal atau oleh tes, jadi dibiarkan. Satu-satunya yang mati total: `SUIT_SYMBOL` di `backend/src/game/deck.js` (diekspor, tidak dipakai di mana pun); tidak diubah karena itu berkas permainan, tunggu keputusan saya.

## Baseline tes

Satu perintah dari root: `npm test`. Angka yang diharapkan setelah r1:

- Sandbox: 29 suite, 28 PASS + 1 SKIP (`backend:jest`), 475 tes terhitung.
- Komputer saya (dengan `npm install` dan bash): tanpa SKIP; `backend:config-jwt` 21 (satu tes round trip `jsonwebtoken` asli ikut jalan) dan Jest 3, jadi sekitar 479.

Per suite. Backend: reconnect 16, room-navigation 17, kick 23, combo (lulus, tanpa hitungan), card-ids 16, payload-guards 10, turn-timer 8, intermission 12, max-games 9, single-room 14, profiles 16, host-retention 20, config-jwt 20 (+1 di komputer saya), debug-log 10, db-schema 20, db-persistence 12, room-code-case 12, constants 16, Jest 3 (`engine.test.js`). Frontend: sync 37, server-errors 8, player-names 12, combo-ui 48 + 26 (render) = 74, kick-ui 5 + 16 (render) = 21, lobby-ui 10 (render), game-ui 17. Alat: `tools:runner` 20, `tools:docs` 13, `tools:imports` 12.

`npm test -- --strict` menganggap SKIP sebagai gagal.

## Tugas berikutnya

Mulai dengan: (1) baca `HANDOFF.md`, `README.md`, dan kode di ZIP, (2) jalankan `npm test` dan cocokkan dengan Baseline tes, (3) usulkan item berikutnya dengan audit read-only singkat dan tunggu persetujuan saya sebelum mengubah kode.

Kandidat tanpa keputusan aturan: S3b (frontend memakai modul konstanta bersama), username case-insensitive (butuh keputusan data lama), R2. Wallet (C-E) menunggu keputusan peringkat seri dan set yang tidak selesai: jangan diasumsikan, tanyakan.
