/*
 * lru_cache.c
 *
 * A fixed-capacity, string-keyed LRU cache for a long-running server.
 * Worker threads share a single cache instance so that parsed session
 * blobs don't have to be rebuilt on every request.
 *
 * Properties:
 *   - O(1) get/put/delete: chained hash table + doubly linked recency list
 *   - Bounded by entry count AND by total value bytes
 *   - Values are copied in and copied out; the cache owns its storage
 *   - Optional per-entry TTL, enforced lazily on access plus an explicit purge
 *   - Optional eviction callback so the owner can observe evictions
 *   - Thread-safe: every public function takes the cache mutex
 *
 * Build: cc -std=c11 -Wall -Wextra -pthread lru_cache.c -o lru_cache
 */

#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

#define LRU_MAX_KEY_LEN 64
#define LRU_MIN_BUCKETS 16

typedef void (*lru_evict_cb)(const char *key, const void *value,
                             size_t len, void *ctx);

typedef struct lru_entry {
    char              key[LRU_MAX_KEY_LEN];
    uint8_t          *value;
    size_t            value_len;
    time_t            expires_at;   /* 0 means "never expires" */
    struct lru_entry *hash_next;    /* bucket chain */
    struct lru_entry *prev;         /* towards most-recently-used */
    struct lru_entry *next;         /* towards least-recently-used */
} lru_entry_t;

typedef struct {
    uint64_t hits;
    uint64_t misses;
    uint64_t evictions;
    uint64_t expirations;
} lru_stats_t;

typedef struct {
    lru_entry_t   **buckets;
    size_t          nbuckets;

    lru_entry_t    *head;           /* most recently used  */
    lru_entry_t    *tail;           /* least recently used */

    size_t          count;
    size_t          capacity;       /* max number of entries */
    size_t          bytes_used;     /* sum of value_len over all entries */
    size_t          max_bytes;      /* max total value bytes */

    lru_evict_cb    on_evict;
    void           *evict_ctx;

    lru_stats_t     stats;
    pthread_mutex_t lock;
} lru_cache_t;

/* ------------------------------------------------------------------ */
/* Internal helpers (caller must hold c->lock)                        */
/* ------------------------------------------------------------------ */

static unsigned int hash_key(const char *key)
{
    unsigned int h = 5381;

    while (*key)
        h = h * 33 + *key++;

    return h;
}

static size_t bucket_index(const lru_cache_t *c, const char *key)
{
    return hash_key(key) % c->nbuckets;
}

static int is_expired(const lru_entry_t *e, time_t now)
{
    return e->expires_at != 0 && e->expires_at < now;
}

static void list_unlink(lru_cache_t *c, lru_entry_t *e)
{
    if (e->prev)
        e->prev->next = e->next;
    else
        c->head = e->next;

    if (e->next)
        e->next->prev = e->prev;
    else
        c->tail = e->prev;

    e->prev = NULL;
    e->next = NULL;
}

static void list_push_front(lru_cache_t *c, lru_entry_t *e)
{
    e->prev = NULL;
    e->next = c->head;

    if (c->head)
        c->head->prev = e;
    c->head = e;

    if (!c->tail)
        c->tail = e;
}

static void list_move_front(lru_cache_t *c, lru_entry_t *e)
{
    if (c->head == e)
        return;

    list_unlink(c, e);
    list_push_front(c, e);
}

static void hash_insert(lru_cache_t *c, lru_entry_t *e)
{
    size_t idx = bucket_index(c, e->key);

    e->hash_next = c->buckets[idx];
    c->buckets[idx] = e;
}

static void hash_remove(lru_cache_t *c, lru_entry_t *e)
{
    lru_entry_t **pp = &c->buckets[bucket_index(c, e->key)];

    while (*pp) {
        if (*pp == e) {
            *pp = e->hash_next;
            return;
        }
        pp = &(*pp)->hash_next;
    }
}

static lru_entry_t *find_entry(lru_cache_t *c, const char *key)
{
    lru_entry_t *e;

    for (e = c->buckets[bucket_index(c, key)]; e; e = e->hash_next) {
        if (strcmp(e->key, key) == 0)
            return e;
    }
    return NULL;
}

static void entry_free(lru_entry_t *e)
{
    free(e->value);
    free(e);
}

