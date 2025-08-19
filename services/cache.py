import time
import logging
from typing import Any, Optional, Dict

logger = logging.getLogger(__name__)

class Cache:
    """Simple in-memory cache with TTL support."""
    
    def __init__(self, ttl: int = 600):
        """
        Initialize cache with TTL in seconds.
        
        Args:
            ttl: Time to live in seconds (default: 600 = 10 minutes)
        """
        self.ttl = ttl
        self._cache: Dict[str, Dict[str, Any]] = {}
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache if not expired.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value if exists and not expired, None otherwise
        """
        if key not in self._cache:
            logger.debug(f"Cache miss: {key} (key not found)")
            return None
        
        entry = self._cache[key]
        current_time = time.time()
        
        if current_time > entry['expires_at']:
            # Entry has expired, remove it
            del self._cache[key]
            logger.debug(f"Cache miss: {key} (expired)")
            return None
        
        logger.debug(f"Cache hit: {key}")
        return entry['data']
    
    def set(self, key: str, value: Any) -> None:
        """
        Set value in cache with TTL.
        
        Args:
            key: Cache key
            value: Value to cache
        """
        current_time = time.time()
        expires_at = current_time + self.ttl
        
        self._cache[key] = {
            'data': value,
            'expires_at': expires_at,
            'created_at': current_time
        }
        
        logger.debug(f"Cached: {key} (expires in {self.ttl}s)")
    
    def delete(self, key: str) -> bool:
        """
        Delete entry from cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if key existed and was deleted, False otherwise
        """
        if key in self._cache:
            del self._cache[key]
            logger.debug(f"Deleted from cache: {key}")
            return True
        return False
    
    def clear(self) -> None:
        """Clear all entries from cache."""
        self._cache.clear()
        logger.debug("Cache cleared")
    
    def cleanup_expired(self) -> int:
        """
        Remove all expired entries from cache.
        
        Returns:
            Number of expired entries removed
        """
        current_time = time.time()
        expired_keys = []
        
        for key, entry in self._cache.items():
            if current_time > entry['expires_at']:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self._cache[key]
        
        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")
        
        return len(expired_keys)
    
    def size(self) -> int:
        """Get current cache size."""
        return len(self._cache)
    
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        current_time = time.time()
        total_entries = len(self._cache)
        expired_entries = sum(
            1 for entry in self._cache.values()
            if current_time > entry['expires_at']
        )
        
        return {
            'total_entries': total_entries,
            'active_entries': total_entries - expired_entries,
            'expired_entries': expired_entries,
            'ttl_seconds': self.ttl
        }
