# HANDOFF — Proyek Martil (lanjutan sesi sebelumnya)

KONTEKS
Martil = game kartu multiplayer untuk tepat 4 pemain.
Stack: backend Node.js, Express, Socket.IO, SQLite (node:sqlite), JWT; frontend React 18, Vite, Zustand.
ZIP yang saya lampirkan adalah SATU-SATUNYA sumber kebenaran. Jangan berasumsi dari ingatan; verifikasi ke kode.
Istilah: Homepage, Room, Game, Result adalah EMPAT keadaan berbeda. Homepage dan Room berbagi route /lobby dan komponen LobbyPage, tapi dibedakan oleh ada/tidaknya roomInfo. Jangan disamakan.

CARA KERJA
- Penjelasan: Indonesia, santai, singkat. Kode, komentar, commit message: English.
- Audit/rencana singkat dulu, lalu kerjakan setelah saya setuju. Jangan muter-muter; kalau langkahnya sudah jelas, langsung kerjakan.
- Satu patch per perubahan (git apply -p1), plus ZIP file yang berubah. Verifikasi: patch bisa diterapkan berurutan di salinan bersih ZIP, hasilnya identik dengan tree yang diuji, bisa di-rollback. Patch dokumentasi (README) dipisah dari patch kode.
- Tiap perubahan: tes otomatis baru + mutation check (manual dengan skrip kecil di luar proyek; tiap mutan harus lolos `node --check` supaya tidak ada kill palsu dari syntax error), jalankan tes lama dan baru, laporkan hasil sebelum dan sesudah.
- Jelaskan TERPISAH apa yang benar-benar teruji dan apa yang tidak (browser/React asli, Windows, Socket.IO asli, Express asli tidak ada di sandbox).
- Jangan lanjut ke tahap berikutnya sebelum saya memeriksa hasilnya.
- Jangan hapus atau lemahkan tes. Kalau spesifikasi memang berubah, ubah tesnya dan jelaskan persis baris mana yang berubah dan kenapa. Kalau menemukan bug di kode produksi saat menambah tes: laporkan dan tunggu keputusan saya, jangan diperbaiki diam-diam.
- README harus sesuai implementasi aktual. Jangan menulis versi Node sebagai "teruji" kalau belum diuji. Jangan tampilkan nilai rahasia. Database lokal dan .env tidak boleh ikut terunggah.

LARANGAN (kecuali saya minta eksplisit)
Jangan ubah aturan permainan, sistem giliran, Combo Detector, Group Chain, Host Kick, atau mekanisme reconnect. Jangan ubah ID internal pemain. Jangan tambah TypeScript. Jangan refactor besar sekaligus.

LINGKUNGAN
- Sandbox: Linux, Node v22.23.4, tanpa jaringan dan tanpa node_modules proyek (express, socket.io, jsonwebtoken, bcryptjs, jest TIDAK ada). `node:sqlite` asli tersedia.
- Jest tidak terpasang: engine.test.js dijalankan lewat shim kecil di luar proyek (Jest asli lulus di komputer saya).
- Tes render frontend: esbuild dan React ada di /opt/npm-tools/node_modules; jalankan dengan NODE_PATH=/opt/npm-tools/node_modules. React di sandbox 19.x, proyek memakai React 18, jadi hasil render sandbox belum membuktikan React 18: saya jalankan sendiri di komputer saya.
- Skrip bantu verifikasi (mutation, verify patch, shim Jest) disimpan di luar proyek.
- Saya di Windows (Node v22.23.1), memasang patch lokal dan push setelah tiap langkah terverifikasi.
  Berkas yang saya ubah lokal: commit dulu, lalu `git apply --3way`. Kalau akhir baris CRLF: `git apply --ignore-whitespace` (semua patch di bawah sudah diuji dengan itu).
- Perintah PowerShell untuk cek manual, bukan bash (here-string `@' ... '@ | node -` untuk skrip Node pendek).

POSISI SAAT INI
Sudah diterapkan di ZIP terbaru: patch 0001-0011, h6-0001/0002, h7-0001/0002, h7fix-0001..0006, s1-0001..0003, a1-0001..0004, h8-0001/0002, r3-0001/0002, r3fix-0001, s8-0001/0002.
Dikirim sesi lalu dan MENUNGGU VERIFIKASI SAYA (sunting baris ini sebelum menempel bila sudah diterapkan): s9-0001, s9-0002.