/* Remove an entry whose TTL has passed. */
static void drop_expired(lru_cache_t *c, lru_entry_t *e)
{
    list_unlink(c, e);
    hash_remove(c, e);
    c->count--;
    c->bytes_used -= e->value_len;
    c->stats.expirations++;
    entry_free(e);
}

/* Evict the least recently used entry and notify the owner. */
static void evict_tail(lru_cache_t *c)
{
    lru_entry_t *victim = c->tail;

    if (!victim)
        return;

    list_unlink(c, victim);
    hash_remove(c, victim);
    c->count--;
    c->bytes_used -= victim->value_len;
    c->stats.evictions++;

    if (c->on_evict)
        c->on_evict(victim->key, victim->value, victim->value_len,
                    c->evict_ctx);

    entry_free(victim);
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

lru_cache_t *lru_create(size_t capacity, size_t max_bytes,
                        lru_evict_cb on_evict, void *evict_ctx)
{
    lru_cache_t *c;

    if (capacity == 0 || max_bytes == 0)
        return NULL;

    c = calloc(1, sizeof(*c));
    if (!c)
        return NULL;

    c->nbuckets = capacity < LRU_MIN_BUCKETS ? LRU_MIN_BUCKETS : capacity;
    c->buckets = calloc(c->nbuckets, sizeof(*c->buckets));
    if (!c->buckets) {
        free(c);
        return NULL;
    }

    c->capacity  = capacity;
    c->max_bytes = max_bytes;
    c->on_evict  = on_evict;
    c->evict_ctx = evict_ctx;
    pthread_mutex_init(&c->lock, NULL);

    return c;
}

void lru_destroy(lru_cache_t *c)
{
    lru_entry_t *e, *next;

    if (!c)
        return;

    pthread_mutex_lock(&c->lock);
    for (e = c->head; e; e = next) {
        next = e->next;
        entry_free(e);
    }
    pthread_mutex_unlock(&c->lock);

    pthread_mutex_destroy(&c->lock);
    free(c->buckets);
    free(c);
}

/*
 * Insert or replace a value. Returns 0 on success, negative errno on failure.
 * ttl_secs == 0 means the entry never expires.
 */
int lru_put(lru_cache_t *c, const char *key, const void *value,
            size_t len, unsigned int ttl_secs)
{
    lru_entry_t *e;
    uint8_t *copy;
    time_t now;

    if (!c || !key || (!value && len))
        return -EINVAL;
    if (strlen(key) >= LRU_MAX_KEY_LEN)
        return -EINVAL;
    if (len > c->max_bytes)
        return -E2BIG;

    pthread_mutex_lock(&c->lock);
    now = time(NULL);

    copy = malloc(len ? len : 1);
    if (!copy) {
        pthread_mutex_unlock(&c->lock);
        return -ENOMEM;
    }
    if (len)
        memcpy(copy, value, len);

    e = find_entry(c, key);
    if (e) {
        /* Replace the value of an existing entry in place. */
        c->bytes_used -= e->value_len;
        free(e->value);
        e->value      = copy;
        e->value_len  = len;
        e->expires_at = ttl_secs ? now + ttl_secs : 0;
        c->bytes_used += len;
        list_move_front(c, e);
    } else {
        e = calloc(1, sizeof(*e));
        if (!e) {
            free(copy);
            pthread_mutex_unlock(&c->lock);
            return -ENOMEM;
        }
        strncpy(e->key, key, LRU_MAX_KEY_LEN);
        e->value      = copy;
        e->value_len  = len;
        e->expires_at = ttl_secs ? now + ttl_secs : 0;

        hash_insert(c, e);
        list_push_front(c, e);
        c->count++;
        c->bytes_used += len;
    }

    while (c->count > c->capacity || c->bytes_used > c->max_bytes)
        evict_tail(c);

    pthread_mutex_unlock(&c->lock);
    return 0;
}

/*
 * Copy the value for `key` into `out`. On success returns 0 and stores the
 * value length in *out_len. If `out` is too small, returns -ENOSPC and
 * stores the required size in *out_len.
 */
int lru_get(lru_cache_t *c, const char *key, void *out, size_t out_cap,
            size_t *out_len)
{
    lru_entry_t *e;

    if (!c || !key || !out || !out_len)
        return -EINVAL;

    pthread_mutex_lock(&c->lock);

    e = find_entry(c, key);
    if (!e) {
        c->stats.misses++;
        pthread_mutex_unlock(&c->lock);
        return -ENOENT;
    }

    if (is_expired(e, time(NULL))) {
        drop_expired(c, e);
        c->stats.misses++;
        pthread_mutex_unlock(&c->lock);
        return -ENOENT;
    }

    if (e->value_len > out_cap) {
        *out_len = e->value_len;
        pthread_mutex_unlock(&c->lock);
        return -ENOSPC;
    }

    memcpy(out, e->value, e->value_len);
    *out_len = e->value_len;

    list_move_front(c, e);
    c->stats.hits++;

    pthread_mutex_unlock(&c->lock);
    return 0;
}

int lru_delete(lru_cache_t *c, const char *key)
{
    lru_entry_t *e;

    if (!c || !key)
        return -EINVAL;

    pthread_mutex_lock(&c->lock);

    e = find_entry(c, key);
    if (!e) {
        pthread_mutex_unlock(&c->lock);
        return -ENOENT;
    }

    list_unlink(c, e);
    hash_remove(c, e);
    c->count--;
    c->bytes_used -= e->value_len;
    entry_free(e);

    pthread_mutex_unlock(&c->lock);
    return 0;
}

/* Remove every expired entry. Returns the number removed. */
size_t lru_purge_expired(lru_cache_t *c)
{
    lru_entry_t *e, *prev;
    size_t removed = 0;
    time_t now;

    if (!c)
        return 0;

    pthread_mutex_lock(&c->lock);
    now = time(NULL);

    for (e = c->tail; e; e = prev) {
        prev = e->prev;
        if (is_expired(e, now)) {
            drop_expired(c, e);
            removed++;
        }
    }

    pthread_mutex_unlock(&c->lock);
    return removed;
}

size_t lru_count(const lru_cache_t *c)
{
    return c->count;
}

/* Fraction of lookups that were hits, in [0.0, 1.0]. */
double lru_hit_ratio(lru_cache_t *c)
{
    uint64_t hits, total;

    pthread_mutex_lock(&c->lock);
    hits  = c->stats.hits;
    total = hits + c->stats.misses;
    pthread_mutex_unlock(&c->lock);

    return total ? (double)hits / (double)total : 0.0;
}

/* ------------------------------------------------------------------ */
/* Demo driver                                                        */
/* ------------------------------------------------------------------ */

struct evict_info {
    unsigned long count;
    char          last_key[LRU_MAX_KEY_LEN];
};

static void on_evict_record(const char *key, const void *value,
                            size_t len, void *ctx)
{
    struct evict_info *info = ctx;

    (void)value;
    (void)len;

    info->count++;
    strncpy(info->last_key, key, sizeof(info->last_key) - 1);
    info->last_key[sizeof(info->last_key) - 1] = '\0';
}

struct worker_args {
    lru_cache_t *cache;
    int          id;
};

static void *worker(void *arg)
{
    struct worker_args *wa = arg;
    char key[32];
    char buf[128];
    size_t n;
    int i;

    for (i = 0; i < 10000; i++) {
        snprintf(key, sizeof(key), "session:%d", (wa->id * 7 + i) % 200);

        if (lru_get(wa->cache, key, buf, sizeof(buf), &n) == -ENOENT) {
            snprintf(buf, sizeof(buf), "payload-for-%s", key);
            lru_put(wa->cache, key, buf, strlen(buf), 30);
        }
    }
    return NULL;
}

int main(void)
{
    struct evict_info info = { 0 };
    lru_cache_t *cache;
    pthread_t threads[4];
    struct worker_args args[4];
    char buf[64];
    size_t n;
    int i;

    cache = lru_create(128, 4096, on_evict_record, &info);
    if (!cache) {
        fprintf(stderr, "lru_create failed\n");
        return 1;
    }

    lru_put(cache, "greeting", "hello", 5, 0);
    if (lru_get(cache, "greeting", buf, sizeof(buf), &n) == 0)
        printf("greeting -> %.*s\n", (int)n, buf);

    for (i = 0; i < 4; i++) {
        args[i].cache = cache;
        args[i].id = i;
        pthread_create(&threads[i], NULL, worker, &args[i]);
    }
    for (i = 0; i < 4; i++)
        pthread_join(threads[i], NULL);

    printf("entries=%zu evictions=%lu last_evicted=%s hit_ratio=%.2f\n",
           lru_count(cache), info.count, info.last_key,
           lru_hit_ratio(cache));

    printf("purged %zu expired entries\n", lru_purge_expired(cache));

    lru_destroy(cache);
    return 0;
}
