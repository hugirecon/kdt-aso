import React from 'react'

interface User {
  name: string
  title: string
  role: string
}

interface HeaderProps {
  connected: boolean
  user?: User | null
  onLogout?: () => void
}

const Header: React.FC<HeaderProps> = ({ connected, user, onLogout }) => {
  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-logo">KDT Aso</div>
        <div className="header-subtitle">Autonomous Operations Platform</div>
      </div>
      
      <div className="header-right">
        <div className="status-indicator">
          <span className={`status-dot ${connected ? 'online' : ''}`}></span>
          <span>{connected ? 'System Online' : 'Connecting...'}</span>
        </div>
        
        {user && (
          <div className="user-info">
            <span className="user-name">{user.title} {user.name}</span>
            <button className="logout-btn" onClick={onLogout}>Logout</button>
          </div>
        )}
      </div>
    </header>
  )
}

export default Header
