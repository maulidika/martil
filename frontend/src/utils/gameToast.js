/**
 * Short toast text for a game event shown during a Game. Pure function so it can be tested without React.
 * @param {{type: string, winnerId?: string, playerId?: string}} ev  event pushed by useSocket
 * @param {string} myId   the logged-in player's id
 * @param {(id: string) => string} nameOf  display name for another player (see playerName in utils/profile.js)
 * @returns {string|null} null when the event has no toast
 */
export function toastMsg(ev, myId, nameOf) {
  switch (ev.type) {
    case 'rally_ended':         return '🧹 Rally selesai — meja bersih'
    case 'game_over':           return ev.winnerId === myId ? '🎉 Kamu menang game ini!' : `🏆 ${nameOf(ev.winnerId)} menang`
    case 'auto_skipped':        return ev.playerId === myId ? '⏰ Waktu habis — auto skip' : `⏰ Auto skip (${nameOf(ev.playerId)})`
    case 'player_disconnected': return `📡 ${nameOf(ev.playerId)} terputus`
    case 'player_reconnected':  return `✅ ${nameOf(ev.playerId)} kembali`
    default: return null
  }
}
