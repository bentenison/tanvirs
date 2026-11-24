// Runs before first paint so stored theme and motion choices never flash.
// Kept as an external file because the CSP forbids inline scripts.
(function () {
  var root = document.documentElement
  try {
    var theme = localStorage.getItem('portfolio:theme')
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme)
    var motion = localStorage.getItem('portfolio:motion')
    if (motion === 'full' || motion === 'reduced' || motion === 'minimal') root.setAttribute('data-motion', motion)
  } catch (e) {
    /* storage unavailable: fall back to system preferences */
  }
  if (!root.hasAttribute('data-motion')) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    root.setAttribute('data-motion', reduce ? 'reduced' : 'full')
  }
})()
