# 🃏 Martil — Multiplayer Card Game

Martil adalah game kartu multiplayer online untuk **tepat 4 pemain**, berbasis house rules (bukan varian standar mana pun). Pemain membuat atau bergabung ke Room, memainkan satu *set* yang terdiri dari beberapa game, lalu melihat peringkat akhir. Komunikasi real-time lewat Socket.IO, tampilan mobile-first.

Tujuan proyek: pengalaman bermain yang adil dan stabil (server sebagai sumber kebenaran, tahan refresh dan putus koneksi). Saat ini belum ada uang, saldo, atau taruhan apa pun yang aktif — lihat [Keterbatasan dan Rencana](#-keterbatasan-dan-rencana).

> Dokumen ini ditulis dari kondisi kode yang diperiksa langsung. Bila ada yang berbeda dengan kode, kodelah yang benar — mohon perbarui README.
>
> Status kerja pengembangan (keputusan, backlog, temuan terbuka, baseline tes) dicatat di [HANDOFF.md](HANDOFF.md), bukan di sini.

---

## 📌 Ringkasan Status

| Area | Status |
|---|---|
| Akun (register/login, JWT) | ✅ Tersedia |
| Homepage, Room, Game, Result | ✅ Tersedia |
| Aturan permainan, skor, peringkat set | ✅ Tersedia |
| Combo Detector dan Group Chain (klien) | ✅ Tersedia |
| Reconnect dan pemulihan sesi | ✅ Tersedia |
| Host Kick (di Room; halaman Result tidak punya tombol Kick) | ✅ Tersedia |
| Validasi `cardIds`, guard payload Socket.IO, timer giliran yang tidak bisa direset aksi ditolak, perlindungan jeda antar-game | ✅ Tersedia |
| Jumlah game per set: hanya 3, 4, atau 5 (UI dan validasi server) | ✅ Tersedia |
| Satu akun hanya boleh menjadi anggota satu Room pada satu waktu (validasi server) | ✅ Tersedia |
| Nama asli (username) pemain tampil di Room, Game, dan Result (bukan ID acak) | ✅ Tersedia |
| Pesan error server tampil di UI dalam bahasa Indonesia (Homepage, Room, Game, Result) | ✅ Tersedia |
| Avatar dan level pemain | ⏳ Placeholder (lihat [Keterbatasan dan Rencana](#-keterbatasan-dan-rencana)) |
| Wallet / saldo virtual, validasi saldo Room | ❌ Belum ada (rencana) |
| Posisi kursi berlawanan arah jarum jam (kanan, atas, kiri menurut urutan bergabung) | ✅ Tersedia |
| Host dipertahankan selama masa tunggu reconnect 60 detik dan dikembalikan bila kursinya dipertahankan | ✅ Tersedia |
| Kode Room tidak peka huruf besar/kecil di semua event Socket.IO | ✅ Tersedia |
| Skema database berversi; Room yang tersisa dari proses sebelumnya ditutup saat server start | ✅ Tersedia |
| Konfigurasi aman: `JWT_SECRET` wajib di production (server menolak start tanpa itu); log debug engine opsional | ✅ Tersedia |
| Satu perintah `npm test` untuk semua suite backend dan frontend | ✅ Tersedia |

---

## ⚡ Quick Start

Prasyarat: **Node.js 22.x** dan npm. Backend memakai modul bawaan `node:sqlite`, yang hanya ada di Node.js versi baru. **Satu-satunya versi yang pernah diuji adalah v22.23.4.** Batas versi minimum belum diverifikasi; versi lain (termasuk 22.x yang lebih lama) belum diuji. `package.json` root dan backend memuat `engines.node` = `22.x` (npm hanya memberi peringatan bila versinya beda).

```bash
# 1. Masuk ke folder proyek (folder yang berisi package.json root)
cd martil-main

# 2. Install dependency backend + frontend
npm run install:all

# 3. Buat backend/.env dengan menyalin backend/.env.example (lihat bagian Environment Variable)

# 4. Jalankan backend dan frontend sekaligus
npm run dev
```

Buka browser:
- **Frontend** → http://localhost:5173
- **Backend** → http://localhost:3001/health (balasan `{"ok":true}`)

> **Catatan Windows:** `npm run dev` memakai `&` (background process) yang berjalan di Unix/macOS. Di Windows, buka dua terminal dan jalankan `npm run dev:backend` serta `npm run dev:frontend`.

### Install manual (terpisah)

```bash
# Terminal 1 — Backend (nodemon)
cd backend && npm install && npm run dev      # http://localhost:3001

# Terminal 2 — Frontend (Vite)
cd frontend && npm install && npm run dev     # http://localhost:5173
```

### Build

`npm run build` (di root) membangun frontend ke `frontend/dist/`. Backend **tidak** menyajikan `dist/`; sajikan lewat web server terpisah bila perlu.

---

## 🔧 Teknologi

| Layer | Teknologi |
|---|---|
| Backend | Node.js 22.x (diuji: v22.23.4), Express 4, Socket.IO 4 |
| Database | SQLite lewat modul bawaan `node:sqlite` (`DatabaseSync`; masih berstatus eksperimental di Node) |
| Auth | JWT (`jsonwebtoken`, berlaku 7 hari) + `bcryptjs` |
| Frontend | React 18, Vite 5 |
| State | Zustand 4 |
| Routing | react-router-dom 6 |
| Real-time | socket.io-client 4 |
| Test | Runner `npm test` (Node) + skrip simulasi tanpa framework + Jest untuk `engine.test.js` + skrip bash untuk sebagian tes frontend |

---

## 📁 Struktur Proyek

```
martil-main/
├── README.md                    ← dokumentasi utama (dokumen ini)
├── HANDOFF.md                   ← status kerja, keputusan, dan backlog; diperbarui setiap tahap
├── package.json                 ← skrip root (install:all, dev, build, test, ...)
├── scripts/                     ← run-tests.mjs (runner `npm test`) dan tes untuk runner, dokumentasi, import tak terpakai, dan dependency
├── Patch/                       ← arsip patch lama (riwayat perubahan; tidak dipakai saat menjalankan proyek)
│
├── backend/
│   ├── package.json             ← skrip start, dev, test, dan test:<suite> untuk satu suite
│   ├── .env.example             ← contoh konfigurasi (hanya placeholder; salin menjadi .env)
│   ├── data/                    ← martil.db (SQLite, dibuat otomatis)
│   ├── src/
│   │   ├── server.js            ← entry point Express + Socket.IO
│   │   ├── constants.js         ← konstanta Room/game: jumlah pemain, panjang kode, pilihan game per set, timer giliran (satu definisi di backend; frontend mengulang beberapa nilainya dan tes `constants` menjaga agar tidak berbeda)
│   │   ├── auth/
│   │   │   ├── jwt.js           ← sign/verify JWT + pemilihan secret (server menolak start di production bila JWT_SECRET kosong)
│   │   │   └── routes.js        ← POST /api/auth/register, /login; GET /api/auth/me
│   │   ├── db/database.js       ← koneksi SQLite, migrasi skema berversi (PRAGMA user_version), penutupan Room basi saat start
│   │   ├── game/
│   │   │   ├── deck.js          ← kartu, urutan rank/suit, shuffle, deal
│   │   │   ├── validator.js     ← deteksi dan perbandingan kombinasi
│   │   │   ├── scorer.js        ← skor game dan peringkat set
│   │   │   ├── cardIds.js       ← validasi bentuk daftar `cardIds` pada play_cards
│   │   │   ├── engine.js        ← state machine satu game (giliran, rally, kemenangan)
│   │   │   └── engine.test.js   ← uji Jest untuk perilaku rally/skip
│   │   ├── rooms/roomManager.js ← Room, set, game, reconnect, Kick (state di memori)
│   │   ├── socket/socketHandler.js ← semua event Socket.IO, timer giliran, sweeper
│   │   └── socket/payload.js    ← guard bentuk payload event Socket.IO dan normalisasi kode Room
│   └── tests/                   ← suite simulasi (`*.sim.js`) dan `combo.consistency.js`
│       └── helpers/             ← sim.js (Socket.IO tiruan + jam simulasi), memdb.js (SQLite asli di memori)
│
└── frontend/
    ├── package.json, vite.config.js, index.html
    ├── trace-sockets.js         ← skrip manual (butuh backend jalan; lihat bagian Menjalankan Automated Test)
    ├── src/
    │   ├── main.jsx, App.jsx    ← entry dan routing
    │   ├── store/gameStore.js   ← Zustand: auth, koneksi, room, game, hasil set
    │   ├── hooks/useSocket.js   ← satu koneksi Socket.IO + semua listener event
    │   ├── pages/               ← LoginPage, LobbyPage (state, efek, socket, dan modal Kick; menampilkan HomeView atau RoomView), GamePage, ResultPage
    │   ├── components/          ← Modal, ConnectionOverlay, GameSyncWaiting, HomeView, RoomView, lobbyStyles, game/ui.jsx (tampilan meja)
    │   └── utils/               ← comboDetector, comboPicker, groupChain, handUi (logika tangan),
    │                              gameLayout (ukuran/posisi kursi), profile (nama pemain + data profil sementara), gameToast,
    │                              session, kick, serverErrors (pesan error server) (logika murni untuk UI)
    └── tests/                   ← satu folder per area (logika + render); browser/ = uji Chromium opsional
```
Daftar lengkap suite tes: `npm test -- --list`.

---

## ⚙️ Environment Variable

Salin `backend/.env.example` (hanya berisi placeholder, aman di-commit) menjadi `backend/.env`, lalu isi. `backend/.env` di-`.gitignore`: **jangan di-commit** dan jangan menempelkan nilai rahasia ke dokumen/issue.

```bash
cp backend/.env.example backend/.env                 # bash
Copy-Item backend\.env.example backend\.env          # PowerShell
```

Isi `.env.example` (nilai rahasia sengaja **kosong**, jadi salinan yang belum diisi tidak pernah menjadi secret sungguhan):

```env
# NODE_ENV=production
# MARTIL_DEBUG=1
PORT=3001
CLIENT_URL=http://localhost:5173
JWT_SECRET=
```

| Variabel | Dipakai di | Default bila kosong | Keterangan |
|---|---|---|---|
| `NODE_ENV` | backend | tidak diset = development | Hanya dibaca oleh `auth/jwt.js`: `production` (huruf besar/kecil dan spasi di sekitarnya diabaikan) mewajibkan `JWT_SECRET`. Nilai lain atau tidak diset diperlakukan sebagai development |
| `MARTIL_DEBUG` | backend | mati | `1` atau `true` menyalakan log `[rally-debug]` di engine (lihat bagian Log). Nilai lain, termasuk `0`/`false`/kosong, tetap mati |
| `PORT` | backend | `3001` | Port server HTTP + Socket.IO |
| `CLIENT_URL` | backend | `http://localhost:5173` | **Satu** origin yang diizinkan CORS (REST dan Socket.IO) |
| `JWT_SECRET` | backend | development: nilai bawaan di `auth/jwt.js` + satu peringatan saat start | **Wajib di production.** Dengan `NODE_ENV=production`, server langsung berhenti (exit code 1, satu baris pesan, tanpa stack trace) bila `JWT_SECRET` kosong, hanya spasi, atau sama dengan nilai bawaan development. Kode tidak memaksa panjang minimum; disarankan nilai acak minimal 32 karakter, mis. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `VITE_SERVER_URL` | frontend | `http://localhost:3001` | Alamat Socket.IO yang dituju klien (dibaca saat build/dev Vite) |

Catatan:
- **Deploy wajib mengatur `NODE_ENV=production`.** Bila `NODE_ENV` tidak diset, server dianggap development: `JWT_SECRET` kosong hanya memunculkan peringatan dan server tetap berjalan dengan secret bawaan yang tidak aman (nilainya ada di kode sumber). Perlindungan fail-fast hanya aktif di production. Pesan peringatan dan error tidak pernah memuat nilai secret.
- `.env` dibaca dari folder tempat server dijalankan (`dotenv.config()` memakai folder kerja saat ini): jalankan dari folder `backend` (seperti `npm run dev`/`npm start`) supaya `backend/.env` terbaca.
- `PORT` dan `CLIENT_URL` yang kosong masih jatuh ke nilai localhost, termasuk di production (belum ada fail-fast untuk keduanya).
- Request REST (`/api/...`) dari frontend lewat proxy Vite ke `http://localhost:3001` (tertulis di `frontend/vite.config.js`); Socket.IO tidak lewat proxy, melainkan langsung ke `VITE_SERVER_URL`.
- Lokasi database tetap: `backend/data/martil.db` (otomatis dibuat). File ini berisi hash password pemain; jangan dibagikan atau di-commit.
- **Skema database berversi** (`PRAGMA user_version`, saat ini `1`). Saat server start (`bootDatabase()` di `server.js`, sebelum `listen`): (1) migrasi yang belum berjalan diterapkan otomatis, masing-masing dalam satu transaksi; (2) Room yang masih berstatus `waiting`/`playing` di database ditandai `closed`, karena state Room hidup di memori dan sudah hilang saat server berhenti (log `DB_STALE_ROOMS_CLOSED` dengan jumlahnya, hanya bila ada). Room `done` (set selesai) dan kolom `sets.ended_at` tidak diubah: perlakuan set yang tidak selesai belum diputuskan.
- Database lama dari sebelum versi ini (`user_version` 0) otomatis naik ke versi 1 tanpa kehilangan data. **Cadangkan `backend/data/` sebelum menjalankan versi ini pertama kali.** Bila `martil.db` berasal dari server yang lebih baru (versi lebih tinggi dari yang didukung kode), server berhenti dengan exit code 1 dan satu baris `[db] FATAL: ...`, dan file tidak diubah.

### Data lokal dan rahasia tidak boleh ikut terunggah
`.gitignore` mengecualikan `.env` dan `.env.*` (kecuali `.env.example`), folder `backend/data/`, serta berkas `*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite`, `*.sqlite3`.

`.gitignore` hanya berlaku untuk berkas yang **belum** dilacak git. Bila `backend/data/martil.db` atau sebuah `.env` pernah ter-commit atau ter-push, hentikan pelacakannya (`git rm --cached <berkas>` lalu commit) dan anggap isi yang sudah terunggah telah terbuka: ganti `JWT_SECRET` dan minta pemain mengganti password. Menghapus berkas dari riwayat git membutuhkan langkah terpisah. Saat membagikan ZIP proyek, jangan sertakan `backend/data/`, `.env`, dan `node_modules/`.

---

## 🧭 Alur Aplikasi: Homepage → Room → Game → Result

Empat keadaan ini **berbeda**:

| Keadaan | Route | Komponen | Kapan |
|---|---|---|---|
| **Homepage** (di UI disebut *Menu Utama*) | `/lobby` | `LobbyPage` → `HomeView` | Pemain sudah login tetapi belum menjadi anggota Room. Bisa **Buat Room** (pilih jumlah game per set) atau **Gabung** dengan kode 6 karakter. |
| **Room** | `/lobby` | `LobbyPage` → `RoomView` | Pemain anggota sebuah Room yang berstatus menunggu. Menampilkan kode Room, 4 kursi, Host: **Mulai Game** dan **Kick**, semua pemain: **Exit Room**. |
| **Game** | `/game` | `GamePage` | Pertandingan berlangsung. |
| **Result** | `/result` | `ResultPage` | Satu set selesai: peringkat, skor, riwayat game. |

Homepage dan Room memakai route dan komponen yang sama; yang membedakan adalah ada/tidaknya data Room pemain di store (`roomInfo`). Login ada di `/login`; route yang tidak dikenal diarahkan ke `/lobby` (sudah login) atau `/login`.

```
Login ──► Homepage ──create_room / join_room──► Room ──start_game (Host, 4 pemain)──► Game
              ▲                                   ▲                                      │ set selesai
              │            Exit Room (leave_room) │                                      ▼
              ├───────────────────────────────────┤◄──Back to Room (return_to_room)── Result
              └──────────Back to Menu Utama (leave_room) ◄─────────────────────────────┘
```

Aturan alur:
- Set dimulai oleh Host dan butuh **tepat 4 pemain** yang semuanya sudah berada di Room (`inRoom`).
- Game pertama dimulai oleh pemegang 3♠; game berikutnya dimulai oleh pemenang game sebelumnya. Antar-game ada jeda 5 detik sebelum game berikutnya diumumkan (`game_started`); selama jeda itu `play_cards` dan `skip_turn` ditolak dengan `GAME_STARTING`, dan timer giliran belum berjalan.
- Setelah game terakhir, klien pindah ke Result sekitar 2 detik setelah `set_over`.
- Di Result: **Back to Room** (`return_to_room`) tetap menjadi anggota Room dan mereset Room ke status menunggu; **Back to Menu Utama** (`leave_room`) keluar dari Room.
- `leave_room` dan `return_to_room` ditolak saat game berjalan (`GAME_IN_PROGRESS`).
- Room berstatus selesai yang punya kursi kosong tetap bisa dimasuki pemain baru (Room kembali ke status menunggu).
- **Satu akun = satu Room.** Selama akun masih menjadi anggota sebuah Room (status menunggu, bermain, atau selesai/Result, termasuk saat socket-nya terputus dan kursinya belum kedaluwarsa), `create_room` dan `join_room` ke Room lain ditolak dengan `ALREADY_IN_OTHER_ROOM`. Akun bebas lagi setelah `leave_room` (Exit Room / Back to Menu Utama), setelah di-Kick dari Room, atau setelah kursinya kedaluwarsa (60 detik terputus). `join_room` ke Room yang sama tetap berarti resume sesi.
- Hasil set (peringkat, skor, riwayat game) dibekukan di server (`setResult`) dan di klien, sehingga Result tidak berubah saat pemain lain mereset Room dan bisa dipulihkan setelah refresh.

---

## 🃏 Aturan Permainan

### Rank (rendah → tinggi)
```
3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2
```

### Suit (tiebreak, tinggi → rendah)
```
♠ Spade > ♥ Heart > ♣ Club > ♦ Diamond
```

### Jenis Kombinasi
| Jenis | Kartu | Catatan |
|-------|-------|---------|
| Single | 1 | — |
| Pair | 2 | rank sama |
| Tris | 3 | rank sama |
| Paketan | 5 | lihat tabel di bawah |

Kombinasi harus sejenis dengan kartu teratas di meja (Single melawan Single, dst.); Paketan boleh dikalahkan Paketan yang lebih kuat.

### Kekuatan Paketan (rendah → tinggi)
1. Straight
2. Flush *(dibandingkan dari suit dahulu, lalu kartu tertinggi)*
3. Full House *(dibandingkan dari rank Three of a Kind)*
4. Four of a Kind + 1 kicker bebas *(dibandingkan dari rank empat kartu)*
5. Straight Flush
6. Royal Flush

### Straight Valid / Tidak Valid
- ✅ Valid: `A-2-3-4-5`, `2-3-4-5-6`, `10-J-Q-K-A`
- ❌ Tidak valid: `J-Q-K-A-2`, `Q-K-A-2-3`, `K-A-2-3-4`
- **Kekuatan straight** dinilai dari kartu paling kanan pada urutan yang ditulis: `A-2-3-4-5` (terkecil, dihitung 5) < `2-3-4-5-6` (dihitung 6) < `3-4-5-6-7` < … < `10-J-Q-K-A` (terbesar). Berlaku juga untuk Straight Flush; jika kartu ujungnya sama rank, suit kartu ujung yang menentukan.
- Di meja, `A-2-3-4-5` dan `2-3-4-5-6` ditampilkan berurutan seperti ditulis (`displayOrder` di `comboDetector.js`); urutan kartu di tangan (3…K-A-2) dan data dari server tidak berubah.
- Aturan ini harus identik di `backend/src/game/validator.js` dan `frontend/src/utils/comboDetector.js`; `npm run test:combo` (folder backend) memeriksa ±2,6 juta kombinasi di kedua sisi.

### Sistem Giliran
- Pemain bisa **Main** atau **Skip**.
- Pemain yang sudah Skip tidak mendapat giliran lagi sampai rally berakhir.
- Bila hanya satu pemain yang belum Skip, rally selesai, meja dibersihkan, dan pemain itu main bebas.
- Timer 30 detik per giliran → auto-skip bila habis.

### Skor Pemenang Game
| Kondisi | Poin |
|---------|------|
| Normal | −5 |
| Kartu terakhir = single 2 | −10 |
| Kartu terakhir = single 3♦ | −35 |

### Penalti Sisa Kartu (yang kalah)
| Kondisi | Skor |
|---------|------|
| Kartu biasa < 9 | jumlah × 1 |
| Kartu biasa ≥ 9 | jumlah × 2 |
| Setiap kartu 2 | +5 |
| Tepat 1 kartu sisa = 3♦ | +35 |
| Tidak pernah main (13 kartu) | +52 langsung |

### Set dan Peringkat
- Satu set = 3, 4, atau 5 game, dipilih pembuat Room (default 4). Homepage hanya menawarkan ketiga nilai itu, dan server menolak nilai lain (`INVALID_MAX_GAMES`). Skor tiap game dijumlahkan.
- Poin total terkecil = Juara 1.
- Bila poin total sama, urutan peringkat saat ini mengikuti urutan pemain di Room (belum ada aturan seri khusus).
- Label `+5k / +3k / −3k / −5k` di halaman Result saat ini **hanya teks tampilan**; tidak ada saldo yang berubah (lihat [Keterbatasan dan Rencana](#-keterbatasan-dan-rencana)).

---

## 🔌 Komunikasi Frontend ↔ Backend

**Server adalah sumber kebenaran.** Klien hanya menampilkan apa yang dikirim server; validasi klien (mis. Combo Detector, tombol PLAY) hanya untuk umpan balik instan.

### REST (`/api`)
| Endpoint | Fungsi |
|---|---|
| `POST /api/auth/register` | Body `{username, password}`; username 3–30 karakter (huruf, angka, `_`), password minimal 6 |
| `POST /api/auth/login` | Balasan `{token, user:{id, username}}` |
| `GET /api/auth/me` | Verifikasi token (`Authorization: Bearer …`); belum dipakai frontend |
| `GET /health` | Cek server hidup |

`user.id` (UUID) adalah ID internal pemain dan dipakai di seluruh game; `username` hanya nama login.

### Socket.IO
Koneksi memakai token JWT di handshake (`auth.token`); tanpa token valid koneksi ditolak (`AUTH_REQUIRED` / `INVALID_TOKEN`). Frontend memegang **satu** koneksi (`hooks/useSocket.js`); halaman mengirim event lewat `emitSocket`.

**Klien → server**
| Event | Payload | Fungsi |
|---|---|---|
| `resume_session` | — | Pulihkan sesi (dikirim di setiap connect/reconnect) |
| `create_room` | `{maxGames}` (3, 4, atau 5; opsional, default 4) | Buat Room |
| `join_room` | `{roomCode}` | Gabung Room (anggota yang sudah ada diperlakukan sebagai resume) |
| `leave_room` | `{roomCode}` | Exit Room / Back to Menu Utama |
| `return_to_room` | `{roomCode}` | Back to Room dari Result |
| `kick_player` | `{roomCode, targetId}` | Host mengeluarkan pemain |
| `start_game` | `{roomCode}` | Host memulai set |
| `play_cards` | `{roomCode, cardIds}` | Mainkan kartu |
| `skip_turn` | `{roomCode}` | Skip |

**Server → klien**
| Kelompok | Event |
|---|---|
| Sesi | `session_restored`, `session_none`, `session_replaced` |
| Room | `room_created`, `room_updated`, `room_left`, `room_returned`, `return_room_error`, `leave_room_error` |
| Kick | `kicked`, `kicked_from_result`, `kick_done`, `kick_error` |
| Game | `game_started`, `game_state` (kartu pribadi tiap pemain), `turn_changed`, `cards_played`, `player_skipped`, `auto_skipped`, `rally_ended`, `game_over`, `set_over` |
| Koneksi pemain lain | `player_disconnected`, `player_reconnected` |
| Umum | `error` `{code}` |

Kartu lawan tidak pernah dikirim: tiap pemain menerima `game_state` pribadi (kartu sendiri + jumlah kartu lawan).

**Nama pemain (profil publik).** Setiap state Room (`room_updated`, `game_state`, `session_restored`) membawa `profiles`: peta `{ [idPemain]: { username } }` untuk pemain yang sedang ada di Room. Daftar field bersifat eksplisit (hanya `username`): email, hash password, token, dan klaim lain tidak pernah dikirim. Username diambil dari token login yang diverifikasi server (bukan dari klien), dibersihkan (string, di-trim, 1–30 karakter), dan bila tidak valid pemain itu tidak punya profil sehingga UI memakai ID singkat 8 karakter. ID internal pemain tetap UUID dan tidak bergantung pada username (peta selalu menurut ID, bukan menurut nama). Nama juga dibekukan di hasil set (`set_over.profiles` dan `setResult.profiles`), jadi halaman Result tetap benar walau pemain sudah keluar atau di-Kick. `players` tetap berbentuk `{ id, connected, inRoom }`; nama tidak digandakan di sana.

### Validasi input, timer giliran, dan kode error

**Payload.** Setiap handler membaca payload lewat guard (`socket/payload.js`): payload harus berupa objek, dan `roomCode` / `targetId`, bila ada, harus string maksimal 64 karakter. Bentuk yang salah dijawab `INVALID_PAYLOAD` pada kanal yang sama dengan penolakan event itu: `leave_room_error` + `error` untuk `leave_room`, `return_room_error` + `error` untuk `return_to_room`, `kick_error` untuk `kick_player`, dan `error` untuk event lain. Field yang tidak dikirim tetap memakai kode lama (`NOT_IN_ROOM`, `ROOM_NOT_FOUND`). `create_room` tanpa payload tetap diterima. `maxGames` pada `create_room` harus tepat angka 3, 4, atau 5 (string seperti `"4"`, pecahan, `NaN`, `null`, dan nilai lain ditolak `INVALID_MAX_GAMES` tanpa membuat Room dan tanpa mengubah state apa pun). Exception tak terduga di handler ditangkap, dicatat dengan stack di log server, dan pengirim menerima `INTERNAL_ERROR`; server tetap berjalan.

**Kode Room.** Semua event yang membawa `roomCode` (`join_room`, `leave_room`, `return_to_room`, `kick_player`, `start_game`, `play_cards`, `skip_turn`) menerima huruf besar, kecil, atau campuran: server mengubahnya ke huruf besar lewat `normalizeRoomCode` (`socket/payload.js`) sebelum dipakai, sehingga kode yang dikirim balik oleh server dan nama room Socket.IO selalu huruf besar. Spasi di sekitar kode tidak dipangkas (kode dengan spasi tidak cocok dengan Room mana pun). Kode kosong atau tidak ada dijawab seperti kode yang tidak dikenal. (Sebelumnya hanya `leave_room`, `return_to_room`, dan `kick_player` yang melakukan ini.) Kolom input di `LobbyPage` tetap mengubah ketikan ke huruf besar.

**`cardIds` pada `play_cards`.** Harus berupa array berisi id kartu yang sah (mis. `3D`, `10H`, `2S`), tanpa duplikat, paling banyak 13. Selain itu dijawab `INVALID_CARD_IDS`; tidak ada kartu dikirim tetap `NO_CARDS_SELECTED`. Urutan pemeriksaan engine: `GAME_NOT_ACTIVE`, `NOT_YOUR_TURN`, validasi bentuk `cardIds`, `CARD_NOT_IN_HAND`, lalu aturan kombinasi (`INVALID_COMBO`, `CANNOT_BEAT_TABLE`). Aturan permainan tidak berubah.

**Timer giliran.** `play_cards` dan `skip_turn` divalidasi dulu; timer hanya diganti setelah aksi diterima. Aksi yang ditolak (dari siapa pun) tidak mengubah timer.

**Jeda antar-game.** Dari akhir sebuah game sampai `game_started` dikirim, `play_cards` dan `skip_turn` dijawab `GAME_STARTING` (juga untuk pemain yang bukan gilirannya), auto-skip tidak berjalan, dan resume sesi tidak mengakhiri jeda.

**Kode error yang dikirim server lewat Socket.IO:**

| Kelompok | Kode |
|---|---|
| Umum | `INVALID_PAYLOAD`, `INTERNAL_ERROR`, `NOT_IN_ROOM`, `ROOM_NOT_FOUND`, `NOT_HOST` |
| Room | `INVALID_MAX_GAMES`, `ALREADY_IN_OTHER_ROOM`, `ROOM_FULL`, `GAME_ALREADY_STARTED`, `ALREADY_IN_ROOM`, `ALREADY_STARTED`, `NEED_4_PLAYERS`, `PLAYERS_NOT_READY`, `GAME_IN_PROGRESS` |
| Kick | `CANNOT_KICK_SELF`, `TARGET_NOT_IN_ROOM`, `KICKED_FROM_ROOM` |
| Game | `NO_ACTIVE_GAME`, `GAME_NOT_ACTIVE`, `GAME_STARTING`, `NOT_YOUR_TURN`, `NO_CARDS_SELECTED`, `INVALID_CARD_IDS`, `CARD_NOT_IN_HAND`, `INVALID_COMBO`, `CANNOT_BEAT_TABLE` |

Frontend menerjemahkan kode-kode ini ke pesan Indonesia (`frontend/src/utils/serverErrors.js`; kode yang tidak dikenal tampil sebagai "Terjadi kesalahan (KODE)."). Pesan tampil sebagai alert di Homepage dan Room (`LobbyPage`), sebagai banner di atas meja pada Game, dan di Result; di Homepage/Room dan Game pesan hilang sendiri setelah beberapa detik. Error `kick_error` memakai pesan terpisah di `utils/kick.js`.

### Reconnect dan pemulihan sesi
Setiap kali socket tersambung (login, refresh, atau reconnect otomatis), klien mengirim `resume_session`; server mencari Room pemain berdasarkan akun (bukan kode Room) dan membalas:

| Event server → klien | Arti |
|---|---|
| `session_restored` | (`view`: `game` / `result` / `room` ditentukan server) Snapshot lengkap (status Room, kartu, giliran, meja, `timeLeft`, `setResult` bila Result). Klien menimpa seluruh state lalu pindah ke `/lobby`, `/game`, atau `/result`. |
| `session_none` `{reason}` | Tidak ada sesi: `NO_ROOM`, `NOT_IN_ROOM`, `EXPIRED` (terputus > 60 dtk di Room waiting/done), `ROOM_CLOSED` (semua pemain terputus > 10 menit), atau `KICKED`. |
| `session_replaced` | Akun yang sama mengambil alih dari tab/perangkat lain. Tab lama melihat overlay dengan tombol "Pakai di tab ini". |
| `player_disconnected` / `player_reconnected` | Hanya dikirim ke pemain lain; resume tidak mengirim ulang kartu atau state ke mereka. |

Aturan server:
- Satu pemain punya satu socket aktif per Room; disconnect dari socket lama tidak menandai pemain terputus.
- `start_game`, `play_cards`, `skip_turn` ditolak (`NOT_IN_ROOM`) dari socket yang belum dipulihkan.
- Room `waiting`/`done`: pemain terputus **lebih dari** 60 dtk dikeluarkan dan Host berpindah ke pemain terhubung. Room `playing`: kursi dipertahankan (giliran yang lewat di-auto-skip) sampai pemain kembali.
- **Host dan masa tunggu.** Disconnect sementara tidak pernah memindahkan Host: Host dipertahankan selama masa tunggu 60 detik (dihitung sejak server mendeteksi putusnya koneksi) di semua status Room, dan Host yang kembali dalam masa itu tetap Host. Host berpindah hanya bila Host benar-benar keluar (`leave_room`, seketika) atau masa tunggu habis. Bila game sedang berjalan, Host yang terputus lebih dari 60 detik digeser ke pemain terhubung berikutnya tetapi kursinya dipertahankan, dan peran Host **dikembalikan** begitu ia reconnect (selama Host sementara itu masih Host; perubahan Host lain, misalnya Host sementara keluar, membatalkannya). Pada Room menunggu/selesai kursi Host yang kedaluwarsa dihapus, jadi Host tidak kembali. ID pemain tidak pernah berubah.
- **Mendiagnosis perpindahan Host.** Setiap perubahan Host tercatat di log backend sebagai `ROOM_HOST_CHANGED` dengan `previousHostId`, `reason` (`HOST_DISCONNECT_EXPIRED`, `HOST_SEAT_REMOVED`, `HOST_RECONNECTED`) dan `hostDisconnectedForMs`. Alasan putusnya koneksi tercatat di `SOCKET_DISCONNECTING` (field `reason`, mis. `ping timeout` atau `transport close`). Tab browser yang dibekukan atau di-sleep di background tidak membalas heartbeat Socket.IO sehingga terbaca sebagai disconnect; bila tab itu baru kembali setelah lebih dari masa tunggu, Host berpindah sesuai aturan di atas (penyebab ini belum diverifikasi pada kasus nyata, hanya cocok dengan perilaku kode dan simulasi).
- Pembersih berjalan tiap 10 detik; Room yang ditinggalkan semua pemain > 10 menit ditutup beserta timernya.

Di klien, `ConnectionOverlay` menampilkan "Menghubungkan kembali..." dan berubah menjadi pesan gagal + tombol *Coba lagi* bila lebih dari 20 detik (atau 8 detik tanpa jawaban resume). Layar "Menunggu data game…" meminta ulang state setelah 6 detik dan menampilkan pesan + tombol setelah 15 detik.

### Host Kick
- Hanya Host; tidak bisa mengeluarkan diri sendiri; tidak bisa saat game berlangsung (`GAME_IN_PROGRESS`). Semua validasi di server (`roomManager.kickPlayer`).
- Target berada di **Room** → dihapus dari Room dan menerima `kicked` (kembali ke Menu Utama). Ini bukan ban: boleh bergabung lagi.
- *(Tidak ada tombol Kick di halaman Result lagi; bagian ini hanya menjelaskan apa yang masih diterima server.)* Target masih di **Result** → dihapus dari kursi Room tetapi tetap melihat hasil set, dengan pembatasan (`kicked_from_result`): Back to Room ditolak (`KICKED_FROM_ROOM`) dan ia tidak bisa membuat/bergabung Room sebelum kembali ke Menu Utama (`leave_room`). Pembatasan bertahan setelah refresh/reconnect dan berakhir dengan timeout disconnect yang sama seperti pemain biasa (60 detik).

### Log
Backend mencetak log berawalan `[MARTIL ...]` (mis. `SOCKET_CONNECTED`, `SESSION_RESTORED`, `PLAYER_DISCONNECTED`, `AUTO_SKIP`, `SET_OVER`, `LEAVE_ROOM_REQUEST`, `PLAYER_KICKED`). `engine.js` mencetak `[rally-debug]` (pemain saat ini, pemain berikutnya, daftar yang sudah skip, `rallyId`) pada setiap Main/Skip yang diterima, **hanya bila `MARTIL_DEBUG=1` atau `true`**; secara default mati. Menyalakan di PowerShell: `$env:MARTIL_DEBUG = "1"` sebelum `npm run dev`; di bash: `MARTIL_DEBUG=1 npm run dev`; atau tulis `MARTIL_DEBUG=1` di `backend/.env`. Di console browser: `SOCKET_CONNECTED/DISCONNECTED`, `SESSION_RESTORED`, `SESSION_NONE`, `SESSION_REPLACED`, `SYNC_FAILED`, `SET_OVER_RECEIVED`, `ROOM_LEFT_CONFIRMED`.

---

## 🧪 Menjalankan Automated Test

Semua uji berjalan **tanpa browser dan tanpa WebSocket asli**: server diuji lewat Socket.IO tiruan di memori, dengan **SQLite asli di memori** (skema sama dengan produksi, `backend/tests/helpers/memdb.js`), sehingga SQL di `roomManager.js` ikut teruji. Error SQL yang ditelan handler socket (`onSafe`) dicatat dan membuat skenario **gagal**. Yang masih di-stub hanya JWT dan uuid. `auth/routes.js` (login/register) belum punya tes.

**Satu perintah untuk semua** (dari folder root; Node murni, jalan di Windows tanpa bash):
```bash
npm test                         # semua suite backend + frontend, satu baris per suite, ringkasan, exit code != 0 bila ada yang gagal
npm test -- --only backend       # hanya suite yang namanya memuat kata itu (daftar dipisah koma: --only kick,sync)
npm test -- --strict             # SKIP (juga sebagian) dianggap gagal
npm test -- --list               # daftar suite;  --verbose: tampilkan output semua suite;  --timeout 300: batas per suite (detik)
```
Runner menjalankan suite satu per satu dan hanya menampilkan output suite yang gagal. **SKIP bukan lulus**: suite yang dilewati selalu tampil di ringkasan beserta alasannya. Ada tiga penyebab SKIP: `backend:jest` bila Jest belum terpasang (`npm install` di `backend`), bagian render frontend bila `frontend/node_modules` belum ada, dan suite berbasis bash (`combo-ui`, `kick-ui`, `lobby-ui`, `game-ui`) bila bash tidak ditemukan. Di Windows, bila `bash` di PATH adalah WSL, tunjuk Git Bash: `$env:MARTIL_BASH = "C:\Program Files\Git\bin\bash.exe"`. `npm test` di folder `backend` atau `frontend` menjalankan hanya bagiannya (Jest sendiri: `npm run test:jest` di `backend`). Perintah `npm run test:<nama>` di bawah tetap bisa dipakai untuk satu suite.

**Area yang diuji.** Nama semua suite: `npm test -- --list`. Apa yang diuji tiap suite dijelaskan di komentar header berkasnya.

| Area | Contoh yang diuji |
|---|---|
| Room dan protokol Socket.IO | resume dan reconnect, Host dan Kick, navigasi Room, satu akun satu Room, validasi payload dan `cardIds`, timer giliran, jeda antar-game, jumlah game per set, kode Room |
| Aturan permainan | konsistensi kombinasi server vs klien, perilaku rally/skip di engine, konstanta Room/game dan kesesuaiannya dengan nilai di frontend |
| Database dan konfigurasi | skema berversi dan migrasi, apa yang ditulis ke DB selama set, penutupan Room basi, `JWT_SECRET`, log debug |
| Frontend | state koneksi klien, layout dan posisi kursi, Combo Detector dan Group Chain, Kick, Homepage/Room, pesan error server, nama pemain |
| Dokumentasi dan alat | runner tes itu sendiri, aturan dokumentasi (berkas `.md` yang diizinkan, tautan, variabel env) |

**Satu suite saja.** `npm test -- --only <kata>`; atau langsung: `node tests/<berkas>` atau `npm run test:<nama>` (lihat `package.json`) di `backend`, dan `bash tests/<nama>/run.sh` di `frontend`.

Bagian render pada `lobby-ui`, `combo-ui`, dan `kick-ui` memakai `react-dom/server`. JSX dikompilasi dengan esbuild yang dibawa Vite, jadi **TypeScript tidak dibutuhkan**. Bagian render dilewati (SKIP, exit 0, dengan pesan yang menyebut dependency yang kurang) hanya bila `frontend/node_modules` belum ada. Bila `node_modules` sudah ada tetapi react, react-dom, atau esbuild tidak ditemukan, test **GAGAL** (exit 1) agar tidak ada SKIP diam-diam; jalankan `npm install` di `frontend`.

**Windows / tanpa bash.** Dua tes berikut berjalan hanya dengan Node, tanpa bash dan tanpa environment variable, dari folder mana pun: `npm run test:sync` (atau `node tests/sync.sim/main.mjs`), `npm run test:server-errors` (atau `node tests/server-errors/run.mjs`), dan `npm run test:names` (atau `node tests/player-names/run.mjs`). `node tests/lobby-ui/render.mjs` menjalankan render Homepage/Room, dan bagian render `kick-ui` dan `combo-ui` juga bisa dijalankan langsung (`node tests/kick-ui/render.mjs`, `node tests/combo-ui/render.mjs`). Skrip `run.sh` untuk `game-ui` dan bagian logika `kick-ui`/`combo-ui` masih membutuhkan bash (mis. Git Bash; `combo-ui` membuat symlink). `server-errors` membaca `backend/src` secara otomatis; variabel `BACKEND_SRC` bersifat opsional untuk menimpa lokasinya. `server-errors` mengimpor langsung file ES module `src/utils/serverErrors.js` tanpa `"type": "module"`, jadi bergantung pada deteksi sintaks module otomatis Node 22.x: terbukti jalan di v22.23.4 (sandbox) dan v22.23.1 (Windows, dilaporkan pengguna); versi Node lain belum diuji.

**Opsional (browser nyata):** `frontend/tests/browser/` menguji `GamePage` di Chromium (butuh `esbuild`, Playwright, dan Chromium; lihat `frontend/tests/browser/README.md`).

**Skrip manual:** `node frontend/trace-sockets.js` (backend harus berjalan) mendaftarkan akun `trace1`–`trace4`, membuat Room, dan memulai game. Gagal bila akun tersebut sudah ada.

`test:config` menjalankan `auth/jwt.js` asli: bagian proses boot memakai proses Node anak (dengan `jsonwebtoken` di-stub), dan uji round trip token dengan `jsonwebtoken` asli hanya berjalan bila `npm install` sudah dilakukan di `backend` (bila belum, bagian itu ditampilkan sebagai SKIP).

**Cek manual konfigurasi (PowerShell, dari folder root proyek).** Dijalankan dari root karena `dotenv` membaca `.env` dari folder kerja; dengan begitu `backend/.env` milik Anda tidak ikut terbaca. Butuh `npm run install:all` sudah dilakukan.

```powershell
# 1) production tanpa JWT_SECRET: harus gagal start
$env:NODE_ENV = "production"
Remove-Item Env:JWT_SECRET -ErrorAction SilentlyContinue
node backend/src/server.js
"exit code: $LASTEXITCODE"      # diharapkan: satu baris "[config] FATAL: ...", exit code: 1

# 2) tanpa NODE_ENV dan tanpa JWT_SECRET: harus jalan dengan satu warning
Remove-Item Env:NODE_ENV, Env:JWT_SECRET -ErrorAction SilentlyContinue
node backend/src/server.js      # diharapkan: satu baris "[config] WARNING: ...", lalu "Martil server running on :3001" (hentikan dengan Ctrl+C)
```

`test:db` memakai `node:sqlite` asli (`:memory:` dan folder sementara) dan tidak pernah menyentuh `backend/data/martil.db`.

**Cek manual database milik Anda (PowerShell, dari folder root proyek).** Cadangkan dulu, jalankan server sekali, lalu baca hasilnya:

```powershell
Copy-Item backend\data\martil.db backend\data\martil.db.bak      # cadangan
node backend/src/server.js                                         # lihat satu baris DB_STALE_ROOMS_CLOSED bila ada Room basi; hentikan dengan Ctrl+C
@'
const { DatabaseSync } = require('node:sqlite');
const d = new DatabaseSync('backend/data/martil.db', { readOnly: true });
console.log('user_version:', d.prepare('PRAGMA user_version').get().user_version);
console.log(d.prepare('SELECT status, COUNT(*) AS n FROM rooms GROUP BY status').all());
'@ | node -
# diharapkan: user_version: 1 dan tidak ada lagi Room berstatus waiting/playing
```

`npm test` (root) menjalankan semuanya. Belum teruji otomatis: SQL di `auth/routes.js` (login/register tidak punya tes; SQL `roomManager.js` sudah teruji terhadap SQLite asli di memori lewat harness `memdb`), transport Socket.IO asli, boot `server.js` yang sebenarnya (dua langkah manual di atas), dan perilaku React di browser sungguhan di luar uji render/e2e opsional di atas.

---

## ⏳ Keterbatasan dan Rencana

### Belum tersedia

- **Profil pemain (sebagian):** nama asli pemain sudah tampil (lihat Nama pemain di atas). Yang masih placeholder: level dan koin di meja adalah **data dummy** turunan hash ID (`frontend/src/utils/profile.js`), dan avatar masih siluet bawaan yang sama untuk semua pemain (hanya warna cincinnya yang berbeda). Username belum bisa diganti dan masih case-sensitive.
- **Taruhan/nominal Room:** lencana taruhan di layar Game adalah placeholder; server belum punya data `bet`.
- **Wallet / saldo:** belum ada. Tidak ada saldo, riwayat transaksi, atau pembaruan saldo setelah set.
- **Tombol HINT dan AUTO:** placeholder, nonaktif.
- **Kolom `rooms.max_games`** di database belum punya `CHECK` constraint; batas 3/4/5 hanya dijaga di server (data yang ada saat ini hanya berisi 3, 4, atau 5).
- **Riwayat tersimpan:** tabel `rooms`, `sets`, `games`, `game_scores` hanya ditulis; belum ada fitur yang membacanya. Tabel `room_players` dibuat tetapi belum dipakai. Room yang tersisa `waiting`/`playing` dari proses sebelumnya ditutup saat start; `sets.ended_at` yang NULL (set terputus) dibiarkan apa adanya.
- **State Room/Game hanya di memori server:** hilang bila server restart; hanya mendukung satu proses.
- **Email** pada register diterima server tetapi tidak dikirim dan tidak dipakai UI.

### Checklist production (belum dikerjakan)
- [ ] Set `NODE_ENV=production` dan isi `JWT_SECRET` dengan nilai acak yang panjang (tanpa itu server production menolak start); sesuaikan `CLIENT_URL`
- [ ] Fail-fast juga untuk `PORT`/`CLIENT_URL` di production (saat ini jatuh ke nilai localhost bila kosong) dan buat `frontend/.env.example` untuk `VITE_SERVER_URL`
- [ ] Ganti SQLite dengan database server (mis. PostgreSQL) untuk multi-instance
- [ ] Ganti state Room di memori dengan penyimpanan bersama (mis. Redis)
- [ ] HTTPS (reverse proxy)
- [ ] Rate limiting (mis. `express-rate-limit`) pada login/register
- [ ] Sajikan `frontend/dist/` lewat web server

### Rencana fitur (roadmap)

Spesifikasi arah pengembangan. Poin A sudah selesai, B baru sebagian (nama pemain), dan **C, D, dan E belum ada di kode.**

**A. Posisi pemain di meja. ✅ Selesai.** Pemain sendiri selalu di bawah; pemain yang bermain berikutnya (menurut urutan bergabung ke Room) di kanan, lalu atas, lalu kiri, yaitu berlawanan arah jarum jam. Contoh dari sudut pandang Host: Player 1 bawah, Player 2 kanan, Player 3 atas, Player 4 kiri; dari sudut pandang Player 2: Player 3 kanan, Player 4 atas, Player 1 kiri. Hanya posisi tampilan yang berubah (`seatSides` di `frontend/src/utils/gameLayout.js`, termasuk layout sempit di HP); urutan giliran, validasi, dan ID pemain tidak berubah.

**B. Profil pemain.** *Sudah ada:* nama pemain asli (bukan ID acak). *Belum ada:* avatar, level, dan informasi profil lain. ID internal pemain tetap unik dan tidak bergantung pada username. Informasi publik pemain dikirim lewat backend dengan daftar field yang eksplisit (tanpa email/hash password). **Keputusan:** username nantinya dibuat unik dan tidak membedakan huruf besar/kecil (case-insensitive). Saat ini username masih case-sensitive.

**C. Wallet virtual (hanya untuk uji gameplay).** Saldo awal 20.000 koin virtual. Satu set terdiri dari 3, 4, atau 5 game (opsi 6 sudah dihapus dari UI dan ditolak server). Saldo hanya diperbarui setelah satu set selesai, berdasarkan peringkat akhir. **Nominal Room menskalakan perubahan saldo:**

| Peringkat | Room 5K | Room 10K |
|---|---|---|
| Juara 1 | +5.000 | +10.000 |
| Juara 2 | +3.000 | +6.000 |
| Juara 3 | −3.000 | −6.000 |
| Juara 4 | −5.000 | −10.000 |

Contoh Room 5K dari saldo 20.000: juara 1 menjadi 25.000, juara 2 23.000, juara 3 17.000, juara 4 15.000. Rumus umum untuk nominal selain 5K dan 10K belum ditetapkan.

**D. Validasi saldo Room.** Room akan punya nominal (mis. 5K atau 10K). Pemain hanya boleh membuat/bergabung bila saldo cukup untuk menanggung kerugian maksimal (Room 5K: saldo 4.000 ditolak, 5.000 diterima). Validasi **wajib di backend**, bukan hanya frontend.

**E. Arsitektur Wallet.** Modular dan terpisah dari Game Engine: Wallet Service, saldo pemain, riwayat transaksi (saldo sebelum/sesudah, delta, alasan, ID set, peringkat akhir), dan pencegahan pemrosesan ganda akibat event berulang, refresh, atau reconnect. Saldo adalah koin virtual: **tidak** ada top-up, pembayaran, cash-out, atau integrasi uang sungguhan.

**Belum ditetapkan:** cara menangani peringkat seri (poin total sama) dan perlakuan set yang tidak selesai (mis. Room ditinggalkan). Keduanya perlu diputuskan sebelum wallet (C–E) dikerjakan; status kerjanya ada di [HANDOFF.md](HANDOFF.md).

---

## 🐛 Troubleshooting

**Port sudah dipakai?** Ubah `PORT` di `backend/.env`, lalu sesuaikan **dua** tempat di frontend: target proxy `/api` di `frontend/vite.config.js` dan `VITE_SERVER_URL` (untuk Socket.IO).

**Error `node:sqlite` / database gagal dibuka?** Gunakan Node.js 22.x (versi yang diuji: v22.23.4; versi lain belum diuji). Folder `backend/data/` dibuat otomatis; pastikan backend punya izin tulis. Peringatan "ExperimentalWarning: SQLite" di console adalah normal. Bila server berhenti dengan `[db] FATAL: database schema version N is newer than this server supports`, berarti `martil.db` dibuat oleh versi server yang lebih baru: jalankan versi server yang sesuai atau pakai file database lain (file tidak diubah).

**Koneksi Socket.IO gagal?** Pastikan `CLIENT_URL` di `backend/.env` sama persis dengan URL frontend (hanya satu origin yang diizinkan) dan `VITE_SERVER_URL` menunjuk ke backend.

**Debug lifecycle Room setelah set selesai**
- Backend: log `SET_OVER`, `LEAVE_ROOM_REQUEST`, `ROOM_PLAYER_LEFT`, `SOCKET_DISCONNECTING`.
- Browser DevTools → Console: `SET_OVER_RECEIVED`, `LEAVE_ROOM_CLICKED`, `ROOM_LEFT_CONFIRMED`, `ROOM_UPDATED`.
- Setelah hasil akhir muncul, **Back to Menu Utama** mengirim `leave_room` (state dibersihkan setelah konfirmasi `room_left`), sedangkan **Back to Room** mengirim `return_to_room` (konfirmasi `room_returned`).
- Jika gagal, periksa kode pada log `LEAVE_ROOM_REJECTED` / `LEAVE_ROOM_FAILED`; jangan langsung menghapus data Room secara manual.
