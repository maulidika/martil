import React from 'react'
import { createRoot } from 'react-dom/client'
import GamePage from '../../src/pages/GamePage.jsx'
import { useGameStore } from '../../src/store/gameStore.js'
window.__store = useGameStore; window.__emits = []
createRoot(document.getElementById('root')).render(<GamePage />)
