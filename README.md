# 🃏 Martil — Multiplayer Card Game

Game kartu multiplayer online untuk tepat 4 pemain, berbasis house rules. Real-time via Socket.IO, mobile-first.

---

## ⚡ Quick Start (Cara Tercepat)

```bash
# 1. Masuk ke folder proyek
cd martil

# 2. Install semua dependency (backend + frontend)
npm run install:all

# 3. Jalankan backend dan frontend sekaligus
npm run dev
```

Buka browser:
- **Frontend** → http://localhost:5173
- **Backend API** → http://localhost:3001/health

> **Catatan Windows:** `npm run dev` di atas menggunakan `&` (background process) yang berjalan di Unix/macOS. Di Windows, buka dua terminal terpisah dan jalankan `npm run dev:backend` dan `npm run dev:frontend` masing-masing.

---

## 📁 Struktur Proyek

```
martil/
├── package.json              ← root scripts (install:all, dev, dll)
│
├── backend/
│   ├── package.json
│   ├── .env                  ← konfigurasi (sudah ada, siap pakai)
│   ├── data/                 ← SQLite database (dibuat otomatis saat pertama run)
│   └── src/
│       ├── server.js         ← entry point Express + Socket.IO
│       ├── auth/
│       │   ├── jwt.js        ← sign/verify JWT
│       │   └── routes.js     ← POST /api/auth/register, /login, GET /me
│       ├── db/
│       │   └── database.js   ← SQLite setup + migrasi otomatis
│       ├── game/
│       │   ├── deck.js       ← kartu, shuffle, deal, compareCards
│       │   ├── validator.js  ← deteksi & perbandingan kombinasi
│       │   ├── scorer.js     ← kalkulasi poin semua aturan
│       │   └── engine.js     ← state machine game (authoritative)
│       ├── rooms/
│       │   └── roomManager.js← lifecycle room, set, game
│       └── socket/
│           └── socketHandler.js ← semua event Socket.IO + timer
│
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx          ← React entry point
        ├── App.jsx           ← routing (react-router-dom)
        ├── store/
        │   └── gameStore.js  ← Zustand global state
        ├── hooks/
        │   └── useSocket.js  ← koneksi Socket.IO + semua event
        ├── utils/
        │   └── comboDetector.js ← client-side combo detection
        └── pages/
            ├── LoginPage.jsx ← register / login
            ├── LobbyPage.jsx ← buat / gabung room
            ├── GamePage.jsx  ← layar game utama
            └── ResultPage.jsx← hasil akhir set
```

---

## 🛠️ Install Manual (jika mau terpisah)

```bash
# Terminal 1 — Backend
cd martil/backend
npm install
npm run dev
# Server berjalan di http://localhost:3001

# Terminal 2 — Frontend
cd martil/frontend
npm install
npm run dev
# Buka http://localhost:5173
```

---

## ⚙️ Konfigurasi

File `backend/.env` sudah tersedia dengan nilai default untuk development:

