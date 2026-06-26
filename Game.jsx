/**
 * Game.jsx — Main game screen
 */

import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { useSocket } from '../hooks/useSocket';
import { detectCombo, sortHand, suitSymbol, isRed, labelCard } from '../utils/comboDetector';

export default function Game() {
  const { gameState, currentTurn, selectedCardIds, toggleCard, clearSelection, user, roomCode, events } = useGameStore();
  const { playCards, skipTurn } = useSocket();
  const [timeLeft, setTimeLeft] = useState(30);
  const [lastEvent, setLastEvent] = useState(null);

  const myTurn = currentTurn === user?.id;
  const myHand = gameState?.myHand ? sortHand(gameState.myHand) : [];
  const selectedCards = myHand.filter(c => selectedCardIds.includes(c.id));
  const combo = detectCombo(selectedCards);
  const tableTop = gameState?.table?.at(-1);

  // Timer countdown
  useEffect(() => {
    if (!gameState?.timeLeft) return;
    const start = Date.now();
    const initial = Math.floor(gameState.timeLeft / 1000);
    setTimeLeft(initial);
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      setTimeLeft(Math.max(0, initial - Math.floor(elapsed / 1000)));
    }, 500);
    return () => clearInterval(interval);
  }, [gameState?.timeLeft, currentTurn]);

  // Show event toasts
  useEffect(() => {
    if (events[0]) {
      setLastEvent(events[0]);
      const t = setTimeout(() => setLastEvent(null), 2500);
      return () => clearTimeout(t);
    }
  }, [events[0]?.id]);

  const handlePlay = useCallback(() => {
    if (!combo || !myTurn) return;
    playCards(roomCode, selectedCardIds);
    clearSelection();
  }, [combo, myTurn, selectedCardIds, roomCode]);

  const handleSkip = useCallback(() => {
    if (!myTurn) return;
    skipTurn(roomCode);
    clearSelection();
  }, [myTurn, roomCode]);

  if (!gameState) return (
    <div style={styles.center}>
      <p style={{ color: '#888' }}>Menunggu game dimulai…</p>
    </div>
  );

  return (
    <div style={styles.screen}>

      {/* Toast */}
      {lastEvent && <Toast event={lastEvent} userId={user?.id} />}

      {/* Score bar */}
      <div style={styles.scoreBar}>
        <span style={styles.scoreText}>Game {gameState.gameNumber}</span>
        <span style={styles.scoreText}>Giliran: {myTurn ? 'Kamu!' : 'Lawan'}</span>
      </div>

      {/* Opponents */}
      <div style={styles.opponents}>
        {gameState.opponents?.map(op => (
          <OpponentCard key={op.id} opponent={op} isActive={currentTurn === op.id} />
        ))}
      </div>

      {/* Table */}
      <div style={styles.tableArea}>
        {tableTop ? (
          <div style={styles.tableCombo}>
            {tableTop.combo.cards.map(c => (
              <CardChip key={c.id} card={c} small />
            ))}
            <span style={styles.comboLabel}>{tableTop.combo.subtype || tableTop.combo.type}</span>
          </div>
        ) : (
          <span style={styles.emptyTable}>{myTurn ? 'Giliran kamu — main bebas' : 'Meja kosong'}</span>
        )}
      </div>

      {/* Timer */}
      <div style={styles.timerRow}>
        <div style={{ ...styles.timer, color: timeLeft <= 10 ? '#e74c3c' : '#888' }}>
          {timeLeft}s
        </div>
        {combo && (
          <div style={styles.comboHint}>{combo.label}</div>
        )}
      </div>

      {/* Hand */}
      <div style={styles.hand}>
        {myHand.map((card, i) => (
          <CardChip
            key={card.id}
            card={card}
            selected={selectedCardIds.includes(card.id)}
            onTap={() => myTurn && toggleCard(card.id)}
            index={i}
            total={myHand.length}
          />
        ))}
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        <button
          style={{ ...styles.btn, ...styles.skipBtn }}
          onClick={handleSkip}
          disabled={!myTurn}
        >
          Skip
        </button>
        <button
          style={{ ...styles.btn, ...styles.playBtn, opacity: (!combo || !myTurn) ? 0.4 : 1 }}
          onClick={handlePlay}
          disabled={!combo || !myTurn}
        >
          Play {selectedCards.length > 0 ? `(${selectedCards.length})` : ''}
        </button>
      </div>
    </div>
  );
}

