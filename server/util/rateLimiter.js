export class RateLimiter {
  constructor({ rps = 1, maxConcurrent = 1, name = 'limiter' } = {}) {
    this.interval = Math.max(1, Math.floor(1000 / Math.max(1, rps)))
    this.maxConcurrent = Math.max(1, maxConcurrent)
    this.name = name
    this.queue = []
    this.running = 0
    this.timer = null
  }

  schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this._drain()
    })
  }

  _drain() {
    if (this.running >= this.maxConcurrent) return
    const next = this.queue.shift()
    if (!next) return
    this.running++
    const run = async () => {
      try {
        const res = await next.fn()
        next.resolve(res)
      } catch (e) {
        next.reject(e)
      } finally {
        this.running--
        // pace next execution
        setTimeout(() => this._drain(), this.interval)
      }
    }
    run()
  }
}