| Item | Status |
|---|---|
| H1-H7 (validasi cardIds, guard payload, timer, jeda antar-game, maxGames 3/4/5, satu akun satu Room, pesan error server di UI) | SELESAI |
| H8 higiene konfigurasi: JWT_SECRET fail-fast di NODE_ENV=production (exit 1, satu baris, tanpa nilai rahasia), satu warning di development, backend/.env.example (JWT_SECRET sengaja kosong) | SELESAI |
| R3 log `[rally-debug]` di engine hanya aktif dengan MARTIL_DEBUG=1/true | SELESAI |
| r3fix perbaikan flaky intermission.sim (jam dibekukan saat jeda berakhir) | SELESAI |
| S1 helper nama pemain | SELESAI |
| S8 skema DB berversi (PRAGMA user_version = 1, MIGRATIONS di backend/src/db/database.js) + `bootDatabase()` di server.js: tutup Room waiting/playing basi saat boot; DB versi lebih baru ditolak | SELESAI |
| S9 `npm test` terpadu (scripts/run-tests.mjs, Node murni; SKIP selalu tampil; --only/--strict/--list/--verbose/--timeout; MARTIL_BASH) + harness SQLite asli di memori (helpers/memdb.js, error SQL tertelan membuat skenario gagal) + db-persistence.sim.js | patch dikirim, menunggu verifikasi |
| S2 normalisasi kode Room (uppercase di semua event) | belum |
| S3 konstanta bersama (timer 30 dtk, 4 pemain, panjang kode, pilihan game) | belum |
| S4 kurangi state ganda di store (currentTurn, roomCode, roomInfo.game vs gameState, events sebagai bus) | belum |
| S5 pecah LobbyPage jadi HomeView dan RoomView (route tetap /lobby) | belum |
| S6 pisahkan tanggung jawab backend bertahap (timer, akses DB, payload) | belum |
| S7 rapikan event (player_joined mati, kick_done tak didengar, error ganda, join_room menyiarkan state satu pemain) | belum |
| R1 import/ekspor tak terpakai | belum |
| R2 selector pada useGameStore() | belum |
| R4 dependency/berkas (ioredis, "martil: file:..", field engines, trace-sockets.js, folder Patch/) | belum |
| R5 minor (cabang `!next` engine, auth/me, register race 409, emitPrivateStates O(n), logout tidak kirim leave_room) | belum |

ROADMAP FITUR
| Item | Status |
|---|---|
| A posisi kursi berlawanan arah jarum jam | SELESAI |
| B profil pemain | SEBAGIAN: nama asli tampil. Belum: avatar, level, info profil, username unik case-insensitive |
| C wallet virtual: saldo awal 20.000; set 3/4/5 game; saldo berubah HANYA setelah set selesai: juara 1 +5K, 2 +3K, 3 -3K, 4 -5K | belum |
| D validasi saldo Room di backend (Room 5K butuh saldo >= 5.000) | belum |
| E arsitektur Wallet modular, terpisah dari Game Engine (saldo, riwayat transaksi, before/after, delta, alasan, ID set, peringkat, idempoten terhadap event berulang/refresh/reconnect); koin virtual saja | belum |
Catatan teknis untuk C-E: migrasi skema sekarang tinggal menambah fungsi baru di array MIGRATIONS (versi 2, dst.), tiap migrasi dalam transaksi. Harness tes memakai SQLite asli, jadi tes wallet bisa langsung menguji SQL sungguhan.

KEPUTUSAN YANG SUDAH FINAL
- Nominal Room menskalakan perubahan saldo: Room 5K = +5K/+3K/-3K/-5K, Room 10K = +10K/+6K/-6K/-10K.
- Jumlah game per set hanya 3, 4, atau 5.
- Username nantinya unik dan case-insensitive.
- Host dipertahankan selama masa tunggu reconnect 60 dtk; pindah hanya bila Host benar-benar keluar atau masa tunggu habis; Host yang digeser saat game berjalan mendapat peran kembali saat reconnect.
- Tombol Kick sudah dihapus dari halaman Result; Kick hanya di Room.
- NODE_ENV tidak diset = development (JWT_SECRET kosong hanya warning); fail-fast hanya bila NODE_ENV=production. Panjang minimum secret hanya rekomendasi di README, tidak dipaksa di kode.
- Flag log debug engine: MARTIL_DEBUG, menyala hanya untuk "1" atau "true".
- Saat boot, Room berstatus waiting/playing di DB menjadi 'closed' (tanpa status baru); Room 'done' dan sets.ended_at dibiarkan. DB dengan versi skema lebih baru dari kode menghentikan server (exit 1, satu baris `[db] FATAL: ...`).
- Suite frontend berbasis bash dijalankan lewat bash bila ada (atau MARTIL_BASH), selain itu SKIP dengan pesan jelas; porting ke Node ditunda. SKIP tidak membuat exit code gagal kecuali --strict.

