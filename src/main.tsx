import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrintView } from './print/PrintView.tsx'

const isPrintRoute = window.location.pathname === '/print';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPrintRoute ? <PrintView /> : <App />}
  </StrictMode>,
)