function OpponentCard({ opponent, isActive }) {
  return (
    <div style={{ ...styles.opponentCard, borderColor: isActive ? '#3498db' : 'transparent' }}>
      <span style={styles.opName}>{opponent.id.slice(0, 6)}</span>
      <span style={styles.opCards}>{opponent.cardCount} 🃏</span>
      {isActive && <div style={styles.activeDot} />}
    </div>
  );
}

function CardChip({ card, selected, onTap, small, index, total }) {
  const red = isRed(card);
  return (
    <div
      onClick={onTap}
      style={{
        ...styles.cardChip,
        ...(small ? styles.cardSmall : {}),
        transform: selected ? 'translateY(-12px)' : 'translateY(0)',
        borderColor: selected ? '#3498db' : '#ddd',
        color: red ? '#c0392b' : '#2c3e50',
        cursor: onTap ? 'pointer' : 'default',
        marginLeft: (index > 0 && !small) ? -18 : 0,
        zIndex: index,
      }}
    >
      <span style={{ fontSize: small ? 9 : 13, fontWeight: 600 }}>{card.rank}</span>
      <span style={{ fontSize: small ? 9 : 12 }}>{suitSymbol(card.suit)}</span>
    </div>
  );
}

function Toast({ event, userId }) {
  const messages = {
    rally_ended: '🧹 Rally selesai — meja bersih',
    game_over: (e) => e.winnerId === userId ? '🎉 Kamu menang!' : `💀 ${e.winnerId?.slice(0,6)} menang`,
    auto_skipped: (e) => e.playerId === userId ? '⏰ Waktu habis — auto skip' : '⏰ Auto skip',
    player_disconnected: (e) => `📡 ${e.playerId?.slice(0,6)} disconnect`,
    player_reconnected: (e) => `✅ ${e.playerId?.slice(0,6)} kembali`,
  };
  const msg = typeof messages[event.type] === 'function'
    ? messages[event.type](event)
    : messages[event.type] || event.type;

  return (
    <div style={styles.toast}>{msg}</div>
  );
}

const styles = {
  screen: { display:'flex', flexDirection:'column', height:'100dvh', background:'#f8f9fa', userSelect:'none' },
  center: { display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' },
  scoreBar: { display:'flex', justifyContent:'space-between', padding:'8px 16px', background:'#fff', borderBottom:'1px solid #eee' },
  scoreText: { fontSize:13, color:'#555', fontWeight:500 },
  opponents: { display:'flex', justifyContent:'space-around', padding:'8px 8px 0', gap:6 },
  opponentCard: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'6px 4px', background:'#fff', borderRadius:8, border:'2px solid transparent', position:'relative', gap:2 },
  opName: { fontSize:10, color:'#888', overflow:'hidden', textOverflow:'ellipsis', maxWidth:60 },
  opCards: { fontSize:12, fontWeight:600, color:'#333' },
  activeDot: { width:6, height:6, borderRadius:3, background:'#3498db', position:'absolute', top:4, right:4 },
  tableArea: { flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  tableCombo: { display:'flex', flexDirection:'column', alignItems:'center', gap:8 },
  emptyTable: { fontSize:13, color:'#aaa' },
  comboLabel: { fontSize:11, color:'#888', textTransform:'capitalize' },
  timerRow: { display:'flex', alignItems:'center', justifyContent:'space-between', paddingInline:16, paddingBlock:4 },
  timer: { fontSize:13, fontWeight:600 },
  comboHint: { fontSize:12, color:'#3498db', fontWeight:500 },
  hand: { display:'flex', justifyContent:'center', padding:'8px 12px 4px', overflowX:'auto', minHeight:80 },
  cardChip: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', width:38, height:54, background:'#fff', border:'1.5px solid #ddd', borderRadius:6, transition:'transform 0.15s', flexShrink:0, gap:1, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  cardSmall: { width:28, height:40 },
  actions: { display:'flex', gap:10, padding:'8px 16px 20px' },
  btn: { flex:1, height:44, borderRadius:10, fontSize:15, fontWeight:600, border:'none', cursor:'pointer', transition:'opacity 0.15s' },
  skipBtn: { background:'#ecf0f1', color:'#555' },
  playBtn: { background:'#3498db', color:'#fff' },
  toast: { position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.8)', color:'#fff', fontSize:13, padding:'8px 16px', borderRadius:20, zIndex:999, whiteSpace:'nowrap', pointerEvents:'none' },
};
