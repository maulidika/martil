# HANDOFF: Proyek Martil

Satu-satunya file status kerja. Diperbarui di setiap tahap (lewat patch docs yang sama dengan README), bukan dibuat ulang. Dokumentasi produk dan teknis ada di [README.md](README.md); jangan menyalinnya ke sini.

## Cap pembaruan

**Pembaruan terakhir:** tahap S7 (rapikan event), 2026-11-26, patch terakhir s7-0003

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

Dikirim dan MENUNGGU VERIFIKASI SAYA (sunting baris ini bila sudah diterapkan): s3-0001/0002/0003 (konstanta Room/game satu definisi di backend + penjaga drift frontend; s3-0003 menyelaraskan status S2 dan D1 di HANDOFF.md), r1-0001/0002 (penjaga import tak terpakai, suite `tools:imports`; dipasang SETELAH s3-0001 karena ikut memeriksa backend), r2-0001/0002 (`useSocket` hanya berlangganan `token`, suite `frontend:store-selectors`; dipasang SETELAH r1), r4-0001/0002 (`ioredis` dan `martil: file:..` dihapus, `engines.node` 22.x, suite `tools:deps`; mengubah `package.json` dan kedua lockfile), s4-0001/0002 (dua salinan `currentTurn` dijaga konsisten, suite `frontend:store-invariants`; S4 baru sebagian), s5-0001/0002 (`LobbyPage` dipecah jadi `HomeView` dan `RoomView`, suite `frontend:lobby-views`; mengubah tiga tes lama, lihat Temuan terbuka), s6-0001/0002 (semua SQL Room/Set/Game pindah ke `db/roomStore.js`, suite `backend:room-store`), s6-0003 sampai 0006 (timer dan alur game pindah ke `socket/gameFlow.js`, bentuk payload keluar ke `socket/outgoing.js`, SQL users ke `db/userStore.js`; suite `backend:game-flow`, `backend:outgoing`, `backend:auth-routes`), s7-0001 sampai 0003 (`join_room` tidak lagi menyiarkan pandangan pendatang ke seluruh Room, listener `player_joined` yang mati dihapus; suites `backend:join-events` dan `tools:events`; mengubah satu baris tes lama, lihat Temuan terbuka).

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
| S4 kurangi state ganda di store (`currentTurn`, `roomCode`, `roomInfo.game` vs `gameState`, events sebagai bus) | SEBAGIAN: dua salinan `currentTurn` dijaga konsisten dan dijaga tes `frontend:store-invariants` (dikirim, menunggu verifikasi); sisanya lihat Temuan terbuka |
| S5 pecah LobbyPage jadi HomeView dan RoomView (route tetap `/lobby`) | dikirim, menunggu verifikasi |
| S6 pisahkan tanggung jawab backend bertahap (timer, akses DB, payload) | dikirim, menunggu verifikasi (akses DB Room/Set/Game dan users, timer dan alur game, bentuk payload keluar) |
| S7 rapikan event (`player_joined` mati, `kick_done` tak didengar, error ganda, `join_room` menyiarkan state satu pemain) | dikirim, menunggu verifikasi: `player_joined` dan `join_room` dikerjakan; `kick_done` dan kanal error ganda sengaja dipertahankan (lihat Temuan terbuka) |
| R1 import/ekspor tak terpakai: import dibersihkan dan dijaga tes `tools:imports`; ekspor tidak diubah (lihat Temuan terbuka) | dikirim, menunggu verifikasi |
| R2 selector pada `useGameStore()`: `useSocket` hanya berlangganan `token`, dua field mati dihapus, dijaga tes `frontend:store-selectors`; tiga halaman tetap membaca seluruh store (lihat Temuan terbuka) | dikirim, menunggu verifikasi |
| R4 dependency/berkas: `ioredis` dan `martil: file:..` dihapus (lockfile ikut), `engines.node` 22.x di root dan backend, dijaga tes `tools:deps`; `trace-sockets.js` dipertahankan; folder `Patch/` tidak ada di ZIP (lihat Temuan terbuka) | dikirim, menunggu verifikasi |
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
- Dokumentasi: README utama, satu HANDOFF.md, folder `Patch/` tidak ada di ZIP terbaru dan tidak disentuh, `frontend/tests/browser/README.md` dipertahankan.

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
- Folder `Patch/` tidak ada di ZIP terbaru, jadi R4 tidak menyentuhnya. Bila masih ada di working tree lokal (dulu berhenti di s1; riwayat sebenarnya ada di git), memindahkannya ke luar repo atau menghapusnya adalah keputusan saya.
- `frontend/trace-sockets.js` dipertahankan di `frontend/`: skrip manual itu me-resolve `socket.io-client` dari `frontend/node_modules`, dan memindahkannya ke `scripts/` butuh keputusan dependency.
- Lockfile backend dan frontend diregenerasi dengan `npm install --package-lock-only --offline` (npm 10.9.9 di sandbox), lalu entri `..` sisa tautan `martil` dihapus; hasilnya stabil di npm dan lolos `npm ci --dry-run --offline`. Belum diuji: `npm install`/`npm ci` asli dengan jaringan, dan di Windows.
- `import React` tidak dipakai secara eksplisit di 9 berkas frontend, tetapi sengaja dipertahankan: Vite memakai runtime JSX otomatis, sedangkan harness render (`combo-ui`, `kick-ui`, `lobby-ui`) mengompilasi dengan `jsx: 'transform'` dan butuh `React` di scope. Pengecualiannya tertulis (dengan alasan) di `ALLOWED_UNUSED` pada `scripts/imports-check.test.mjs`.
- Ekspor yang tidak diimpor berkas `src` lain hampir semuanya dipakai internal atau oleh tes, jadi dibiarkan. Satu-satunya yang mati total: `SUIT_SYMBOL` di `backend/src/game/deck.js` (diekspor, tidak dipakai di mana pun); tidak diubah karena itu berkas permainan, tunggu keputusan saya.
- `GamePage`, `LobbyPage`, dan `ResultPage` masih memanggil `useGameStore()` tanpa selector (tercatat di `ALLOWED_WHOLE_STORE` pada `frontend/tests/store-selectors/run.mjs`): masing-masing memakai hampir semua field-nya, dan tiga harness render (`combo-ui`, `kick-ui`, `lobby-ui`) men-stub zustand dengan `useStore = () => state` yang mengabaikan selector, jadi memindahkannya berarti mengubah tiga baris tes lama. Manfaat re-render tidak terukur di sandbox (tanpa browser dan React 18), dan zustand asli tidak ada di sandbox.
- S4 baru sebagian. `setCurrentTurn` kini ikut memperbarui `gameState.currentTurn` (sebelumnya basi setelah `turn_changed`, tetapi tidak ada kode yang membacanya; yang dibaca UI adalah `currentTurn` level atas). Belum dikerjakan: menghapus `currentTurn` level atas atau `roomCode`, karena itu mengubah 23 assertion di `frontend/tests/sync.sim/run.mjs` dan state di harness `combo-ui`, `kick-ui`, `lobby-ui`, `game-ui`. `roomCode` dan `roomInfo.code` memang bisa berbeda sementara (`room_created` tiba sebelum `room_updated`; guard `myRoom` di `LobbyPage` memakainya), jadi bukan duplikasi murni. `roomInfo.game` hanya dibaca keberadaannya (`LobbyPage`).
- `events` dipakai sebagai bus dengan pola `events[0]?._id` di `GamePage`, `LobbyPage`, dan `ResultPage`: efek hanya melihat event terbaru. Bila dua `pushEvent` jatuh dalam satu batch render React, yang lebih awal tidak terlihat oleh efek. Belum terbukti terjadi (sandbox tanpa browser dan React 18); perbaikannya (antrean atau kursor) mengubah perilaku, jadi menunggu keputusan saya.
- S5: `HomeView`, `RoomView`, dan `lobbyStyles` ada di `frontend/src/components/`. Keduanya murni tampilan: state (`maxGames`, `joinInput`, `kickTarget`, `exiting`), efek, socket, validasi, dan modal Kick tetap di `LobbyPage`, sehingga pilihan jumlah game dan teks kode tidak ikut reset saat pindah antara Homepage dan Room. `MAX_GAMES_OPTIONS` dan `useState(4)` tetap di `LobbyPage`. Markup dibandingkan dengan versi lama di 14 state (sandbox): HTML identik.
- S5 mengubah tiga tes lama, hanya menambah cakupan dan tanpa melonggarkan assertion: `frontend/tests/lobby-ui/render.mjs` dan `frontend/tests/kick-ui/render.mjs` (tiga berkas baru masuk daftar build, dan aturan penulisan ulang import `./` ditambahkan pada fungsi `map`), serta `backend/tests/constants.sim.js` (guard drift kini membaca `LobbyPage.jsx`, `HomeView.jsx`, dan `RoomView.jsx` sekaligus, dengan pola dan jumlah minimum yang sama).
- S6 (akses DB): semua SQL penyimpanan Room/Set/Game (9 pernyataan yang dulu inline di `rooms/roomManager.js`) pindah ke `backend/src/db/roomStore.js` dan semua SQL tabel users (dulu inline di `auth/routes.js`) ke `backend/src/db/userStore.js`, dengan pernyataan dan urutan argumen yang sama. Tes `backend:room-store` menjaga lokasi SQL: `.prepare(` hanya di `db/database.js`, `db/roomStore.js`, dan `db/userStore.js`; `roomManager.js`, `socketHandler.js`, dan `auth/routes.js` tidak memuat SQL.
- S6 (timer): `socketHandler.js` (451 menjadi 332 baris) tidak lagi memakai timer. Timer giliran, jeda 5 detik antar-game (`INTERMISSION_MS`; `helpers/sim.js` mempercepat tepat nilai 5000), game over, state privat per pemain, dan sweeper berkala pindah ke `socket/gameFlow.js` dengan perilaku yang sama; `debugLog` pindah ke `socket/debugLog.js`. `pendingTimerCount()` diekspor hanya supaya tes bisa memeriksa tabel timer. Tabel `timers` tetap di level modul (satu timer per kode Room, dipakai bersama seperti sebelumnya).
- S6 (payload): "payload" kuartikan sebagai bentuk event keluar. Delapan event game (`turn_changed`, `rally_ended`, `game_started`, `cards_played`, `player_skipped`, `auto_skipped`, `game_over`, `set_over`) dibangun oleh builder murni di `socket/outgoing.js`; tes `backend:outgoing` menjaga bahwa tiap emit memakai builder-nya dan field yang sampai ke klien persis yang terdaftar. Guard payload masuk (`socket/payload.js`) sudah ada dan tidak diubah. Event lain (`room_updated`, `game_state`, dan seterusnya) belum lewat builder.
- `auth/routes.js` untuk pertama kali punya tes (`backend:auth-routes`), dengan express, bcryptjs, dan JWT tiruan. Tes mengunci perilaku saat ini, termasuk username yang peka huruf besar/kecil (Bob dan bob dua akun); keputusan case-insensitive tetap menunggu saya, dan tes itu yang diubah bersamanya.
- Satu mutan ekuivalen pada S6: menghapus `if (events.length)` di `sweep()` tidak mengubah perilaku, karena `broadcastRoomEvents([])` tidak mengirim apa pun.
- S7 (`join_room`): pendatang baru dulu menerima dua `room_updated` identik (satu lewat `socket.emit`, satu lagi lewat siaran ke seluruh Room), dan anggota lain menerima pandangan yang dipersonalisasi untuk pendatang (`publicState(kode, idPendatang)` memuat `myHand`). Kini pendatang menerima satu `room_updated` pandangannya sendiri dan anggota lain satu `room_updated` netral (`publicState(kode, null)`). Pada Room berstatus waiting tidak ada game, jadi kebocoran kartu belum pernah terjadi; ini perbaikan pencegahan, bukan bug yang teramati. Mengubah satu tes lama: `backend/tests/profiles.sim.js` baris 106, prasyarat `cb.socket.inbox.length >= 2` menjadi `>= 1` (bukan assertion keamanannya; pendatang kini menerima satu salinan, bukan dua).
- S7 (event mati): server tidak pernah mengirim `player_joined`; listener klien-nya (`useSocket.js`) dihapus. Tes `tools:events` membaca server dan klien sebagai teks dan menjaga kedua sisi sepakat: tiap event server didengarkan klien, tiap listener klien punya pengirim, tiap handler server dikirim klien, dan klien hanya mengirim event yang ditangani server. Satu-satunya pengecualian tertulis: `kick_done`.
- S7 sengaja tidak mengubah dua hal. `kick_done` tetap dikirim ke Host dan tetap tidak didengarkan klien (bagian protokol Host Kick, di-assert `room-code-case.sim.js`; larangan mengubah Host Kick). Penolakan `leave_room` dan `return_to_room` tetap dikirim ke dua kanal (`<x>_error` dan `error`), dikunci banyak tes lama. Temuan dari membaca kode (belum diuji di browser): untuk `leave_room` klien menerima `leave_room_error` lebih dulu (pesan "Gagal keluar dari room: ...") lalu `error`, yang menimpanya dengan pesan generik, jadi pesan spesifik itu praktis tidak terlihat. Memperbaikinya butuh keputusan protokol.
- Satu mutan ekuivalen pada S7: menukar urutan dua emit di `join_room` (ke pendatang dan ke anggota lain) tidak mengubah perilaku karena keduanya ke socket berbeda; tesnya sengaja tidak mengunci urutan.
- `roomStore.insertGame` tidak memakai transaksi (sama seperti sebelum S6): bila `INSERT` ke `game_scores` gagal di tengah, baris `games` dan skor yang sudah masuk tertinggal. Dilaporkan, tidak diubah; tidak ada tes yang mengunci perilaku itu.

