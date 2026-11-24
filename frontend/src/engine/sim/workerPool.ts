import { mulberry32, serviceTime, exponential } from './random'

/**
 * Bounded worker pool, modelled the way a Go program would run one:
 * a buffered jobs channel drained by N goroutines. Simulated time only -
 * nothing here measures real performance.
 */
export interface Job {
  id: number
  cost: number
  enqueuedAt: number
  startedAt?: number
}

export interface WorkerState {
  job: Job | null
  remaining: number
  completed: number
}

export interface WorkerPoolStats {
  queued: number
  inFlight: number
  done: number
  throughput: number // jobs per simulated second, rolling
  avgWait: number // seconds
  utilisation: number // 0..1
}

export const STEP = 1 / 60

export class WorkerPoolSim {
  workers: WorkerState[] = []
  queue: Job[] = []
  time = 0
  done = 0
  /** Steady arrivals per simulated second (0 = bursts only). */
  arrivalRate = 4
  medianCost = 0.6
  private rnd: () => number
  private nextId = 1
  private nextArrival = 0
  private acc = 0
  private recent: number[] = []
  private waits: number[] = []

  constructor(workers = 4, seed = 42) {
    this.rnd = mulberry32(seed)
    this.setWorkers(workers)
    this.nextArrival = exponential(this.rnd, 1 / Math.max(this.arrivalRate, 0.001))
  }

  setWorkers(n: number): void {
    const count = Math.max(1, Math.min(64, Math.round(n)))
    while (this.workers.length < count) this.workers.push({ job: null, remaining: 0, completed: 0 })
    while (this.workers.length > count) {
      // Like cancelling a goroutine's context: its in-flight job goes back on the queue.
      const w = this.workers.pop()!
      if (w.job) this.queue.unshift(w.job)
    }
  }

  enqueue(): Job {
    const job = { id: this.nextId++, cost: serviceTime(this.rnd, this.medianCost), enqueuedAt: this.time }
    this.queue.push(job)
    return job
  }

  burst(n: number): void {
    for (let i = 0; i < n; i++) this.enqueue()
  }

  step(dt: number): void {
    this.acc += Math.min(dt, 0.25)
    while (this.acc >= STEP) {
      this.acc -= STEP
      this.tick(STEP)
    }
  }

  private tick(dt: number): void {
    this.time += dt
    if (this.arrivalRate > 0) {
      while (this.time >= this.nextArrival) {
        this.enqueue()
        this.nextArrival += exponential(this.rnd, 1 / this.arrivalRate)
      }
    } else {
      this.nextArrival = this.time
    }
    for (const w of this.workers) {
      if (!w.job && this.queue.length) {
        w.job = this.queue.shift()!
        w.job.startedAt = this.time
        w.remaining = w.job.cost
        this.waits.push(this.time - w.job.enqueuedAt)
        if (this.waits.length > 200) this.waits.shift()
      }
      if (w.job) {
        w.remaining -= dt
        if (w.remaining <= 0) {
          w.job = null
          w.completed++
          this.done++
          this.recent.push(this.time)
        }
      }
    }
    while (this.recent.length && this.recent[0] < this.time - 3) this.recent.shift()
  }

  stats(): WorkerPoolStats {
    const busy = this.workers.filter((w) => w.job).length
    const window = Math.min(3, this.time) || 1
    return {
      queued: this.queue.length,
      inFlight: busy,
      done: this.done,
      throughput: this.recent.length / window,
      avgWait: this.waits.length ? this.waits.reduce((a, b) => a + b, 0) / this.waits.length : 0,
      utilisation: busy / this.workers.length,
    }
  }

  /** Theoretical capacity in jobs/s for comparison with the arrival rate. */
  capacity(): number {
    // Mean of a log-normal with σ=0.45 ≈ median × e^(σ²/2)
    const mean = this.medianCost * Math.exp(0.45 ** 2 / 2)
    return this.workers.length / mean
  }
}
