import type { Component } from 'vue'
import WorkerPoolDemo from './WorkerPoolDemo.vue'
import ConnectionPoolDemo from './ConnectionPoolDemo.vue'
import CacheDemo from './CacheDemo.vue'
import RagDemo from './RagDemo.vue'

export interface PlaygroundDemo {
  id: string
  index: string
  label: string
  /** One line for the home page teaser. */
  blurb: string
  component: Component
}

export const playgroundDemos: PlaygroundDemo[] = [
  { id: 'workers', index: '1', label: 'Worker pool', blurb: 'Bounded concurrency with goroutines.', component: WorkerPoolDemo },
  { id: 'pool', index: '2', label: 'Connection pool', blurb: 'What happens when the pool runs dry.', component: ConnectionPoolDemo },
  { id: 'cache', index: '3', label: 'Cache', blurb: 'Hits, misses, expiry and eviction.', component: CacheDemo },
  { id: 'rag', index: '4', label: 'RAG pipeline', blurb: 'Retrieve, rank and ground an answer.', component: RagDemo },
]
