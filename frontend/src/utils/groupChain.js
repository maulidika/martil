// Group Chain: pengelompokan kartu di tangan (state murni; UI ada di GamePage.jsx).
// groups = array grup, tiap grup array id kartu (urutan tampil = urutan tangan).

// Buang grup yang menyentuh kartu yang sudah tidak ada di tangan (mis. sudah dimainkan):
// grup itu dibubarkan seluruhnya sehingga sisa kartunya kembali ke dek utama.
// Mengembalikan array yang SAMA bila tidak ada perubahan.
export function pruneGroups(groups, handIds) {
  const have = new Set(handIds)
  const kept = groups.filter(g => g.length >= 2 && g.every(id => have.has(id)))
  return kept.length === groups.length ? groups : kept
}

// Buat grup baru dari kartu terpilih (minimal 2). Grup lama yang kartunya ikut terpilih
// dibubarkan; sisa kartunya kembali ke dek utama.
export function groupSelected(groups, selectedIds, handOrderIds) {
  const sel = new Set(selectedIds)
  if (sel.size < 2) return groups
  const rest = groups.filter(g => !g.some(id => sel.has(id)))
  const ordered = handOrderIds.filter(id => sel.has(id))
  return [...rest, ordered]
}

export function ungroupAt(groups, index) {
  return groups.filter((_, i) => i !== index)
}

// Kartu dek utama = tangan tanpa kartu yang ada di grup.
export function mainDeckIds(handOrderIds, groups) {
  const grouped = new Set(groups.flat())
  return handOrderIds.filter(id => !grouped.has(id))
}

export const isGroupSelected = (group, selectedIds) => group.every(id => selectedIds.includes(id))

// ── Prioritas seleksi: aksi seleksi terbaru menggantikan seleksi dari Combo Detector ──
// sel = { ids: string[], source: 'manual' | 'detector' | null }
export const EMPTY_SELECTION = { ids: [], source: null }

export function selectByDetector(ids) { return { ids: [...ids], source: 'detector' } }

// Seleksi dek utama dan Group Chain bersifat eksklusif: mengetuk sumber lain membersihkan seleksi sebelumnya
// (tidak pernah memunculkan GROUP atau menggabungkan kartu). Hanya Combo Detector yang boleh mencampur.
export function tapCard(sel, id, groupedIds = []) {
  const fromGroup = sel.ids.some(x => groupedIds.includes(x))
  if (sel.source === 'detector' || fromGroup) return { ids: [id], source: 'manual' }
  return { ids: sel.ids.includes(id) ? sel.ids.filter(x => x !== id) : [...sel.ids, id], source: 'manual' }
}

export function tapGroup(sel, groupIds) {
  const same = sel.ids.length === groupIds.length && groupIds.every(id => sel.ids.includes(id))
  if (same) return { ids: [], source: 'manual' }                     // grup yang sedang terpilih diketuk lagi → turun
  return { ids: [...groupIds], source: 'manual' }                    // dek utama / grup lain → diganti grup ini
}

// GROUP hanya untuk ≥2 kartu yang seluruhnya berasal dari dek utama (bukan dari grup mana pun).
export function canGroupSelection(selectedIds, groups) {
  if (selectedIds.length < 2) return false
  const grouped = new Set(groups.flat())
  return selectedIds.every(id => !grouped.has(id))
}

// Posisi tombol di atas sekumpulan kartu: tengah-tengah rentang horizontal, di atas kartu tertinggi.
// rects: [{ left, top, width }] relatif terhadap wadah.
export function anchorAbove(rects) {
  if (!rects.length) return null
  const left = Math.min(...rects.map(r => r.left))
  const right = Math.max(...rects.map(r => r.left + r.width))
  return { x: (left + right) / 2, y: Math.min(...rects.map(r => r.top)) }
}
