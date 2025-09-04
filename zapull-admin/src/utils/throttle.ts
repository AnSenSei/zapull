// Request throttling utility to prevent API spam
// This helps prevent the excessive requests that were causing the 1000 request limit to be exceeded

interface ThrottleOptions {
  delay: number; // milliseconds between calls
  leading?: boolean; // call immediately on first invocation
  trailing?: boolean; // call after the delay on last invocation
}

interface PendingCall {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  args: any[];
}

class RequestThrottler {
  private lastCallTime = 0;
  private timeout: NodeJS.Timeout | null = null;
  private pendingCall: PendingCall | null = null;
  
  constructor(
    private fn: (...args: any[]) => Promise<any>,
    private options: ThrottleOptions
  ) {}
  
  async execute(...args: any[]): Promise<any> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    // If enough time has passed, execute immediately
    if (timeSinceLastCall >= this.options.delay) {
      this.lastCallTime = now;
      return await this.fn(...args);
    }
    
    // If there's already a pending call, cancel it and replace with this one
    if (this.pendingCall) {
      this.pendingCall.reject(new Error('Request superseded by newer request'));
    }
    
    // Create a new pending call
    return new Promise((resolve, reject) => {
      this.pendingCall = { resolve, reject, args };
      
      // Clear existing timeout
      if (this.timeout) {
        clearTimeout(this.timeout);
      }
      
      // Set new timeout
      const remainingDelay = this.options.delay - timeSinceLastCall;
      this.timeout = setTimeout(async () => {
        if (this.pendingCall) {
          const { resolve: pendingResolve, reject: pendingReject, args: pendingArgs } = this.pendingCall;
          this.pendingCall = null;
          this.timeout = null;
          this.lastCallTime = Date.now();
          
          try {
            const result = await this.fn(...pendingArgs);
            pendingResolve(result);
          } catch (error) {
            pendingReject(error);
          }
        }
      }, remainingDelay);
    });
  }
  
  cancel() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.pendingCall) {
      this.pendingCall.reject(new Error('Request cancelled'));
      this.pendingCall = null;
    }
  }
}

export function createThrottledFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T, 
  delay: number = 2000
): T {
  const throttler = new RequestThrottler(fn, { delay });
  
  return ((...args: any[]) => throttler.execute(...args)) as T;
}

// Request deduplication - prevent identical requests
const requestCache = new Map<string, { promise: Promise<any>; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds

export function createDeduplicatedFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  getCacheKey?: (...args: Parameters<T>) => string
): T {
  return (async (...args: Parameters<T>) => {
    // Generate cache key
    const cacheKey = getCacheKey ? getCacheKey(...args) : JSON.stringify(args);
    const now = Date.now();
    
    // Check if we have a recent cached request
    const cached = requestCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      console.log('🔄 DEDUPLICATED REQUEST:', cacheKey);
      return await cached.promise;
    }
    
    // Create new request
    console.log('🚀 NEW REQUEST:', cacheKey);
    const promise = fn(...args);
    
    // Cache the promise
    requestCache.set(cacheKey, { promise, timestamp: now });
    
    // Clean up cache after TTL
    setTimeout(() => {
      requestCache.delete(cacheKey);
    }, CACHE_TTL);
    
    return await promise;
  }) as T;
}

// Combined throttling and deduplication
export function createOptimizedApiFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number = 2000,
  getCacheKey?: (...args: Parameters<T>) => string
): T {
  const deduplicatedFn = createDeduplicatedFunction(fn, getCacheKey);
  return createThrottledFunction(deduplicatedFn, delay);
}
