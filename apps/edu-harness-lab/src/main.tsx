import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { useLab } from './state/store'

// A lesson link with ?lang=en|it sets the interface language (src/i18n.ts) and, like the IT | EN
// toggle, the language the model works in.
const linkLang = new URLSearchParams(window.location.search).get('lang')
if (linkLang === 'en' || linkLang === 'it') useLab.getState().setPromptLanguage(linkLang)

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root mancante')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
