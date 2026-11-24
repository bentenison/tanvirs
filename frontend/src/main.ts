import { createWebHistory } from 'vue-router'
import './styles/global.css'
import { createApp } from './app'
import { initPreferences } from './services/preferences'

initPreferences()
// Opt in to JS-only entrance states (reveals, surface assembly) only once the app actually runs.
document.documentElement.classList.add('js')

const container = document.getElementById('app')!
const prerendered = container.firstElementChild !== null
const { app, router } = createApp(createWebHistory(), { hydrate: prerendered })

router.isReady().then(() => {
  app.mount(container)
})
