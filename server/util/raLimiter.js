import { RateLimiter } from './rateLimiter.js'
import { LIMITS } from '../config.js'

export const raLimiter = new RateLimiter({
  rps: LIMITS.RA_RPS,
  maxConcurrent: LIMITS.RA_MAX_CONCURRENCY,
  name: 'ra-api'
})
