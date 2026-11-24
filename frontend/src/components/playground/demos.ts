import type { Component } from 'vue'
import WorkerPoolDemo from './WorkerPoolDemo.vue'
import ConnectionPoolDemo from './ConnectionPoolDemo.vue'
import CacheDemo from './CacheDemo.vue'
import RagDemo from './RagDemo.vue'

export interface PlaygroundDemo {
  id: string
  index: string
  label: string
  component: Component
}

export const playgroundDemos: PlaygroundDemo[] = [
  { id: 'workers', index: '1', label: 'Worker pool', component: WorkerPoolDemo },
  { id: 'pool', index: '2', label: 'Connection pool', component: ConnectionPoolDemo },
  { id: 'cache', index: '3', label: 'Cache', component: CacheDemo },
  { id: 'rag', index: '4', label: 'RAG pipeline', component: RagDemo },
]
