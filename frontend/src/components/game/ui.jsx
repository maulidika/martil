// Komponen presentasi halaman Game (tema meja kartu biru). Murni tampilan: tidak membaca store/socket,
// semua data dan handler datang lewat props dari pages/GamePage.jsx.
import React from 'react'
import { SUIT_SYM, IS_RED } from '../../utils/comboDetector'
import { CARD_RATIO } from '../../utils/gameLayout'
import { formatCoins } from '../../utils/profile'

export const T = {
  font: "'Segoe UI','Helvetica Neue',Arial,sans-serif",
  text: '#f2f7ff', muted: '#9db8d6', gold: '#ffd23f', green: '#46e060', accent: '#ff5a6e',
  glass: 'rgba(6,22,46,0.72)', glassBorder: 'rgba(130,190,255,0.28)',
}

/* ── Meja ─────────────────────────────────────────────────── */

// Tekstur halus (noise) sebagai data-URI SVG: tanpa jaringan, tanpa file gambar.
const NOISE = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .09 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`

/** Permukaan meja: gradasi biru, tekstur, vinyet, pita gelap di area tangan, dan watermark Martil di tengah. */
export function TableSurface({ logoSize }) {
  const layer = { position: 'absolute', inset: 0, pointerEvents: 'none' }
  return (
    <>
      <div aria-hidden style={{ ...layer, background: 'radial-gradient(ellipse 85% 75% at 50% 42%, #2b7fc4 0%, #1b5f9f 38%, #0f3d73 72%, #081f45 100%)' }} />
      <div aria-hidden style={{ ...layer, backgroundImage: NOISE, backgroundSize: '180px 180px', mixBlendMode: 'overlay', opacity: 0.9 }} />
      <div aria-hidden style={{ ...layer, background: 'radial-gradient(ellipse 120% 100% at 50% 50%, transparent 55%, rgba(2,10,28,0.55) 100%)' }} />
      <div aria-hidden style={{ ...layer, top: 'auto', height: '46%', background: 'linear-gradient(to top, rgba(3,14,34,0.55), rgba(3,14,34,0))' }} />
      <div aria-hidden style={{ ...layer, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '6%' }}>
        <svg width={logoSize} height={logoSize} viewBox="0 0 120 130" style={{ opacity: 0.13 }}>
          <path d="M60 6 C60 6 12 44 12 74 C12 92 26 100 40 96 C46 94 50 90 52 86 C52 100 48 112 38 122 L82 122 C72 112 68 100 68 86 C70 90 74 94 80 96 C94 100 108 92 108 74 C108 44 60 6 60 6 Z" fill="#cfe6ff" />
          <text x="60" y="76" textAnchor="middle" fontFamily="Georgia,serif" fontWeight="900" fontSize="22" fill="#0f3d73">MARTIL</text>
        </svg>
      </div>
    </>
  )
}

/* ── Profil ───────────────────────────────────────────────── */

function Silhouette({ tint }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <defs><linearGradient id="sil" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c3cfdd" /><stop offset="1" stopColor="#7e8ea3" /></linearGradient></defs>
      <rect width="100" height="100" fill="#0e2b4f" />
      <circle cx="50" cy="38" r="18" fill="url(#sil)" />
      <path d="M16 100 C16 66 84 66 84 100 Z" fill="url(#sil)" />
      <circle cx="50" cy="50" r="49" fill="none" stroke={tint} strokeWidth="2" opacity="0.55" />
    </svg>
  )
}

/** Avatar bulat dengan cincin; saat giliran aktif, cincin menjadi penghitung waktu (hijau = sisa waktu). */
export function Avatar({ size, tint, active, ringPct = 100, offline }) {
  const ring = Math.max(4, Math.round(size * 0.08))
  return (
    <div style={{
      width: size + ring * 2, height: size + ring * 2, borderRadius: '50%', flexShrink: 0, padding: ring, boxSizing: 'border-box',
      background: active ? `conic-gradient(${ringPct <= 33 ? T.accent : T.green} ${ringPct}%, rgba(5,20,44,0.65) 0)` : 'linear-gradient(145deg, rgba(190,220,255,0.55), rgba(40,80,130,0.55))',
      boxShadow: active ? `0 0 ${Math.round(size * 0.4)}px ${Math.round(size * 0.08)}px rgba(70,224,96,0.38)` : '0 3px 10px rgba(0,0,0,0.4)',
      opacity: offline ? 0.55 : 1, filter: offline ? 'grayscale(0.8)' : 'none',
    }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(8,24,52,0.85)' }}>
        <Silhouette tint={tint} />
      </div>
    </div>
  )
}

export function Coin({ size }) {
  return (
    <span aria-hidden style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'radial-gradient(circle at 35% 30%, #fff1a8 0%, #ffd23f 45%, #d9901a 100%)',
      border: `${Math.max(1, Math.round(size * 0.09))}px solid #a8680c`, boxSizing: 'border-box',
      boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.25)',
    }} />
  )
}

