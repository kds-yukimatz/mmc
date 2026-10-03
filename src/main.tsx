import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

const updateSW = registerSW({ immediate: true, onNeedRefresh() { (window as Window & { kahotoreUpdateReady?: boolean }).kahotoreUpdateReady = true; window.dispatchEvent(new Event('kahotore-update-ready')) } })
window.addEventListener('kahotore-apply-update', () => { void updateSW(true) })

createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><App /></HashRouter></StrictMode>)
