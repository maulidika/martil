import React, { useEffect, useRef } from 'react'

const C = { surface:'#16213e', accent:'#e94560', text:'#eee', muted:'#aaa', border:'#1a4a7a' }

/**
 * Modal blocking: overlay menutup seluruh halaman sehingga UI di belakangnya tidak bisa diklik.
 * Klik di luar kotak tidak menutupnya, Tab dikunci di dalam modal, dan Escape hanya menutup bila `onEscape` diberikan
 * (modal wajib seperti "Akses Room Dibatasi" tidak memberi `onEscape`, jadi harus ditutup lewat tombolnya).
 * actions: [{ label, onClick, primary?, autoFocus? }]
 */
export default function Modal({ title, children, actions = [], onEscape, testId }) {
  const boxRef = useRef(null)

  useEffect(() => {
    const previous = document.activeElement
    const first = boxRef.current?.querySelector('[data-autofocus]') || boxRef.current?.querySelector('button')
    first?.focus()
    return () => { if (previous && previous.focus) previous.focus() }
  }, [])

  function onKeyDown(e) {
    if (e.key === 'Escape') { if (onEscape) { e.stopPropagation(); onEscape() } return }
    if (e.key !== 'Tab') return
    const buttons = [...(boxRef.current?.querySelectorAll('button') || [])]
    if (!buttons.length) return
    const firstBtn = buttons[0], lastBtn = buttons[buttons.length - 1]
    if (e.shiftKey && document.activeElement === firstBtn) { e.preventDefault(); lastBtn.focus() }
    else if (!e.shiftKey && document.activeElement === lastBtn) { e.preventDefault(); firstBtn.focus() }
  }

  return (
    <div
      data-testid={testId}
      onKeyDown={onKeyDown}
      style={{ position:'fixed', inset:0, zIndex:900, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
    >
      <div
        ref={boxRef}
        role="dialog" aria-modal="true" aria-labelledby="modal-title"
        style={{ width:'100%', maxWidth:340, background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:'1.25rem', boxShadow:'0 10px 40px rgba(0,0,0,0.5)' }}
      >
        <div id="modal-title" style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:8 }}>{title}</div>
        <div style={{ fontSize:14, color:C.muted, lineHeight:1.5, marginBottom:16 }}>{children}</div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          {actions.map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              data-autofocus={a.autoFocus ? '' : undefined}
              style={{
                padding:'9px 16px', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer',
                background: a.primary ? C.accent : 'transparent', color: a.primary ? '#fff' : C.text,
                border: a.primary ? 'none' : `1px solid ${C.border}`,
              }}
            >{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
