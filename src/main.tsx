import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { sembrar } from './datos/db'
import './index.css'

sembrar().catch((e) => console.error('No se pudo sembrar la base local:', e))

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
