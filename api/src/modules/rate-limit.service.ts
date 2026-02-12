import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

type Bucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();
  private readonly redis: Redis | null;

  constructor() {
    const redisUrl = process.env.REDIS_URL?.trim();
    this.redis = redisUrl
      ? new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          lazyConnect: false,
        })
      : null;
    this.redis?.on('error', () => {
      // fallback to memory limiter if redis is unavailable
    });
  }

  async assertWithinLimit(key: string, limit: number, windowMs: number) {
    const redisKey = `rl:${key}`;
    if (this.redis) {
      try {
        const result = await this.redis
          .multi()
          .incr(redisKey)
          .pexpire(redisKey, windowMs, 'NX')
          .exec();

        const count = Number(result?.[0]?.[1] ?? 0);
        if (count > limit) {
          throw new HttpException('Rate limit exceeded. Please retry later.', HttpStatus.TOO_MANY_REQUESTS);
        }
        return;
      } catch {
        // fallback to in-memory limiter below
      }
    }

    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    if (current.count >= limit) {
      throw new HttpException('Rate limit exceeded. Please retry later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    current.count += 1;
    this.buckets.set(key, current);
  }
}