## Baseline tes

Satu perintah dari root: `npm test`. Angka yang diharapkan setelah s7:

- Sandbox: 39 suite, 38 PASS + 1 SKIP (`backend:jest`), 584 tes terhitung.
- Komputer saya (dengan `npm install` dan bash): tanpa SKIP; `backend:config-jwt` 21 (satu tes round trip `jsonwebtoken` asli ikut jalan) dan Jest 3, jadi sekitar 588.

Per suite. Backend: reconnect 16, room-navigation 17, kick 23, combo (lulus, tanpa hitungan), card-ids 16, payload-guards 10, turn-timer 8, intermission 12, max-games 9, single-room 14, profiles 16, host-retention 20, config-jwt 20 (+1 di komputer saya), debug-log 10, db-schema 20, db-persistence 12, room-code-case 12, constants 16, room-store 13, game-flow 12, outgoing 6, auth-routes 15, join-events 5, Jest 3 (`engine.test.js`). Frontend: sync 37, store-selectors 8, store-invariants 9, lobby-views 15, server-errors 8, player-names 12, combo-ui 48 + 26 (render) = 74, kick-ui 5 + 16 (render) = 21, lobby-ui 10 (render), game-ui 17. Alat: `tools:runner` 20, `tools:docs` 13, `tools:imports` 12, `tools:deps` 16, `tools:events` 10.

`npm test -- --strict` menganggap SKIP sebagai gagal.

## Tugas berikutnya

Mulai dengan: (1) baca `HANDOFF.md`, `README.md`, dan kode di ZIP, (2) jalankan `npm test` dan cocokkan dengan Baseline tes, (3) usulkan item berikutnya dengan audit read-only singkat dan tunggu persetujuan saya sebelum mengubah kode.

Kandidat tanpa keputusan aturan: S3b (frontend memakai modul konstanta bersama), username case-insensitive (butuh keputusan data lama). Wallet (C-E) menunggu keputusan peringkat seri dan set yang tidak selesai: jangan diasumsikan, tanyakan.
