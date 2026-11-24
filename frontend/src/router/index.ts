import { createRouter, type RouterHistory, type RouteLocationNormalized, type Router } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { projectBySlug } from '@/config/projects'

export function createAppRouter(history: RouterHistory): Router {
  const router = createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: HomeView },
      {
        path: '/work/:slug',
        name: 'project',
        component: () => import('@/views/ProjectView.vue'),
        beforeEnter: (to) => {
          const p = projectBySlug(String(to.params.slug))
          if (!p || p.presentation !== 'feature') {
            // Keep the requested URL but render the 404 view.
            return { name: 'not-found', params: { pathMatch: to.path.slice(1).split('/') }, query: to.query, hash: to.hash }
          }
          return true
        },
      },
      { path: '/playground', name: 'playground', component: () => import('@/views/PlaygroundView.vue') },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
    ],
    scrollBehavior(to: RouteLocationNormalized, from: RouteLocationNormalized, saved) {
      if (saved) return saved
      if (to.hash) {
        const instant = document.documentElement.dataset.motion !== 'full' || to.path !== from.path
        return { el: to.hash, top: 72, behavior: instant ? 'instant' : 'smooth' }
      }
      if (to.path !== from.path) return { top: 0 }
      return false
    },
  })
  return router
}

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void> }
}

/**
 * Route changes use the native View Transition API where available. The
 * transition never blocks navigation: the router resolves immediately and
 * the DOM update runs inside the transition callback. Same-page hash
 * navigation and minimal motion skip it entirely.
 */
export function installViewTransitions(router: Router): void {
  if (typeof document === 'undefined') return
  const doc = document as ViewTransitionDoc
  let finishNavigation: (() => void) | null = null

  router.beforeResolve((to, from) => {
    if (!doc.startViewTransition) return true
    if (to.path === from.path || !from.matched.length) return true
    if (document.documentElement.dataset.motion === 'minimal') return true
    return new Promise<boolean>((resolve) => {
      doc.startViewTransition!(
        () =>
          new Promise<void>((done) => {
            finishNavigation = done
            resolve(true)
          }),
      ).finished.catch(() => {})
      // Safety: never hold the DOM snapshot longer than a frame budget if rendering stalls.
      setTimeout(() => {
        finishNavigation?.()
        finishNavigation = null
      }, 800)
    })
  })

  router.afterEach(async () => {
    if (!finishNavigation) return
    const done = finishNavigation
    finishNavigation = null
    // Let Vue patch the new route before the "after" snapshot.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    done()
  })

  router.onError(() => {
    finishNavigation?.()
    finishNavigation = null
  })
}
