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
- ❌ Tidak valid: `J-Q-K-A-2`, `Q-K-A-2-3`

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
- Setelah hasil akhir muncul, tombol **Kembali ke Lobby** mengirim event `leave_room`. Frontend baru membersihkan state dan berpindah ke `/lobby` setelah menerima konfirmasi `room_left` dari backend.
- Jika gagal, periksa kode pada log `LEAVE_ROOM_REJECTED` / `LEAVE_ROOM_FAILED`; jangan langsung menghapus data room secara manual.