export function CoinChip({ amount, font }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: Math.round(font * 0.3), padding: `${Math.round(font * 0.12)}px ${Math.round(font * 0.55)}px ${Math.round(font * 0.12)}px ${Math.round(font * 0.15)}px`,
      borderRadius: 999, background: T.glass, border: `1px solid ${T.glassBorder}`, fontFamily: T.font, fontWeight: 800, fontSize: font, color: T.gold, lineHeight: 1.15,
    }}>
      <Coin size={Math.round(font * 1.25)} />{formatCoins(amount)}
    </span>
  )
}

export function LevelBadge({ level, font }) {
  return (
    <span style={{
      fontFamily: T.font, fontWeight: 800, fontSize: Math.round(font * 0.86), color: '#fff', lineHeight: 1.2,
      padding: `1px ${Math.round(font * 0.5)}px`, borderRadius: 999, border: '1px solid rgba(255,255,255,0.4)',
      background: 'linear-gradient(#35c455,#1a7f34)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    }}>Lv.{level}</span>
  )
}

export function NamePill({ name, font, maxWidth }) {
  return (
    <span title={name} style={{
      fontFamily: T.font, fontSize: font, fontWeight: 600, color: T.text, padding: `1px ${Math.round(font * 0.8)}px`, maxWidth, boxSizing: 'border-box',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: 999, background: 'rgba(6,22,46,0.62)', lineHeight: 1.35,
    }}>{name}</span>
  )
}

/** Tumpukan kartu tertutup dengan jumlah kartu yang tersisa. */
export function CardStack({ count, w }) {
  const h = Math.round(w * 1.4)
  const back = {
    position: 'absolute', inset: 0, borderRadius: Math.round(w * 0.09), boxSizing: 'border-box',
    background: 'repeating-linear-gradient(0deg, #e8f1fb 0 3px, #bcd3ea 3px 4px)', border: '2px solid #f4f9ff',
    boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
  }
  return (
    <div role="img" aria-label={`${count} kartu`} style={{ position: 'relative', width: w + 4, height: h + 4, flexShrink: 0 }}>
      {[4, 2, 0].map(o => <div key={o} style={{ ...back, transform: `translate(${o}px, ${o}px)`, opacity: o ? 0.75 : 1 }} />)}
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: Math.round(w * 0.1) }}>
        <span style={{ fontFamily: T.font, fontWeight: 900, fontSize: Math.round(w * 0.5), color: '#1e63b3', background: 'rgba(255,255,255,0.9)', borderRadius: 6, padding: '0 5px', lineHeight: 1.15, boxShadow: '0 0 0 2px #7fb2e8 inset' }}>{count}</span>
      </div>
    </div>
  )
}

/**
 * Kursi lawan. `side` menentukan orientasi: kartu tertutup berada di sisi luar (dekat tepi layar),
 * sehingga terasa duduk mengelilingi meja.
 */
