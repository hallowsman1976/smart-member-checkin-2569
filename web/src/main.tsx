import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IconContext } from '@phosphor-icons/react'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ไอคอนทั้งแอปใช้น้ำหนักเดียวกัน; ขนาดกำหนดผ่าน className (size-*) */}
    <IconContext.Provider value={{ weight: 'regular', size: '1em' }}>
      <App />
    </IconContext.Provider>
  </StrictMode>,
)
