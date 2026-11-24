import { mulberry32, serviceTime, exponential } from './random'

/**
 * Database connection pool (think database/sql with SetMaxOpenConns).
 * C concurrent clients loop: think → acquire a connection → query → release.
 * When the pool is exhausted, acquisitions wait in FIFO order; waits past
 * the timeout fail. Simulated time only.
 */
export type ClientState = 'thinking' | 'waiting' | 'querying' | 'failed'

export interface Client {
  id: number
  state: ClientState
  until: number
  waitStart: number
  conn: number
}

export interface PoolStats {
  inUse: number
  idle: number
  waiting: number
  p50: number
  p95: number
  errors: number
  completed: number
  throughput: number
}

export const STEP = 1 / 60

export class ConnectionPoolSim {
  clients: Client[] = []
  conns: (number | null)[] = []
  waitQueue: number[] = []
  time = 0
  errors = 0
  completed = 0
  timeout = 1.0
  thinkMean = 0.35
  queryMedian = 0.12
  private rnd: () => number
  private acc = 0
  private waits: number[] = []
  private recent: number[] = []

  constructor(clients = 12, poolSize = 4, seed = 7) {
    this.rnd = mulberry32(seed)
    this.setPoolSize(poolSize)
    this.setClients(clients)
  }

  setClients(n: number): void {
    const count = Math.max(1, Math.min(96, Math.round(n)))
    while (this.clients.length < count) {
      const id = this.clients.length
      this.clients.push({ id, state: 'thinking', until: this.time + exponential(this.rnd, this.thinkMean), waitStart: 0, conn: -1 })
    }
    while (this.clients.length > count) {
      const c = this.clients.pop()!
      if (c.conn >= 0) this.conns[c.conn] = null
      this.waitQueue = this.waitQueue.filter((id) => id !== c.id)
    }
  }

  setPoolSize(n: number): void {
    const size = Math.max(1, Math.min(32, Math.round(n)))
    while (this.conns.length < size) this.conns.push(null)
    // Shrinking closes connections from the end; a client using one is sent back to thinking.
    while (this.conns.length > size) {
      const owner = this.conns.pop()
      if (owner === null || owner === undefined) continue
      const c = this.clients[owner]
      if (c) {
        c.conn = -1
        c.state = 'thinking'
        c.until = this.time + exponential(this.rnd, this.thinkMean)
      }
    }
  }

  step(dt: number): void {
    this.acc += Math.min(dt, 0.25)
    while (this.acc >= STEP) {
      this.acc -= STEP
      this.tick(STEP)
    }
  }

  private freeConn(): number {
    return this.conns.indexOf(null)
  }

  private tick(dt: number): void {
    this.time += dt
    for (const c of this.clients) {
      if (c.state === 'thinking' && this.time >= c.until) {
        c.state = 'waiting'
        c.waitStart = this.time
        this.waitQueue.push(c.id)
      } else if (c.state === 'querying' && this.time >= c.until) {
        this.conns[c.conn] = null
        c.conn = -1
        c.state = 'thinking'
        c.until = this.time + exponential(this.rnd, this.thinkMean)
        this.completed++
        this.recent.push(this.time)
      } else if (c.state === 'failed' && this.time >= c.until) {
        c.state = 'thinking'
        c.until = this.time + exponential(this.rnd, this.thinkMean)
      }
    }
    // Timeouts
    this.waitQueue = this.waitQueue.filter((id) => {
      const c = this.clients[id]
      if (!c) return false
      if (this.time - c.waitStart > this.timeout) {
        c.state = 'failed'
        c.until = this.time + 0.4
        this.errors++
        return false
      }
      return true
    })
    // Grant connections FIFO
    let free = this.freeConn()
    while (free >= 0 && this.waitQueue.length) {
      const id = this.waitQueue.shift()!
      const c = this.clients[id]
      this.conns[free] = id
      c.conn = free
      c.state = 'querying'
      c.until = this.time + serviceTime(this.rnd, this.queryMedian, 0.5)
      this.waits.push(this.time - c.waitStart)
      if (this.waits.length > 300) this.waits.shift()
      free = this.freeConn()
    }
    while (this.recent.length && this.recent[0] < this.time - 3) this.recent.shift()
  }

  stats(): PoolStats {
    const sorted = [...this.waits].sort((a, b) => a - b)
    const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0)
    const inUse = this.conns.filter((x) => x !== null).length
    return {
      inUse,
      idle: this.conns.length - inUse,
      waiting: this.waitQueue.length,
      p50: q(0.5),
      p95: q(0.95),
      errors: this.errors,
      completed: this.completed,
      throughput: this.recent.length / (Math.min(3, this.time) || 1),
    }
  }
}
