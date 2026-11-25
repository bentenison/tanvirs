import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent } from 'vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import PreferenceControls from '@/components/ui/PreferenceControls.vue'
import DomainIndex from '@/components/organism/DomainIndex.vue'
import DomainPanel from '@/components/organism/DomainPanel.vue'
import ContactForm from '@/components/contact/ContactForm.vue'
import SiteNav from '@/components/navigation/SiteNav.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import { domains } from '@/config/technologies'
import { navigation } from '@/config/navigation'
import { _resetPreferencesForTests, initPreferences, preferences, MOTION_KEY } from '@/services/preferences'

class RO {
  observe() {}
  disconnect() {}
  unobserve() {}
}
class IO {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', RO)
  vi.stubGlobal('IntersectionObserver', IO)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  localStorage.clear()
  _resetPreferencesForTests()
})

const router = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: defineComponent({ template: '<div />' }) },
      { path: '/work/:slug', component: defineComponent({ template: '<div />' }) },
    ],
  })

describe('SegmentedControl', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
  ]

  it('exposes a radiogroup with roving tabindex', () => {
    const w = mount(SegmentedControl, { props: { options, modelValue: 'b', label: 'Pick' } })
    expect(w.attributes('role')).toBe('radiogroup')
    const radios = w.findAll('[role="radio"]')
    expect(radios.map((r) => r.attributes('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(radios.map((r) => r.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('moves selection with arrow keys and wraps', async () => {
    const w = mount(SegmentedControl, { props: { options, modelValue: 'c', label: 'Pick' } })
    await w.findAll('[role="radio"]')[2].trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['a'])
    await w.findAll('[role="radio"]')[2].trigger('keydown', { key: 'Home' })
    expect(w.emitted('update:modelValue')?.[1]).toEqual(['a'])
  })
})

describe('PreferenceControls', () => {
  it('persists the motion setting', async () => {
    initPreferences()
    const w = mount(PreferenceControls)
    await flushPromises()
    const minimal = w.findAll('[role="radio"]').find((r) => r.text() === 'Minimal')!
    await minimal.trigger('click')
    expect(preferences.motion).toBe('minimal')
    expect(localStorage.getItem(MOTION_KEY)).toBe('minimal')
    expect(document.documentElement.dataset.motion).toBe('minimal')
  })
})

describe('DomainIndex', () => {
  it('lists the core and every domain, and toggles selection', async () => {
    const w = mount(DomainIndex, { props: { selected: null, panelId: 'p' } })
    const buttons = w.findAll('button')
    expect(buttons).toHaveLength(domains.length + 1)
    await buttons[1].trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([domains[0].id])
    await w.setProps({ selected: domains[0].id })
    expect(w.findAll('button')[1].attributes('aria-pressed')).toBe('true')
    await w.findAll('button')[1].trigger('click')
    expect(w.emitted('select')?.[1]).toEqual([null])
  })

  it('Escape clears the selection', async () => {
    const w = mount(DomainIndex, { props: { selected: 'data', panelId: 'p' } })
    await w.findAll('button')[0].trigger('keydown', { key: 'Escape' })
    expect(w.emitted('select')?.[0]).toEqual([null])
  })
})

describe('DomainPanel', () => {
  it('shows a domain, its technologies and related projects without experience years', async () => {
    const r = router()
    const w = mount(DomainPanel, { props: { id: 'x', selected: 'data' }, global: { plugins: [r] } })
    expect(w.text()).toContain('Databases')
    expect(w.text()).toContain('PostgreSQL')
    expect(w.text()).toContain('EduFlow')
    expect(w.text()).not.toMatch(/\byears?\b/i)
    const mongo = w.findAll('button').find((b) => b.text() === 'MongoDB')!
    await mongo.trigger('click')
    expect(w.text()).toContain('Document storage')
  })

  it('renders nothing visible when closed', () => {
    const w = mount(DomainPanel, { props: { id: 'x', selected: null }, global: { plugins: [router()] } })
    expect(w.classes()).not.toContain('is-open')
    expect(w.text()).toBe('')
  })
})

describe('ContactForm', () => {
  it('shows linked errors and focuses the first invalid field on submit', async () => {
    const w = mount(ContactForm, { attachTo: document.body })
    await w.find('form').trigger('submit')
    const name = w.find('#cf-name')
    expect(name.attributes('aria-invalid')).toBe('true')
    expect(name.attributes('aria-describedby')).toBe('cf-name-err')
    expect(w.find('#cf-name-err').text()).toMatch(/name/i)
    expect(document.activeElement?.id).toBe('cf-name')
    w.unmount()
  })

  it('keeps the honeypot out of the accessibility tree and tab order', () => {
    const w = mount(ContactForm)
    const hp = w.find('#cf-company')
    expect(hp.attributes('tabindex')).toBe('-1')
    expect(hp.element.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('does not claim success when delivery fails', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'save_failed' }), { status: 503 })))
    const w = mount(ContactForm, { props: { email: 'me@example.com' } })
    await w.find('#cf-name').setValue('Asha')
    await w.find('#cf-email').setValue('asha@example.com')
    await w.find('#cf-message').setValue('I would like to discuss a project.')
    const done = w.find('form').trigger('submit')
    await vi.advanceTimersByTimeAsync(3000)
    await done
    await flushPromises()
    const status = w.find('[role="status"]').text()
    expect(status).toMatch(/couldn’t be saved/i)
    expect(status).toContain('me@example.com')
    expect(status).not.toMatch(/thank you/i)
    vi.useRealTimers()
  })
})

describe('SiteNav', () => {
  it('renders every section link and the settings control', async () => {
    const r = router()
    r.push('/')
    await r.isReady()
    const w = mount(SiteNav, { global: { plugins: [r] } })
    const nav = w.find('nav[aria-label="Primary"]')
    for (const item of navigation) expect(nav.text()).toContain(item.label)
    expect(w.find('[aria-label="Display settings"]').exists()).toBe(true)
  })
})

describe('StatusTag', () => {
  it('labels statuses in words, not colour alone', () => {
    expect(mount(StatusTag, { props: { status: 'released' } }).text()).toBe('Released')
    expect(mount(StatusTag, { props: { status: 'in-development' } }).text()).toBe('In development')
  })
})
