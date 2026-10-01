import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { watchDynamicType } from './lib/dynamicType'

// Follow the iOS text-size setting (no-op elsewhere).
watchDynamicType()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
