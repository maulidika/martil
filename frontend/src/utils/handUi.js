// Logika interaksi tangan di GamePage (seleksi, Combo Detector, Group Chain) sebagai fungsi murni
// supaya bisa diuji tanpa browser. GamePage hanya menyambungkannya ke state React dan gameStore.
//
// ui     = { key, groups, source, lastPick }   (state lokal UI; direset per room+game karena id kartu dipakai ulang)
// selIds = id kartu terpilih (disimpan di gameStore.selectedIds)
import { pickNext, activePickOf } from './comboPicker'
import {
  pruneGroups, groupSelected, ungroupAt, selectByDetector, tapCard, tapGroup,
} from './groupChain'

export const INITIAL_UI = { key: null, groups: [], source: null, lastPick: null }

/** Samakan ui dengan tangan saat ini: game/room baru → reset; kartu keluar dari tangan → grup terkait bubar. */
export function syncUi(ui, key, handIds) {
  if (ui.key !== key) return { ...INITIAL_UI, key }
  const groups = pruneGroups(ui.groups, handIds)
  return groups === ui.groups ? ui : { ...ui, groups }
}

/**
 * @param action  {type:'detector', available, kind} | {type:'tapCard', id} | {type:'tapGroup', index}
 *                | {type:'group'} | {type:'ungroup', index} | {type:'clear'}
 * @returns {{ui, selIds}}
 */
export function reduceHandUi(ui, selIds, handIds, action) {
  const sel = { ids: selIds, source: ui.source }
  switch (action.type) {
    case 'detector': {
      const r = pickNext(action.available, action.kind, activePickOf(ui.lastPick, action.available, selIds), selIds)
      if (!r) return { ui, selIds }
      return { ui: { ...ui, source: 'detector', lastPick: { type: action.kind, index: r.index } }, selIds: selectByDetector(r.ids).ids }
    }
    case 'tapCard': {
      const n = tapCard(sel, action.id)
      return { ui: { ...ui, source: n.source }, selIds: n.ids }
    }
    case 'tapGroup': {
      const n = tapGroup(sel, ui.groups[action.index])
      return { ui: { ...ui, source: n.source }, selIds: n.ids }
    }
    case 'group': {
      if (selIds.length < 2) return { ui, selIds }
      return { ui: { ...ui, groups: groupSelected(ui.groups, selIds, handIds), source: null, lastPick: null }, selIds: [] }
    }
    case 'ungroup':
      return { ui: { ...ui, groups: ungroupAt(ui.groups, action.index), source: null, lastPick: null }, selIds: [] }
    case 'clear':   // CLEAR / setelah PLAY / SKIP: hanya seleksi yang dibersihkan, Group Chain tetap
      return { ui: { ...ui, source: null, lastPick: null }, selIds: [] }
    default:
      return { ui, selIds }
  }
}
