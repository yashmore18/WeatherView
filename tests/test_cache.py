import pytest
import time
from services.cache import Cache

class TestCache:
    """Test suite for Cache class."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.cache = Cache(ttl=1)  # 1 second TTL for fast testing
    
    def test_init_default_ttl(self):
        """Test cache initialization with default TTL."""
        cache = Cache()
        assert cache.ttl == 600  # Default 10 minutes
        assert cache.size() == 0
    
    def test_init_custom_ttl(self):
        """Test cache initialization with custom TTL."""
        cache = Cache(ttl=300)
        assert cache.ttl == 300
    
    def test_set_and_get(self):
        """Test basic set and get operations."""
        # Set a value
        self.cache.set('test_key', 'test_value')
        
        # Get the value
        result = self.cache.get('test_key')
        assert result == 'test_value'
        
        # Verify cache size
        assert self.cache.size() == 1
    
    def test_get_nonexistent_key(self):
        """Test getting a key that doesn't exist."""
        result = self.cache.get('nonexistent_key')
        assert result is None
    
    def test_get_expired_key(self):
        """Test getting a key that has expired."""
        # Set a value
        self.cache.set('expire_key', 'expire_value')
        
        # Verify it exists
        assert self.cache.get('expire_key') == 'expire_value'
        
        # Wait for expiration (TTL is 1 second)
        time.sleep(1.1)
        
        # Verify it's now expired and returns None
        result = self.cache.get('expire_key')
        assert result is None
        
        # Verify it was removed from internal storage
        assert self.cache.size() == 0
    
    def test_overwrite_existing_key(self):
        """Test overwriting an existing key."""
        # Set initial value
        self.cache.set('key', 'value1')
        assert self.cache.get('key') == 'value1'
        
        # Overwrite with new value
        self.cache.set('key', 'value2')
        assert self.cache.get('key') == 'value2'
        
        # Size should still be 1
        assert self.cache.size() == 1
    
    def test_delete_existing_key(self):
        """Test deleting an existing key."""
        # Set a value
        self.cache.set('delete_key', 'delete_value')
        assert self.cache.size() == 1
        
        # Delete the key
        result = self.cache.delete('delete_key')
        assert result is True
        assert self.cache.size() == 0
        assert self.cache.get('delete_key') is None
    
    def test_delete_nonexistent_key(self):
        """Test deleting a key that doesn't exist."""
        result = self.cache.delete('nonexistent_key')
        assert result is False
    
    def test_clear(self):
        """Test clearing all cache entries."""
        # Set multiple values
        self.cache.set('key1', 'value1')
        self.cache.set('key2', 'value2')
        self.cache.set('key3', 'value3')
        assert self.cache.size() == 3
        
        # Clear cache
        self.cache.clear()
        assert self.cache.size() == 0
        assert self.cache.get('key1') is None
        assert self.cache.get('key2') is None
        assert self.cache.get('key3') is None
    
    def test_cleanup_expired(self):
        """Test cleanup of expired entries."""
        # Set values with short TTL
        self.cache.set('key1', 'value1')
        self.cache.set('key2', 'value2')
        assert self.cache.size() == 2
        
        # Wait for expiration
        time.sleep(1.1)
        
        # Add a new key (this one shouldn't expire)
        self.cache.set('key3', 'value3')
        assert self.cache.size() == 3  # All still in storage
        
        # Run cleanup
        expired_count = self.cache.cleanup_expired()
        
        # Verify cleanup results
        assert expired_count == 2
        assert self.cache.size() == 1
        assert self.cache.get('key1') is None
        assert self.cache.get('key2') is None
        assert self.cache.get('key3') == 'value3'
    
    def test_cleanup_expired_no_expired_entries(self):
        """Test cleanup when no entries are expired."""
        # Set fresh values
        self.cache.set('key1', 'value1')
        self.cache.set('key2', 'value2')
        
        # Run cleanup immediately
        expired_count = self.cache.cleanup_expired()
        
        # Nothing should be expired
        assert expired_count == 0
        assert self.cache.size() == 2
    
    def test_stats(self):
        """Test cache statistics."""
        # Initially empty
        stats = self.cache.stats()
        assert stats['total_entries'] == 0
        assert stats['active_entries'] == 0
        assert stats['expired_entries'] == 0
        assert stats['ttl_seconds'] == 1
        
        # Add some entries
        self.cache.set('key1', 'value1')
        self.cache.set('key2', 'value2')
        
        stats = self.cache.stats()
        assert stats['total_entries'] == 2
        assert stats['active_entries'] == 2
        assert stats['expired_entries'] == 0
        
        # Wait for expiration
        time.sleep(1.1)
        
        # Add new entry
        self.cache.set('key3', 'value3')
        
        stats = self.cache.stats()
        assert stats['total_entries'] == 3
        assert stats['active_entries'] == 1  # Only key3 is active
        assert stats['expired_entries'] == 2  # key1 and key2 expired
    
    def test_complex_data_types(self):
        """Test caching complex data types."""
        # Test dictionary
        test_dict = {'name': 'John', 'age': 30, 'city': 'New York'}
        self.cache.set('dict_key', test_dict)
        result = self.cache.get('dict_key')
        assert result == test_dict
        
        # Test list
        test_list = [1, 2, 3, 'hello', {'nested': 'value'}]
        self.cache.set('list_key', test_list)
        result = self.cache.get('list_key')
        assert result == test_list
        
        # Test None value
        self.cache.set('none_key', None)
        result = self.cache.get('none_key')
        assert result is None
        
        # Test boolean
        self.cache.set('bool_key', True)
        result = self.cache.get('bool_key')
        assert result is True
    
    def test_cache_key_formats(self):
        """Test various cache key formats."""
        # Test different key formats
        keys_and_values = [
            ('simple_key', 'simple_value'),
            ('key:with:colons', 'colon_value'),
            ('key_with_underscores', 'underscore_value'),
            ('key-with-dashes', 'dash_value'),
            ('key.with.dots', 'dot_value'),
            ('weather:current:London:metric', 'weather_data'),
            ('forecast:40.7128,-74.0060:imperial', 'forecast_data')
        ]
        
        for key, value in keys_and_values:
            self.cache.set(key, value)
            result = self.cache.get(key)
            assert result == value, f"Failed for key: {key}"
        
        assert self.cache.size() == len(keys_and_values)
