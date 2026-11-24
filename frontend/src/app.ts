import { createSSRApp, createApp as createClientApp, type App as VueApp } from 'vue'
import type { Router, RouterHistory } from 'vue-router'
import App from './App.vue'
import { createAppRouter, installViewTransitions } from './router'

/** Shared factory for the browser (hydration) and the build-time prerenderer. */
export function createApp(history: RouterHistory, opts: { hydrate: boolean }): { app: VueApp; router: Router } {
  const app = opts.hydrate ? createSSRApp(App) : createClientApp(App)
  const router = createAppRouter(history)
  app.use(router)
  if (typeof window !== 'undefined') installViewTransitions(router)
  return { app, router }
}