export function PlayerSeat({ side, profile, cardCount, score, active, ringPct, timeLeft, connected = true, size, font, compact }) {
  const stack = <CardStack count={cardCount} w={Math.round(size * (compact ? 0.6 : 0.78))} />
  // Lencana level/koin ada di sisi dalam (menghadap meja), kartu tertutup di sisi luar (dekat tepi layar).
  const chipSide = side === 'left' ? 'right' : 'left'
  const edge = (px) => ({ [chipSide]: -Math.round(px) })
  const block = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: Math.round(font * 0.25) }}>
      <div style={{ position: 'relative' }}>
        <Avatar size={size} tint={profile.tint} active={active} ringPct={ringPct} offline={!connected} />
        {!compact && (
          <>
            <span style={{ position: 'absolute', top: Math.round(size * 0.12), ...edge(size * 0.34) }}><LevelBadge level={profile.level} font={font} /></span>
            <span style={{ position: 'absolute', top: Math.round(size * 0.12 + font * 1.7), ...edge(size * 0.46) }}><CoinChip amount={profile.coins} font={font} /></span>
          </>
        )}
        {active && timeLeft != null && (
          <span aria-label="sisa waktu" style={{ position: 'absolute', [chipSide === 'right' ? 'left' : 'right']: -Math.round(font * 0.6), bottom: 0, fontFamily: T.font, fontWeight: 800, fontSize: font, color: ringPct <= 33 ? T.accent : '#fff', background: T.glass, borderRadius: 999, padding: '0 6px', border: `1px solid ${T.glassBorder}` }}>{timeLeft}s</span>
        )}
      </div>
      <NamePill name={profile.name} font={font} maxWidth={Math.round(size * (compact ? 1.5 : 1.9))} />
      {compact && <CoinChip amount={profile.coins} font={Math.round(font * 0.85)} />}
      <span style={{ fontFamily: T.font, fontSize: Math.round(font * 0.85), color: T.muted, minHeight: Math.round(font * 1.1) }}>
        {!connected ? 'terputus' : score != null ? `${score}pt` : ''}
      </span>
    </div>
  )
  return (
    <div data-seat={side} style={{ display: 'flex', alignItems: 'flex-start', gap: Math.round(size * (compact ? 0.1 : 0.18)) }}>
      {side === 'left' || (compact && side === 'top') ? <>{stack}{block}</> : <>{block}{stack}</>}
    </div>
  )
}

/** Profil pemain utama di bawah tangan. */
export function MyBadge({ profile, cardCount, score, active, ringPct, timeLeft, size, font }) {
  return (
    <div data-seat="me" style={{ display: 'flex', alignItems: 'center', gap: Math.round(size * 0.22) }}>
      <Avatar size={size} tint={profile.tint} active={active} ringPct={ringPct} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: Math.round(font * 0.25), alignItems: 'flex-start' }}>
        <NamePill name={profile.name} font={font} maxWidth={Math.round(size * 3)} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <LevelBadge level={profile.level} font={font} />
          <CoinChip amount={profile.coins} font={font} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span aria-label="sisa kartu" style={{ fontFamily: T.font, fontWeight: 900, fontSize: Math.round(font * 1.5), color: '#fff', background: 'linear-gradient(#2f7fd0,#1b4f94)', borderRadius: 8, padding: '0 8px', border: '1px solid rgba(255,255,255,0.5)' }}>{cardCount}</span>
        {active && timeLeft != null && <span style={{ fontFamily: T.font, fontWeight: 800, fontSize: font, color: ringPct <= 33 ? T.accent : T.green }}>{timeLeft}s</span>}
        {score != null && <span style={{ fontFamily: T.font, fontSize: Math.round(font * 0.85), color: T.muted }}>{score}pt</span>}
      </div>
    </div>
  )
}

/* ── Kartu ────────────────────────────────────────────────── */

/**
 * Kartu bermain: rank + simbol di pojok kiri-atas, simbol besar di kanan-bawah (mudah dibaca saat bertumpuk).
 * `step` = fraksi lebar yang terlihat; kartu terpilih terangkat `lift` px; kartu dalam grup berwarna agak abu-abu.
 */
