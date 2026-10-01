import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { watchDynamicType } from './lib/dynamicType'
import { watchDeviceShape } from './lib/deviceShape'
import { startUpdateChecks } from './lib/appUpdate'

// Follow the iOS text-size setting, and measure the installed iPhone app's
// real screen size and corner radius (both no-ops elsewhere).
watchDynamicType()
watchDeviceShape()
// Pick up new versions in the installed app (see lib/appUpdate).
startUpdateChecks()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
