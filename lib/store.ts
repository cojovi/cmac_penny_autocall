import Redis from 'ioredis';

export interface LeadData {
  first_name: string;
  last_name: string;
  lead_full_name: string;
  lead_phone: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  request_type: string;
  location: string;
  source_site: string;
  wix_submission_id: string;
  wix_contact_id: string;
}

class Store {
  private redis: Redis | null = null;
  private inMemoryStore = new Map<string, LeadData>();

  constructor() {
    this.initRedis();
  }

  private initRedis() {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (redisUrl && redisToken && redisUrl.startsWith('https://')) {
      try {
        // For Upstash Redis REST API, use the HTTP REST interface
        this.redis = new Redis(redisUrl, {
          password: redisToken,
          tls: {
            rejectUnauthorized: false
          },
          lazyConnect: true,
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
        });

        this.redis.on('error', (err) => {
          console.error('Redis connection error:', err);
          this.redis = null;
          console.log('Falling back to in-memory storage due to Redis error');
        });

        console.log('Redis initialized for production storage');
      } catch (error) {
        console.warn('Failed to initialize Redis, falling back to in-memory storage:', error);
        this.redis = null;
      }
    } else {
      console.log('Redis credentials not found or invalid, using in-memory storage for development');
    }
  }

  async set(key: string, data: LeadData): Promise<void> {
    const ttl = parseInt(process.env.LEAD_TTL_SEC || '86400', 10);

    if (this.redis) {
      try {
        await this.redis.setex(key, ttl, JSON.stringify(data));
        return;
      } catch (error) {
        console.error('Redis set error, falling back to in-memory:', error);
      }
    }

    // In-memory fallback
    this.inMemoryStore.set(key, data);

    // Set TTL for in-memory store
    setTimeout(() => {
      this.inMemoryStore.delete(key);
    }, ttl * 1000);
  }

  async get(key: string): Promise<LeadData | null> {
    if (this.redis) {
      try {
        const result = await this.redis.get(key);
        return result ? JSON.parse(result) : null;
      } catch (error) {
        console.error('Redis get error, falling back to in-memory:', error);
      }
    }

    // In-memory fallback
    return this.inMemoryStore.get(key) || null;
  }

  async storeLeadData(phoneKey: string, submissionKey: string, data: LeadData): Promise<string[]> {
    const keys = [];

    // Store by phone number (primary lookup)
    if (phoneKey) {
      await this.set(phoneKey, data);
      keys.push(phoneKey);
    }

    // Store by submission ID (fallback lookup)
    if (submissionKey && submissionKey !== phoneKey) {
      await this.set(submissionKey, data);
      keys.push(submissionKey);
    }

    return keys;
  }

  async getLeadData(phoneKey?: string, submissionKey?: string): Promise<LeadData | null> {
    // Try phone key first (most common lookup)
    if (phoneKey) {
      const data = await this.get(phoneKey);
      if (data) return data;
    }

    // Fallback to submission key
    if (submissionKey && submissionKey !== phoneKey) {
      const data = await this.get(submissionKey);
      if (data) return data;
    }

    return null;
  }
}

// Singleton instance
export const store = new Store();