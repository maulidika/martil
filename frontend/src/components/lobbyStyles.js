// Shared look of the Homepage and Room screens (LobbyPage, HomeView, RoomView).
export const C = { bg:'#1a1a2e', card:'#16213e', accent:'#e94560', muted:'#888', border:'#1a4a7a', text:'#eee', green:'#2ecc71', yellow:'#f39c12' }

export const s = {
  wrap:   { minHeight:'100dvh', background:C.bg, padding:'1rem', display:'flex', flexDirection:'column' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  logo:   { fontSize:22, fontWeight:700, color:C.accent, letterSpacing:1 },
  user:   { fontSize:13, color:C.muted },
  logout: { fontSize:12, color:C.muted, cursor:'pointer', textDecoration:'underline', marginLeft:8 },
  card:   { background:C.card, borderRadius:14, padding:'1.25rem', marginBottom:12 },
  title:  { fontSize:16, fontWeight:600, color:C.text, marginBottom:12 },
  input:  { width:'100%', padding:'10px 14px', background:'#0f3460', border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:15, outline:'none', marginBottom:10 },
  btn:    { width:'100%', padding:'11px', borderRadius:8, fontSize:15, fontWeight:600, border:'none', cursor:'pointer', marginBottom:8 },
  row:    { display:'flex', gap:8, marginBottom:8 },
  pill:   { fontSize:12, padding:'4px 10px', borderRadius:20, background:'rgba(46,204,113,0.15)', color:C.green, border:'1px solid rgba(46,204,113,0.3)' },
  seat:   { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid #1a4a7a` },
  dot:    (on) => ({ width:8, height:8, borderRadius:4, background: on ? C.green : C.muted, flexShrink:0 }),
  err:    { background:'rgba(233,69,96,0.12)', border:`1px solid ${C.accent}`, color:C.accent, borderRadius:8, padding:'8px 12px', fontSize:13, marginBottom:10 },
  code:   { fontFamily:'monospace', fontSize:20, letterSpacing:4, color:C.accent, fontWeight:700, textAlign:'center', marginBottom:4 },
  hint:   { fontSize:12, color:C.muted, textAlign:'center' },
  tag:    { fontSize:11, color:C.muted },
}
