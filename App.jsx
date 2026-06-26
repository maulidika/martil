import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useGameStore } from './store/gameStore'
import { useSocket } from './hooks/useSocket'
import LoginPage  from './pages/LoginPage'
import LobbyPage  from './pages/LobbyPage'
import GamePage   from './pages/GamePage'
import ResultPage from './pages/ResultPage'

function PrivateRoute({ children }) {
  const user = useGameStore(s => s.user)
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  const user = useGameStore(s => s.user)

  // Boot socket connection when logged in
  useSocket()

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/lobby" replace /> : <LoginPage />} />
      <Route path="/lobby" element={<PrivateRoute><LobbyPage /></PrivateRoute>} />
      <Route path="/game"  element={<PrivateRoute><GamePage /></PrivateRoute>} />
      <Route path="/result" element={<PrivateRoute><ResultPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to={user ? '/lobby' : '/login'} replace />} />
    </Routes>
  )
}
