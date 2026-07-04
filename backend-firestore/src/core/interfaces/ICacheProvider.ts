export interface ICacheProvider {
  /**
   * Gets a value from the cache.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Sets a value in the cache.
   * @param ttlSeconds Optional time-to-live in seconds.
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Deletes a value from the cache.
   */
  del(key: string): Promise<void>;
}
