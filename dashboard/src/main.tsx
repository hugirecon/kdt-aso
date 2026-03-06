import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)

// Register tile cache service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/tile-cache-sw.js').catch(() => {})
}
