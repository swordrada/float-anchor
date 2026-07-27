import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import InstantModeWindow from './components/InstantModeWindow'
import './index.css'

const isInstantMode = new URLSearchParams(window.location.search).get('mode') === 'instant'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isInstantMode ? <InstantModeWindow /> : <App />}
  </React.StrictMode>,
)