export function PlayingCard({ card, w, selected, grouped, overlap, step = 0.74, lift = 0, onTap, innerRef }) {
  const h = Math.round(w * CARD_RATIO)
  const red = IS_RED[card.suit]
  const ink = grouped && !selected ? (red ? '#a0524d' : '#3c4452') : (red ? '#d3202f' : '#14161c')
  const twoDigits = card.rank.length > 1
  return (
    <div
      ref={innerRef}
      data-card={card.id}
      onClick={onTap}
      style={{
        position: 'relative', width: w, height: h, flexShrink: 0, boxSizing: 'border-box', overflow: 'hidden',
        marginLeft: overlap ? -Math.round(w * (1 - step)) : 0,
        borderRadius: Math.max(5, Math.round(w * 0.1)),
        background: selected ? 'linear-gradient(160deg,#fffdf2,#ffeeb0)' : grouped ? 'linear-gradient(160deg,#d3d9e2,#b4bdca)' : 'linear-gradient(160deg,#ffffff,#eef2f7)',
        border: selected ? '2px solid #ffc933' : `1px solid ${grouped ? '#8f9aab' : '#c5cfdb'}`,
        boxShadow: selected ? '0 0 0 2px rgba(255,201,51,0.45), 0 12px 22px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.38)',
        transform: selected ? `translateY(-${lift}px)` : 'translateY(0)',
        transition: 'transform 0.14s ease, box-shadow 0.14s ease',
        zIndex: selected ? 10 : 1, cursor: onTap ? 'pointer' : 'default', color: ink, fontFamily: T.font,
      }}
    >
      <div style={{ position: 'absolute', left: Math.round(w * 0.08), top: Math.round(w * 0.05), display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
        <span style={{ fontSize: Math.round(w * (twoDigits ? 0.34 : 0.42)), fontWeight: 800, letterSpacing: twoDigits ? '-0.06em' : 0 }}>{card.rank}</span>
        <span style={{ fontSize: Math.round(w * 0.24), marginTop: Math.round(w * 0.02) }}>{SUIT_SYM[card.suit]}</span>
      </div>
      <span aria-hidden style={{ position: 'absolute', right: Math.round(w * 0.05), bottom: Math.round(w * 0.0), fontSize: Math.round(w * 0.74), lineHeight: 1 }}>{SUIT_SYM[card.suit]}</span>
    </div>
  )
}

/* ── Kontrol ──────────────────────────────────────────────── */

const pill = (extra) => ({
  fontFamily: T.font, fontWeight: 700, borderRadius: 999, cursor: 'pointer', color: '#7fd0ff',
  background: 'linear-gradient(#0e3156,#07182e)', border: `1px solid ${T.glassBorder}`, boxShadow: '0 3px 8px rgba(0,0,0,0.35)',
  ...extra,
})

/** Combo Detector: jenis kombinasi yang bisa dibentuk dari tangan (dek utama + grup). */
export function DetectorPills({ types, activePick, available, onPick, compact, font, maxHeight }) {
  if (!types.length) return null
  const layout = compact
    ? { display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 2px 8px' }
    : { display: 'grid', gridTemplateColumns: '1fr', gap: 6, maxHeight, overflowY: 'auto', padding: 2 }
  return (
    <div data-testid="detector" style={layout}>
      {types.map(t => {
        const on = activePick?.type === t.key
        return (
          <button key={t.key} onClick={() => onPick(t.key)} title={`Pilih ${t.label} (klik lagi: berikutnya)`}
            style={pill({
              flexShrink: 0, padding: `${Math.round(font * 0.55)}px ${Math.round(font * 0.9)}px`, fontSize: font, whiteSpace: 'nowrap',
              ...(on ? { color: '#fff', background: 'linear-gradient(#2e8be0,#1561b3)', border: '1px solid #9fd2ff', boxShadow: '0 0 14px rgba(80,170,255,0.6)' } : {}),
            })}>
            {t.label}{on ? ` ${activePick.index + 1}/${available[t.key].length}` : ''}
          </button>
        )
      })}
    </div>
  )
}

export function ClearButton({ onClick, disabled, font }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={pill({ padding: `${Math.round(font * 0.55)}px ${Math.round(font * 1.1)}px`, fontSize: font, color: disabled ? '#6f89a6' : '#d7efff', background: 'linear-gradient(#3f78a8,#2a557c)', opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer' })}>
      CLEAR
    </button>
  )
}

/** Tombol utama: bulat besar. Aktif = hijau menyala; nonaktif = gelap seperti referensi. */
export function PlayButton({ onClick, disabled, size, count }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <button onClick={onClick} disabled={disabled} aria-label="PLAY"
        style={{
          width: '100%', height: '100%', borderRadius: '50%', cursor: disabled ? 'default' : 'pointer', fontFamily: T.font, fontWeight: 900,
          fontSize: Math.round(size * 0.27), letterSpacing: '0.04em', boxSizing: 'border-box',
          color: disabled ? '#8f7a2f' : '#fff', textShadow: disabled ? 'none' : '0 2px 3px rgba(0,0,0,0.5)',
          background: disabled ? 'radial-gradient(circle at 50% 35%, #14233a, #060c16)' : 'radial-gradient(circle at 50% 30%, #6df08a 0%, #25b04a 55%, #137a30 100%)',
          border: disabled ? '3px solid #1a2c44' : '3px solid #d8ffe1',
          boxShadow: disabled ? '0 4px 12px rgba(0,0,0,0.5)' : '0 0 24px 4px rgba(70,224,96,0.55), 0 6px 14px rgba(0,0,0,0.5)',
          transition: 'box-shadow 0.15s, background 0.15s',
        }}>PLAY</button>
      {count > 0 && (
        <span aria-label="kartu dipilih" style={{ position: 'absolute', right: -2, top: -2, minWidth: 22, height: 22, borderRadius: 11, background: T.gold, color: '#3a2a00', fontFamily: T.font, fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff6c9' }}>{count}</span>
      )}
    </div>
  )
}

/** Tombol sekunder (SKIP) dan placeholder (AUTO/HINT). */
export function RoundButton({ label, onClick, disabled, width, height, font, placeholder }) {
  return (
    <button onClick={onClick} disabled={disabled} title={placeholder ? 'Segera hadir' : undefined}
      style={{
        width, height, borderRadius: Math.round(height / 2), cursor: disabled ? 'default' : 'pointer', fontFamily: T.font, fontWeight: 800, fontSize: font,
        letterSpacing: '0.04em', boxSizing: 'border-box',
        color: placeholder ? '#59708a' : disabled ? '#5d7fa6' : '#7fd0ff',
        background: placeholder ? 'rgba(6,20,40,0.55)' : 'linear-gradient(#10365f,#07182e)',
        border: placeholder ? '1px dashed rgba(130,190,255,0.25)' : `1px solid ${T.glassBorder}`,
        boxShadow: placeholder ? 'none' : '0 3px 8px rgba(0,0,0,0.4)',
      }}>{label}</button>
  )
}

/** Nominal taruhan Room (bukan saldo pemain): ikon koin + nominal; placeholder bila Room belum punya taruhan. */
export function BetBadge({ label, font }) {
  return (
    <div data-testid="bet" title="Taruhan Room" style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: T.font, fontWeight: 800, fontSize: Math.round(font * 1.25), color: label ? '#fff' : T.muted }}>
      <Coin size={Math.round(font * 1.9)} />
      <span>{label ?? '—'}</span>
    </div>
  )
}

/** Panel info kiri-atas: nomor game dan status giliran. */
export function InfoPanel({ gameNumber, maxGames, status, myTurn, font, compact }) {
  const game = <span style={{ fontSize: Math.round(font * 0.95), color: T.muted }}>Game <b style={{ color: T.text }}>{gameNumber}</b> / {maxGames || '?'}</span>
  const turn = <span style={{ fontSize: font, fontWeight: 700, color: myTurn ? T.green : T.text }}>{status}</span>
  return (
    <div style={{
      background: T.glass, border: `1px solid ${T.glassBorder}`, borderRadius: 12, fontFamily: T.font, color: T.text, lineHeight: 1.35,
      padding: `${Math.round(font * (compact ? 0.3 : 0.5))}px ${Math.round(font * 1.0)}px`,
      ...(compact ? { display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' } : {}),
    }}>
      {game}{compact ? null : <br />}{turn}
    </div>
  )
}