```env
PORT=3001
JWT_SECRET=martil-super-secret-change-in-production
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

> **Untuk production:** ganti `JWT_SECRET` dengan nilai acak yang panjang, dan sesuaikan `CLIENT_URL` dengan domain frontend kamu.

---

## 🃏 Cara Bermain

1. Buka http://localhost:5173
2. Daftar akun (register) atau masuk (login)
3. Buat room baru → bagikan kode 6 karakter ke 3 teman
4. Teman-teman join dengan kode tersebut
5. Host klik **Mulai Game** saat 4 pemain sudah masuk
6. Pilih kartu di tangan → klik **Main** atau **Skip**

---

## 📏 Aturan Lengkap

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

### Kekuatan Paketan (rendah → tinggi)
1. Straight
2. Flush
3. Full House *(dibandingkan dari Three of a Kind)*
4. Four of a Kind + 1 kicker bebas
5. Straight Flush
6. Royal Flush

### Straight Valid / Tidak Valid
- ✅ Valid: `A-2-3-4-5`, `2-3-4-5-6`, `10-J-Q-K-A`
- ❌ Tidak valid: `J-Q-K-A-2`, `Q-K-A-2-3`, `K-A-2-3-4`
- **Kekuatan straight** dinilai dari kartu paling kanan pada urutan yang ditulis: `A-2-3-4-5` (terkecil, dihitung 5) < `2-3-4-5-6` (dihitung 6) < `3-4-5-6-7` < … < `10-J-Q-K-A` (terbesar). Berlaku juga untuk Straight Flush; jika kartu ujungnya sama rank, suit kartu ujung yang menentukan.
- Di meja, A-2-3-4-5 dan 2-3-4-5-6 ditampilkan berurutan seperti ditulis (`displayOrder` di `comboDetector.js`); urutan kartu di tangan (3…K-A-2) dan data dari server tidak berubah.
- Aturan ini harus identik di `backend/src/game/validator.js` dan `frontend/src/utils/comboDetector.js`; `npm run test:combo` (folder backend) memeriksa ±2,6 juta kombinasi di kedua sisi.

### Sistem Giliran
- Pemain bisa **Main** atau **Skip**
- Jika 3 pemain lain Skip → rally selesai, meja bersih, pemain terakhir main bebas
- Timer 30 detik per giliran → auto-skip jika habis

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

### Peringkat Set
Poin terkecil = Juara 1. Contoh pembagian hasil: +5k / +3k / -3k / -5k

---

## 🔧 Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | Node.js, Express, Socket.IO |
| Database | SQLite (better-sqlite3) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Frontend | React 18, Vite |
| State | Zustand |
| Routing | react-router-dom |
| Real-time | socket.io-client |

---

## 🚀 Production Checklist

- [ ] Ganti `JWT_SECRET` di `.env`
- [ ] Ganti SQLite dengan PostgreSQL untuk multi-instance
- [ ] Ganti in-memory room state dengan Redis
- [ ] Tambah HTTPS (nginx reverse proxy)
- [ ] Tambah rate limiting (`express-rate-limit`)
- [ ] Build frontend: `npm run build` → serve `frontend/dist/`
- [ ] Deploy ke Railway, Fly.io, Render, atau VPS

---

## 🔌 Reconnect & Pemulihan Sesi

Backend adalah sumber kebenaran. Setiap kali socket tersambung (login, refresh, atau reconnect otomatis), klien mengirim `resume_session`; server mencari room pemain berdasarkan akun (bukan kode room) dan membalas:

| Event server → klien | Arti |
|---|---|
| `session_restored` | (`view`: `game` / `result` / `room` ditentukan server) Snapshot lengkap (status room, kartu, giliran, meja, `timeLeft`, `setResult` bila Scoreboard). Klien menimpa seluruh state lalu pindah ke `/lobby`, `/game`, atau `/result` sesuai status. |
| `session_none` `{reason}` | Tidak ada sesi: `NO_ROOM`, `EXPIRED` (terputus > 60 dtk di room waiting/done), atau `ROOM_CLOSED` (semua pemain terputus > 10 menit). |
| `session_replaced` | Akun yang sama mengambil alih dari tab/perangkat lain. Tab lama melihat overlay dengan tombol "Pakai di tab ini". |
| `player_disconnected` / `player_reconnected` | Hanya dikirim ke pemain lain; resume tidak mengirim ulang kartu atau state ke mereka. |

Aturan server:
- Satu pemain punya satu socket aktif per room; disconnect dari socket lama tidak menandai pemain terputus.
- `start_game`, `play_cards`, `skip_turn` ditolak (`NOT_IN_ROOM`) dari socket yang belum dipulihkan.
- Room `waiting`/`done`: pemain terputus > 60 dtk dikeluarkan dan host berpindah ke pemain terhubung. Room `playing`: kursi dipertahankan (giliran yang lewat di-auto-skip) sampai pemain kembali.
- Pembersih berjalan tiap 10 detik; room yang ditinggalkan semua pemain > 10 menit ditutup beserta timernya.

Di klien, `ConnectionOverlay` menampilkan "Menghubungkan kembali..." dan berubah menjadi pesan gagal + tombol *Coba lagi* bila lebih dari 20 detik (atau 8 detik tanpa jawaban resume). Layar "Menunggu data game…" tidak lagi menggantung: setelah 6 detik meminta ulang state, setelah 15 detik menampilkan pesan dan tombol.

Log penting (backend, awalan `[MARTIL ...]`): `SOCKET_CONNECTED`, `SOCKET_DISCONNECTING`, `PLAYER_DISCONNECTED`, `DISCONNECT_IGNORED`, `SESSION_RESTORED`, `SESSION_RESUME_REJECTED`, `ROOM_PLAYER_EXPIRED`, `ROOM_HOST_CHANGED`, `ROOM_ROOM_ABANDONED`, `AUTO_SKIP`. Di console browser: `SOCKET_CONNECTED/DISCONNECTED`, `SESSION_RESTORED`, `SESSION_NONE`, `SESSION_REPLACED`, `SYNC_FAILED`.

Uji otomatis (tanpa browser, tanpa WebSocket asli):
```bash
cd backend  && npm run test:sim        # server: protokol resume, timer, host, kadaluarsa
cd frontend && bash tests/sync.sim/run.sh   # klien: state machine koneksi
```

---

## 🧭 Navigasi Room, Scoreboard, dan Exit Room

| Aksi | Tempat | Event | Hasil |
|---|---|---|---|
| **Exit Room** | Room (sebelum game mulai) | `leave_room` | Pemain keluar dengan sengaja → Menu Utama. Host berpindah ke pemain terhubung; room dihapus bila kosong. Pemain lain tidak disconnect. |
| **Back to Room** | Scoreboard | `return_to_room` | Tetap anggota room. Panggilan pertama mereset room ke `waiting` (skor/riwayat set lama dibersihkan); pemain lain yang masih di Scoreboard tetap melihat hasil bekunya. |
| **Back to Menu Utama** | Scoreboard | `leave_room` | Keluar dari room sepenuhnya → Menu Utama (membuat/bergabung room baru). |

- `leave_room` dan `return_to_room` ditolak saat game berjalan (`GAME_IN_PROGRESS`).
- Setelah set selesai, semua pemain bertanda *belum kembali* (`inRoom=false`) sampai menekan Back to Room; host baru bisa memulai set berikutnya bila keempat pemain sudah kembali (`PLAYERS_NOT_READY` bila belum).
- Room berstatus selesai yang punya kursi kosong tetap bisa dimasuki pemain baru (room kembali ke `waiting`).
- Hasil set (peringkat, skor, riwayat 4 game) dibekukan di server (`setResult`) dan di klien, sehingga Scoreboard tidak berubah saat pemain lain mereset room dan tetap bisa dipulihkan setelah refresh (`view: 'result'`).
- Log: `LEAVE_ROOM_REQUEST/REJECTED`, `ROOM_PLAYER_LEFT`, `ROOM_HOST_TRANSFERRED`, `ROOM_DELETED`, `RETURN_TO_ROOM_REQUEST/REJECTED`, `RETURN_TO_ROOM`, `ROOM_RESET_FOR_NEW_SET`, `JOIN_ROOM`.

Uji otomatis tambahan (folder `backend`): `npm run test:nav` (satu set penuh dimainkan bot, lalu skenario Back to Room / Exit Room), `npm run test:combo` (konsistensi aturan kombinasi server vs klien).

---

## 🐛 Troubleshooting

**Port sudah dipakai?**
```bash
# Ganti port di backend/.env
PORT=3002
# dan di frontend/vite.config.js
proxy: { '/api': { target: 'http://localhost:3002' } }
```

**SQLite error?**
Folder `backend/data/` dibuat otomatis saat server pertama kali berjalan. Pastikan backend memiliki izin tulis.

**Koneksi Socket.IO gagal?**
Pastikan `CLIENT_URL` di `backend/.env` sesuai dengan URL frontend yang berjalan.

**Debug lifecycle room setelah set selesai**
- Backend menampilkan log berawalan `[MARTIL ...]`, misalnya `SET_OVER`, `LEAVE_ROOM_REQUEST`, `ROOM_PLAYER_LEFT`, dan `SOCKET_DISCONNECTING`.
- Browser DevTools → Console menampilkan `SET_OVER_RECEIVED`, `LEAVE_ROOM_CLICKED`, `ROOM_LEFT_CONFIRMED`, serta perubahan `ROOM_UPDATED`.
- Setelah hasil akhir muncul, **Back to Menu Utama** mengirim `leave_room` (state dibersihkan setelah konfirmasi `room_left`), sedangkan **Back to Room** mengirim `return_to_room` (konfirmasi `room_returned`).
- Jika gagal, periksa kode pada log `LEAVE_ROOM_REJECTED` / `LEAVE_ROOM_FAILED`; jangan langsung menghapus data room secara manual.
