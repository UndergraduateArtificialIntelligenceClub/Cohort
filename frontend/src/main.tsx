import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/notifications'

// Shows push notifications (public/sw.js). It caches nothing, so the app still loads fresh every time.
registerServiceWorker()?.catch(console.error)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
