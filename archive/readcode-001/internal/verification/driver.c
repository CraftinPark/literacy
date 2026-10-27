/* Gate driver for readcode-001. Includes the unit under test, instruments its allocator,
 * and runs ONE named test per process (so crashes/hangs are attributable). */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static long g_live;               /* live allocations made by the unit under test */
static int  g_calloc_fail_at;     /* fail the Nth calloc (1-based) when > 0 */
static int  g_calloc_n;
static int  g_malloc0_null;       /* make malloc(0) return NULL, as the C standard permits */

static void *fake_calloc(size_t n, size_t s)
{
    if (g_calloc_fail_at && ++g_calloc_n == g_calloc_fail_at) return NULL;
    void *p = calloc(n, s); if (p) g_live++; return p;
}
static void *fake_malloc(size_t n)
{
    if (g_malloc0_null && n == 0) return NULL;
    void *p = malloc(n); if (p) g_live++; return p;
}
static void fake_free(void *p) { if (p) g_live--; free(p); }
#define calloc fake_calloc
#define malloc fake_malloc
#define free   fake_free
#define main   demo_main
#include UNIT
#undef main
#undef calloc
#undef malloc
#undef free

#define CHECK(c) do { if (!(c)) { fprintf(stderr, "FAIL: %s (line %d)\n", #c, __LINE__); return 1; } } while (0)

struct ev { char key[64]; int n; };
static void on_ev(const char *k, const void *v, size_t l, void *ctx)
{
    struct ev *e = ctx; (void)v; (void)l;
    strncpy(e->key, k, sizeof e->key - 1); e->key[sizeof e->key - 1] = 0; e->n++;
}
static int present(lru_cache_t *c, const char *k)
{
    char b[16]; size_t n; return lru_get(c, k, b, sizeof b, &n) == 0;
}

static int t0(void)   /* ordinary behaviour: must pass on BOTH versions */
{
    lru_cache_t *c = lru_create(3, 1000, NULL, NULL);
    CHECK(c);
    CHECK(lru_put(c, "a", "1", 1, 0) == 0 && lru_put(c, "b", "2", 1, 0) == 0 && lru_put(c, "c", "3", 1, 0) == 0);
    CHECK(present(c, "a"));
    CHECK(lru_put(c, "d", "4", 1, 0) == 0);
    CHECK(!present(c, "b") && present(c, "a") && present(c, "c") && present(c, "d"));
    CHECK(lru_delete(c, "c") == 0 && lru_count(c) == 2);
    lru_destroy(c);
    return 0;
}
static int t_B1(void)
{
    struct ev e = { {0}, 0 };
    lru_cache_t *c = lru_create(2, 1000, on_ev, &e);
    CHECK(c);
    lru_put(c, "a", "1", 1, 0); lru_put(c, "b", "2", 1, 0); lru_put(c, "c", "3", 1, 0);
    CHECK(e.n == 1 && strcmp(e.key, "a") == 0);
    lru_destroy(c);
    return 0;
}
static int t_B2(void)
{
    lru_cache_t *c = lru_create(8, 1000, NULL, NULL);
    CHECK(c);
    lru_put(c, "a", "1", 1, 1); lru_put(c, "b", "2", 1, 1);
    sleep(2);
    CHECK(lru_purge_expired(c) == 2 && lru_count(c) == 0);
    lru_destroy(c);
    return 0;
}
static int t_B3(void)
{
    char b[8]; size_t n; char big[60] = {0};
    lru_cache_t *c = lru_create(8, 150, NULL, NULL);
    CHECK(c);
    lru_put(c, "a", big, sizeof big, 1); lru_put(c, "b", big, sizeof big, 1);   /* 120 of 150 bytes used */
    sleep(2);
    CHECK(lru_get(c, "a", b, sizeof b, &n) == -ENOENT && lru_get(c, "b", b, sizeof b, &n) == -ENOENT);
    CHECK(c->bytes_used == 0);                 /* accounting must return to zero when everything expired */
    lru_destroy(c);
    return 0;
}
static int t_B4(void)
{
    char key[65]; char b[8]; size_t n;
    lru_cache_t *c = lru_create(8, 1000, NULL, NULL);
    CHECK(c);
    memset(key, 'A', 64); key[64] = 0;
    int rc = lru_put(c, key, "v", 1, 0);
    CHECK(rc == -EINVAL || (rc == 0 && lru_get(c, key, b, sizeof b, &n) == 0));   /* reject, or round-trip */
    lru_destroy(c);
    return 0;
}
static int t_B5(void)
{
    lru_cache_t *c = lru_create(2, 1000, NULL, NULL);
    CHECK(c);
    lru_put(c, "a", "1", 1, 0); lru_put(c, "b", "2", 1, 0);
    lru_put(c, "a", "9", 1, 0);                /* refresh a */
    lru_put(c, "c", "3", 1, 0);                /* must evict b, not a */
    CHECK(present(c, "a") && !present(c, "b"));
    lru_destroy(c);
    return 0;
}
static int t_B6(void)
{
    g_calloc_fail_at = 2;                      /* second calloc in lru_create: the bucket array */
    lru_cache_t *c = lru_create(4, 100, NULL, NULL);
    CHECK(c == NULL);
    CHECK(g_live == 0);
    return 0;
}
static int t_B7(void)
{
    lru_cache_t *c = lru_create(4, 100, NULL, NULL);
    CHECK(c);
    lru_destroy(c);
    CHECK(g_live == 0);
    return 0;
}
static int t_B8(void)
{
    char b[8]; size_t n;
    lru_cache_t *c = lru_create(4, 100, NULL, NULL);
    CHECK(c);
    CHECK(lru_hit_ratio(c) == 0.0);            /* no lookups yet: must not divide by zero */
    lru_put(c, "a", "1", 1, 0);
    lru_get(c, "a", b, sizeof b, &n); lru_get(c, "zz", b, sizeof b, &n);
    double r = lru_hit_ratio(c);
    CHECK(r > 0.49 && r < 0.51);               /* 1 hit, 1 miss */
    lru_destroy(c);
    return 0;
}
static int t_B9(void)
{
    char b[8];
    lru_cache_t *c = lru_create(4, 100, NULL, NULL);
    CHECK(c);
    lru_put(c, "a", "1", 1, 0);
    CHECK(lru_get(c, "a", b, sizeof b, NULL) == -EINVAL);
    lru_destroy(c);
    return 0;
}
static int t_B10(void)
{
    char b[8]; size_t n = 99;
    lru_cache_t *c = lru_create(4, 100, NULL, NULL);
    CHECK(c);
    g_malloc0_null = 1;                        /* conforming allocator: malloc(0) may return NULL */
    CHECK(lru_put(c, "k", "", 0, 0) == 0);
    g_malloc0_null = 0;
    CHECK(lru_get(c, "k", b, sizeof b, &n) == 0 && n == 0);
    lru_destroy(c);
    return 0;
}

int main(int argc, char **argv)
{
    static const struct { const char *name; int (*fn)(void); } T[] = {
        {"t0", t0}, {"B1", t_B1}, {"B2", t_B2}, {"B3", t_B3}, {"B4", t_B4}, {"B5", t_B5},
        {"B6", t_B6}, {"B7", t_B7}, {"B8", t_B8}, {"B9", t_B9}, {"B10", t_B10},
    };
    if (argc != 2) return 2;
    for (size_t i = 0; i < sizeof T / sizeof *T; i++)
        if (!strcmp(T[i].name, argv[1])) { int r = T[i].fn(); if (!r) puts("PASS"); return r; }
    return 2;
}
