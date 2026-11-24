import type { Component } from 'vue'
import type { SurfaceId } from '@/config/types'
import EduflowSurface from './EduflowSurface.vue'
import KreovioSurface from './KreovioSurface.vue'
import ForgeSurface from './ForgeSurface.vue'
import FlowqSurface from './FlowqSurface.vue'

/** Maps a project's `surface` id to its interactive demonstration. */
export const surfaces: Record<SurfaceId, Component> = {
  eduflow: EduflowSurface,
  kreovio: KreovioSurface,
  forge: ForgeSurface,
  flowq: FlowqSurface,
}