BELUM DIPUTUSKAN (JANGAN diasumsikan atau diimplementasikan)
Peringkat seri (poin sama), perlakuan set yang tidak selesai (sets.ended_at NULL sengaja dibiarkan), apakah server juga membatasi Kick hanya saat Room menunggu (server masih menerima Kick mode Result), env var untuk masa tunggu reconnect (usulan, belum diminta), celah tes kick-ui (label tombol "Back to Room" tidak terdeteksi bila diganti), aturan skip saat meja kosong, kewajiban membuka game 1 dengan 3♠.

TEMUAN TERBUKA (sudah dilaporkan, BELUM dikerjakan; tunggu keputusan saya)
- generateCode() hanya mengecek Room di memori, sedangkan rooms.code UNIQUE di DB bertahan melewati restart dan Room tertutup. Tabrakan sangat jarang, tetapi bila terjadi INSERT melempar error setelah Room sudah masuk memori (kandidat S6/R5 atau fase sebelum online).
- PORT dan CLIENT_URL jatuh ke nilai localhost bila kosong, juga di production; frontend/.env.example (VITE_SERVER_URL) belum ada (fase sebelum online; sudah dicatat di checklist README).
- auth/routes.js (login, register, me) belum punya tes sama sekali (butuh express/bcryptjs; kandidat R5).
- Tabel room_players dibuat tetapi tidak dipakai server.
- State Room hidup di memori dan hilang saat server restart (fase sebelum online).

ALUR KERJA SAYA
Test offline di localhost -> debug -> tambah fitur dan perbaiki UI -> baru online. Urutan fase:
1) test/debug offline: SELESAI (R3, S8, S9 menunggu verifikasi), 2) putuskan aturan yang belum diputuskan (keputusan saya, bukan pekerjaan kode), 3) fitur (wallet C-E, username case-insensitive; item S/R yang relevan), 4) sebelum online (rate limit, HTTPS, state Room di memori yang hilang saat restart, R4, S6, temuan terbuka di atas).

BASELINE TES (angka yang diharapkan di ZIP terbaru, setelah s9)
Satu perintah dari root: `npm test` (25 suite). Di sandbox: 24 PASS + 1 SKIP (backend:jest), 422 tes terhitung. Di komputer saya (dengan npm install dan bash) harusnya tanpa SKIP kecuali ada yang menunjuk lain: config-jwt 21 (satu tes round trip jsonwebtoken asli ikut jalan) dan Jest 3.
Backend: reconnect 16, room-navigation 17, kick 23, combo (lulus, tanpa hitungan), card-ids 16, payload-guards 10, turn-timer 8, intermission 12, max-games 9, single-room 14, profiles 16, host-retention 20, config-jwt 20 (+1 di komputer saya), debug-log 10, db-schema 20, db-persistence 12, Jest 3 (engine.test.js).
Frontend: sync 37, server-errors 8, player-names 12, combo-ui 48 + 26 (render) = 74, kick-ui 5 + 16 (render) = 21, lobby-ui 10 (render), game-ui 17.
Tools: tools:runner 20 (tes untuk runner itu sendiri).
Perintah per suite tetap ada (`npm run test:<x>` di backend, `bash tests/<x>/run.sh` di frontend); `npm test -- --strict` menganggap SKIP sebagai gagal.

TUGAS SESI INI
Mulai dengan: (1) baca ZIP, (2) jalankan `npm test` dan cocokkan dengan baseline di atas, laporkan selisih bila ada, (3) usulkan item berikutnya (singkat, dengan audit read-only) dan tunggu persetujuan saya sebelum mengubah kode. Kalau fase 2 (keputusan aturan) belum saya isi, jangan diasumsikan: tanyakan atau usulkan item dari fase 3 yang tidak bergantung pada aturan tersebut.
