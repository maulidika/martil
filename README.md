# 🃏 Martil — Multiplayer Card Game

Martil adalah game kartu multiplayer online untuk **tepat 4 pemain**, berbasis house rules (bukan varian standar mana pun). Pemain membuat atau bergabung ke Room, memainkan satu *set* yang terdiri dari beberapa game, lalu melihat peringkat akhir. Komunikasi real-time lewat Socket.IO, tampilan mobile-first.

Tujuan proyek: pengalaman bermain yang adil dan stabil (server sebagai sumber kebenaran, tahan refresh dan putus koneksi). Saat ini belum ada uang, saldo, atau taruhan apa pun yang aktif — lihat bagian [Belum tersedia](#-belum-tersedia--placeholder) dan [Roadmap](#-roadmap-rencana--belum-diimplementasikan).

> Dokumen ini ditulis dari kondisi kode yang diperiksa langsung. Bila ada yang berbeda dengan kode, kodelah yang benar — mohon perbarui README.

---

## 📌 Ringkasan Status

| Area | Status |
|---|---|
| Akun (register/login, JWT) | ✅ Tersedia |
| Homepage, Room, Game, Result | ✅ Tersedia |
| Aturan permainan, skor, peringkat set | ✅ Tersedia |
| Combo Detector dan Group Chain (klien) | ✅ Tersedia |
| Reconnect dan pemulihan sesi | ✅ Tersedia |
| Host Kick | ✅ Tersedia |
| Validasi `cardIds`, guard payload Socket.IO, timer giliran yang tidak bisa direset aksi ditolak, perlindungan jeda antar-game | ✅ Tersedia |
| Jumlah game per set: hanya 3, 4, atau 5 (UI dan validasi server) | ✅ Tersedia |
| Nama pemain asli untuk lawan, avatar, level | ⏳ Placeholder (lihat di bawah) |
| Wallet / saldo virtual, validasi saldo Room | ❌ Belum ada (rencana) |
| Posisi visual berlawanan arah jarum jam | ❌ Belum (rencana) |

---

## ⚡ Quick Start

Prasyarat: **Node.js 22.x** dan npm. Backend memakai modul bawaan `node:sqlite`, yang hanya ada di Node.js versi baru. **Satu-satunya versi yang pernah diuji adalah v22.23.4.** Batas versi minimum belum diverifikasi; versi lain (termasuk 22.x yang lebih lama) belum diuji.

```bash
# 1. Masuk ke folder proyek (folder yang berisi package.json root)
cd martil-main

# 2. Install dependency backend + frontend
npm run install:all

# 3. Buat backend/.env (lihat bagian Environment Variable)

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
| Test | Skrip simulasi Node (tanpa framework) + Jest untuk `engine.test.js` + skrip bash untuk frontend |

---

## 📁 Struktur Proyek

```
martil-main/
├── package.json                 ← skrip root (install:all, dev, dev:backend, dev:frontend, build)
├── Patch/                       ← arsip patch lama (riwayat perubahan; tidak dipakai saat menjalankan proyek)
│
├── backend/
│   ├── package.json             ← skrip: start, dev, test, test:sim, test:nav, test:kick, test:combo,
│   │                              test:cardids, test:payload, test:timer, test:intermission, test:maxgames
│   ├── data/                    ← martil.db (SQLite, dibuat otomatis)
│   ├── src/
│   │   ├── server.js            ← entry point Express + Socket.IO
│   │   ├── auth/
│   │   │   ├── jwt.js           ← sign/verify JWT
│   │   │   └── routes.js        ← POST /api/auth/register, /login; GET /api/auth/me
│   │   ├── db/database.js       ← koneksi SQLite + pembuatan tabel (CREATE TABLE IF NOT EXISTS)
│   │   ├── game/
│   │   │   ├── deck.js          ← kartu, urutan rank/suit, shuffle, deal
│   │   │   ├── validator.js     ← deteksi dan perbandingan kombinasi
│   │   │   ├── scorer.js        ← skor game dan peringkat set
│   │   │   ├── cardIds.js       ← validasi bentuk daftar `cardIds` pada play_cards
│   │   │   ├── engine.js        ← state machine satu game (giliran, rally, kemenangan)
│   │   │   └── engine.test.js   ← uji Jest untuk perilaku rally/skip
│   │   ├── rooms/roomManager.js ← Room, set, game, reconnect, Kick (state di memori)
│   │   ├── socket/socketHandler.js ← semua event Socket.IO, timer giliran, sweeper
│   │   └── socket/payload.js    ← guard bentuk payload event Socket.IO
│   └── tests/
│       ├── helpers/sim.js       ← Socket.IO tiruan + jam simulasi untuk uji
│       ├── reconnect.sim.js, room-navigation.sim.js, kick.sim.js
│       ├── card-ids.sim.js, payload-guards.sim.js, turn-timer.sim.js, intermission.sim.js, max-games.sim.js
│       └── combo.consistency.js ← cek aturan kombinasi server vs klien
│
└── frontend/
    ├── package.json, vite.config.js, index.html
    ├── trace-sockets.js         ← skrip manual (butuh backend jalan; lihat bagian Test)
    ├── src/
    │   ├── main.jsx, App.jsx    ← entry dan routing
    │   ├── store/gameStore.js   ← Zustand: auth, koneksi, room, game, hasil set
    │   ├── hooks/useSocket.js   ← satu koneksi Socket.IO + semua listener event
    │   ├── pages/               ← LoginPage, LobbyPage (Homepage + Room), GamePage, ResultPage
    │   ├── components/          ← Modal, ConnectionOverlay, GameSyncWaiting, game/ui.jsx (tampilan meja)
    │   └── utils/               ← comboDetector, comboPicker, groupChain, handUi (logika tangan),
    │                              gameLayout (ukuran/posisi kursi), profile (data profil sementara),
    │                              session, kick (logika murni untuk UI)
    └── tests/                   ← sync.sim, game-ui, combo-ui, kick-ui, lobby-ui (bash), browser (Playwright, opsional)
```

---

## ⚙️ Environment Variable

Buat file `backend/.env` sendiri (file ini di-`.gitignore`, **jangan di-commit** dan jangan menempelkan nilai rahasia ke dokumen/issue). Contoh bentuk, dengan placeholder:

```env
PORT=3001
CLIENT_URL=http://localhost:5173
JWT_SECRET=<isi-dengan-string-acak-yang-panjang>
```

| Variabel | Dipakai di | Default bila kosong | Keterangan |
|---|---|---|---|
| `PORT` | backend | `3001` | Port server HTTP + Socket.IO |
| `CLIENT_URL` | backend | `http://localhost:5173` | **Satu** origin yang diizinkan CORS (REST dan Socket.IO) |
| `JWT_SECRET` | backend | nilai bawaan untuk development di `auth/jwt.js` | **Wajib diisi sendiri di production.** Bila kosong, server tetap berjalan dengan nilai bawaan yang tidak aman |
| `VITE_SERVER_URL` | frontend | `http://localhost:3001` | Alamat Socket.IO yang dituju klien (dibaca saat build/dev Vite) |

Catatan:
- `NODE_ENV` tidak dibaca oleh kode saat ini.
- Request REST (`/api/...`) dari frontend lewat proxy Vite ke `http://localhost:3001` (tertulis di `frontend/vite.config.js`); Socket.IO tidak lewat proxy, melainkan langsung ke `VITE_SERVER_URL`.
- Lokasi database tetap: `backend/data/martil.db` (otomatis dibuat). File ini berisi hash password pemain; jangan dibagikan atau di-commit.

### Data lokal dan rahasia tidak boleh ikut terunggah
`.gitignore` mengecualikan `.env` dan `.env.*` (kecuali `.env.example`), folder `backend/data/`, serta berkas `*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite`, `*.sqlite3`.

`.gitignore` hanya berlaku untuk berkas yang **belum** dilacak git. Bila `backend/data/martil.db` atau sebuah `.env` pernah ter-commit atau ter-push, hentikan pelacakannya (`git rm --cached <berkas>` lalu commit) dan anggap isi yang sudah terunggah telah terbuka: ganti `JWT_SECRET` dan minta pemain mengganti password. Menghapus berkas dari riwayat git membutuhkan langkah terpisah. Saat membagikan ZIP proyek, jangan sertakan `backend/data/`, `.env`, dan `node_modules/`.

---

## 🧭 Alur Aplikasi: Homepage → Room → Game → Result

Empat keadaan ini **berbeda**:

| Keadaan | Route | Komponen | Kapan |
|---|---|---|---|
| **Homepage** (di UI disebut *Menu Utama*) | `/lobby` | `LobbyPage` | Pemain sudah login tetapi belum menjadi anggota Room. Bisa **Buat Room** (pilih jumlah game per set) atau **Gabung** dengan kode 6 karakter. |
| **Room** | `/lobby` | `LobbyPage` | Pemain anggota sebuah Room yang berstatus menunggu. Menampilkan kode Room, 4 kursi, Host: **Mulai Game** dan **Kick**, semua pemain: **Exit Room**. |
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
- Label `+5k / +3k / −3k / −5k` di halaman Result saat ini **hanya teks tampilan**; tidak ada saldo yang berubah (lihat Roadmap).

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

### Validasi input, timer giliran, dan kode error

**Payload.** Setiap handler membaca payload lewat guard (`socket/payload.js`): payload harus berupa objek, dan `roomCode` / `targetId`, bila ada, harus string maksimal 64 karakter. Bentuk yang salah dijawab `INVALID_PAYLOAD` pada kanal yang sama dengan penolakan event itu: `leave_room_error` + `error` untuk `leave_room`, `return_room_error` + `error` untuk `return_to_room`, `kick_error` untuk `kick_player`, dan `error` untuk event lain. Field yang tidak dikirim tetap memakai kode lama (`NOT_IN_ROOM`, `ROOM_NOT_FOUND`). `create_room` tanpa payload tetap diterima. `maxGames` pada `create_room` harus tepat angka 3, 4, atau 5 (string seperti `"4"`, pecahan, `NaN`, `null`, dan nilai lain ditolak `INVALID_MAX_GAMES` tanpa membuat Room dan tanpa mengubah state apa pun). Exception tak terduga di handler ditangkap, dicatat dengan stack di log server, dan pengirim menerima `INTERNAL_ERROR`; server tetap berjalan.

**`cardIds` pada `play_cards`.** Harus berupa array berisi id kartu yang sah (mis. `3D`, `10H`, `2S`), tanpa duplikat, paling banyak 13. Selain itu dijawab `INVALID_CARD_IDS`; tidak ada kartu dikirim tetap `NO_CARDS_SELECTED`. Urutan pemeriksaan engine: `GAME_NOT_ACTIVE`, `NOT_YOUR_TURN`, validasi bentuk `cardIds`, `CARD_NOT_IN_HAND`, lalu aturan kombinasi (`INVALID_COMBO`, `CANNOT_BEAT_TABLE`). Aturan permainan tidak berubah.

**Timer giliran.** `play_cards` dan `skip_turn` divalidasi dulu; timer hanya diganti setelah aksi diterima. Aksi yang ditolak (dari siapa pun) tidak mengubah timer.

**Jeda antar-game.** Dari akhir sebuah game sampai `game_started` dikirim, `play_cards` dan `skip_turn` dijawab `GAME_STARTING` (juga untuk pemain yang bukan gilirannya), auto-skip tidak berjalan, dan resume sesi tidak mengakhiri jeda.

**Kode error yang dikirim server lewat Socket.IO:**

| Kelompok | Kode |
|---|---|
| Umum | `INVALID_PAYLOAD`, `INTERNAL_ERROR`, `NOT_IN_ROOM`, `ROOM_NOT_FOUND`, `NOT_HOST` |
| Room | `INVALID_MAX_GAMES`, `ROOM_FULL`, `GAME_ALREADY_STARTED`, `ALREADY_IN_ROOM`, `ALREADY_STARTED`, `NEED_4_PLAYERS`, `PLAYERS_NOT_READY`, `GAME_IN_PROGRESS` |
| Kick | `CANNOT_KICK_SELF`, `TARGET_NOT_IN_ROOM`, `KICKED_FROM_ROOM` |
| Game | `NO_ACTIVE_GAME`, `GAME_NOT_ACTIVE`, `GAME_STARTING`, `NOT_YOUR_TURN`, `NO_CARDS_SELECTED`, `INVALID_CARD_IDS`, `CARD_NOT_IN_HAND`, `INVALID_COMBO`, `CANNOT_BEAT_TABLE` |

Frontend belum menerjemahkan kode-kode ini: hanya `ResultPage` yang menampilkan error dari server (mentah); Homepage dan Game belum menampilkannya.

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
- Room `waiting`/`done`: pemain terputus > 60 dtk dikeluarkan dan Host berpindah ke pemain terhubung. Room `playing`: kursi dipertahankan (giliran yang lewat di-auto-skip) sampai pemain kembali.
- Pembersih berjalan tiap 10 detik; Room yang ditinggalkan semua pemain > 10 menit ditutup beserta timernya.

Di klien, `ConnectionOverlay` menampilkan "Menghubungkan kembali..." dan berubah menjadi pesan gagal + tombol *Coba lagi* bila lebih dari 20 detik (atau 8 detik tanpa jawaban resume). Layar "Menunggu data game…" meminta ulang state setelah 6 detik dan menampilkan pesan + tombol setelah 15 detik.

### Host Kick
- Hanya Host; tidak bisa mengeluarkan diri sendiri; tidak bisa saat game berlangsung (`GAME_IN_PROGRESS`). Semua validasi di server (`roomManager.kickPlayer`).
- Target berada di **Room** → dihapus dari Room dan menerima `kicked` (kembali ke Menu Utama). Ini bukan ban: boleh bergabung lagi.
- Target masih di **Result** → dihapus dari kursi Room tetapi tetap melihat hasil set, dengan pembatasan (`kicked_from_result`): Back to Room ditolak (`KICKED_FROM_ROOM`) dan ia tidak bisa membuat/bergabung Room sebelum kembali ke Menu Utama (`leave_room`). Pembatasan bertahan setelah refresh/reconnect dan berakhir dengan timeout disconnect yang sama seperti pemain biasa (60 detik).

### Log
Backend mencetak log berawalan `[MARTIL ...]` (mis. `SOCKET_CONNECTED`, `SESSION_RESTORED`, `PLAYER_DISCONNECTED`, `AUTO_SKIP`, `SET_OVER`, `LEAVE_ROOM_REQUEST`, `PLAYER_KICKED`). `engine.js` juga mencetak `[rally-debug]` pada setiap Main/Skip. Di console browser: `SOCKET_CONNECTED/DISCONNECTED`, `SESSION_RESTORED`, `SESSION_NONE`, `SESSION_REPLACED`, `SYNC_FAILED`, `SET_OVER_RECEIVED`, `ROOM_LEFT_CONFIRMED`.

---

## 🧪 Menjalankan Automated Test

Semua uji di bawah berjalan **tanpa browser dan tanpa WebSocket asli**: server diuji lewat Socket.IO tiruan di memori, dengan database di-stub (kode SQL tidak ikut teruji).

**Backend** (dari folder `backend`):
```bash
npm run test:sim     # protokol resume, timer, host, kadaluarsa
npm run test:nav     # satu set penuh dimainkan bot, lalu Back to Room / Exit Room
npm run test:kick    # Host Kick di Room dan di Result
npm run test:cardids # validasi cardIds (duplikat, tipe salah, format) di engine dan lewat socket
npm run test:payload # guard payload semua handler Socket.IO + jaring pengaman INTERNAL_ERROR
npm run test:timer   # aksi ditolak tidak menyentuh timer giliran (spy setTimeout/clearTimeout)
npm run test:intermission  # play/skip ditolak GAME_STARTING selama jeda antar-game
npm run test:maxgames  # maxGames hanya 3/4/5; set 3, 4, dan 5 game selesai tepat waktunya
npm run test:combo   # konsistensi aturan kombinasi server vs klien (±2,6 juta kombinasi)
npm test             # Jest (butuh npm install): saat ini hanya src/game/engine.test.js
```

**Frontend** (dari folder `frontend`):
```bash
bash tests/sync.sim/run.sh    # state machine koneksi klien (socket, react, router palsu)
bash tests/game-ui/run.sh     # layout, posisi kursi, profil sementara, format koin
bash tests/combo-ui/run.sh    # Combo Detector + Group Chain; smoke test render GamePage
bash tests/kick-ui/run.sh     # logika Kick; render ResultPage/LobbyPage
bash tests/lobby-ui/run.sh    # render Homepage: pilihan jumlah game per set hanya 3, 4, 5
```
Bagian render pada `lobby-ui`, `combo-ui`, dan `kick-ui` memakai `react-dom/server`. JSX dikompilasi dengan esbuild yang dibawa Vite, jadi **TypeScript tidak dibutuhkan**. Bagian render dilewati (SKIP, exit 0, dengan pesan yang menyebut dependency yang kurang) hanya bila `frontend/node_modules` belum ada. Bila `node_modules` sudah ada tetapi react, react-dom, atau esbuild tidak ditemukan, test **GAGAL** (exit 1) agar tidak ada SKIP diam-diam; jalankan `npm install` di `frontend`.

**Opsional (browser nyata):** `frontend/tests/browser/` menguji `GamePage` di Chromium (butuh `esbuild`, Playwright, dan Chromium; lihat `frontend/tests/browser/README.md`).

**Skrip manual:** `node frontend/trace-sockets.js` (backend harus berjalan) mendaftarkan akun `trace1`–`trace4`, membuat Room, dan memulai game. Gagal bila akun tersebut sudah ada.

Belum ada satu perintah `npm test` yang menjalankan semuanya. Belum teruji otomatis: lapisan database, transport Socket.IO asli, dan perilaku React di browser sungguhan di luar uji render/e2e opsional di atas.

---

## ⏳ Belum Tersedia / Placeholder

- **Profil pemain:** nama lawan di Room, Game, dan Result masih potongan ID acak (6–8 karakter); server belum mengirim username pemain lain. Level dan koin yang tampil di meja adalah **data dummy** turunan hash ID (`frontend/src/utils/profile.js`); avatar masih siluet bawaan yang sama untuk semua pemain (hanya warna cincinnya yang berbeda).
- **Taruhan/nominal Room:** lencana taruhan di layar Game adalah placeholder; server belum punya data `bet`.
- **Wallet / saldo:** belum ada. Tidak ada saldo, riwayat transaksi, atau pembaruan saldo setelah set.
- **Tombol HINT dan AUTO:** placeholder, nonaktif.
- **Kolom `rooms.max_games`** di database belum punya `CHECK` constraint; batas 3/4/5 hanya dijaga di server (data yang ada saat ini hanya berisi 3, 4, atau 5).
- **Pesan error dari server:** belum ditampilkan di Homepage dan Game (hanya Result, dalam kode mentah).
- **Riwayat tersimpan:** tabel `rooms`, `sets`, `games`, `game_scores` hanya ditulis; belum ada fitur yang membacanya. Tabel `room_players` dibuat tetapi belum dipakai.
- **State Room/Game hanya di memori server:** hilang bila server restart; hanya mendukung satu proses.
- **Email** pada register diterima server tetapi tidak dikirim dan tidak dipakai UI.
- `ioredis` dan dependency `martil: file:..` tercantum di `package.json` tetapi tidak dipakai kode.

### Checklist production (belum dikerjakan)
- [ ] Isi `JWT_SECRET` dengan nilai acak yang panjang dan sesuaikan `CLIENT_URL`
- [ ] Ganti SQLite dengan database server (mis. PostgreSQL) untuk multi-instance
- [ ] Ganti state Room di memori dengan penyimpanan bersama (mis. Redis)
- [ ] HTTPS (reverse proxy)
- [ ] Rate limiting (mis. `express-rate-limit`) pada login/register
- [ ] Sajikan `frontend/dist/` lewat web server

---

## 🗺️ Roadmap (rencana — BELUM diimplementasikan)

Bagian ini hanya mendokumentasikan arah pengembangan. **Tidak satu pun poin di bawah sudah ada di kode.**

**A. Posisi pemain di meja.** Tampilan sudah memakai empat posisi (pemain utama di bawah, lawan kiri/atas/kanan). Rencana: arah posisi visual mengelilingi meja menjadi **berlawanan arah jarum jam**. Hanya pemetaan posisi visual yang berubah; urutan giliran dan validasi permainan tidak berubah.

**B. Profil pemain.** Tampilkan nama pemain asli (bukan ID acak), avatar, level, dan informasi profil. ID internal pemain tetap unik dan tidak bergantung pada username. Informasi publik pemain dikirim lewat backend dengan daftar field yang eksplisit (tanpa email/hash password). **Keputusan:** username nantinya dibuat unik dan tidak membedakan huruf besar/kecil (case-insensitive). Saat ini username masih case-sensitive.

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

**Belum diputuskan (jangan diasumsikan dan jangan diimplementasikan dulu):** cara menangani peringkat seri (poin total sama) dan perlakuan set yang tidak selesai (mis. Room ditinggalkan).

---

## 🐛 Troubleshooting

**Port sudah dipakai?** Ubah `PORT` di `backend/.env`, lalu sesuaikan **dua** tempat di frontend: target proxy `/api` di `frontend/vite.config.js` dan `VITE_SERVER_URL` (untuk Socket.IO).

**Error `node:sqlite` / database gagal dibuka?** Gunakan Node.js 22.x (versi yang diuji: v22.23.4; versi lain belum diuji). Folder `backend/data/` dibuat otomatis; pastikan backend punya izin tulis. Peringatan "ExperimentalWarning: SQLite" di console adalah normal.

**Koneksi Socket.IO gagal?** Pastikan `CLIENT_URL` di `backend/.env` sama persis dengan URL frontend (hanya satu origin yang diizinkan) dan `VITE_SERVER_URL` menunjuk ke backend.

**Debug lifecycle Room setelah set selesai**
- Backend: log `SET_OVER`, `LEAVE_ROOM_REQUEST`, `ROOM_PLAYER_LEFT`, `SOCKET_DISCONNECTING`.
- Browser DevTools → Console: `SET_OVER_RECEIVED`, `LEAVE_ROOM_CLICKED`, `ROOM_LEFT_CONFIRMED`, `ROOM_UPDATED`.
- Setelah hasil akhir muncul, **Back to Menu Utama** mengirim `leave_room` (state dibersihkan setelah konfirmasi `room_left`), sedangkan **Back to Room** mengirim `return_to_room` (konfirmasi `room_returned`).
- Jika gagal, periksa kode pada log `LEAVE_ROOM_REJECTED` / `LEAVE_ROOM_FAILED`; jangan langsung menghapus data Room secara manual.
