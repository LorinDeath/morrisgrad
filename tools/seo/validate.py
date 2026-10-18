#!/usr/bin/env python3
"""SEO-проверка (локально или на проде, только чтение): sitemap XML, robots.txt, JSON-LD, мета-теги, h1, alt.
Запуск: python3 tools/seo/validate.py http://127.0.0.1:4391 [out.json]"""
import sys, json, re, urllib.request, urllib.robotparser, xml.etree.ElementTree as ET
from html.parser import HTMLParser
BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:4391'
OUT = sys.argv[2] if len(sys.argv) > 2 else None
SITE = 'https://morrisgrad.com'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
fails, notes, report = [], [], {}
def ok(c, m):
    (notes if c else fails).append(('PASS ' if c else 'FAIL ') + m)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)
def get(path):
    url = path if path.startswith('http') else BASE + path
    url = url.replace(SITE, BASE)
    req = urllib.request.Request(url, headers={'cookie': 'mg_dev_noclerk=1', 'user-agent': 'seo-validate/1.0'})
    try:
        r = opener.open(req, timeout=30); return r.status, dict(r.headers), r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode('utf-8', 'replace')

# --- robots.txt ---
st, h, robots = get('/robots.txt')
ok(st == 200 and 'text/plain' in h.get('Content-Type', h.get('content-type', '')), 'robots.txt 200 text/plain')
ok(f'Sitemap: {SITE}/sitemap.xml' in robots, 'robots.txt: строка Sitemap')
rp = urllib.robotparser.RobotFileParser(); rp.parse(robots.splitlines())
for p, allowed in [('/', True), ('/forum', True), ('/forum/t/3', True), ('/forum/u/1', True), ('/MorrisCurse', True), ('/games/sanctuary', True),
                   ('/api/forum/media/a/202610/x.webp', True), ('/api/forum/topics', False), ('/forum/me', False), ('/forum/notifications', False),
                   ('/forum/n/5', False), ('/forum/admin', False), ('/forum/new', False), ('/forum/edit/3', False), ('/profile', False), ('/inventory', False), ('/u/abc', False)]:
    # robotparser не знает Allow-приоритета по длине; для медиа проверяем вручную
    got = rp.can_fetch('Googlebot', SITE + p)
    ok(got == allowed, f'robots: {p} → {"allow" if allowed else "disallow"}')
report['robots'] = robots

# --- sitemaps ---
st, h, idx = get('/sitemap.xml')
ok(st == 200 and 'xml' in (h.get('Content-Type') or h.get('content-type') or ''), 'sitemap.xml 200 application/xml')
root = ET.fromstring(idx.encode())
ok(root.tag.endswith('sitemapindex'), 'sitemap.xml — sitemapindex')
subs = [e.find('s:loc', NS).text for e in root.findall('s:sitemap', NS)]
report['sitemaps'] = subs
all_urls = []
for sm in subs:
    st, h, x = get(sm)
    r = ET.fromstring(x.encode())
    ok(st == 200 and r.tag.endswith('urlset'), f'{sm.replace(SITE, "")} валидный urlset')
    urls = [(u.find('s:loc', NS).text, (u.find('s:lastmod', NS).text if u.find('s:lastmod', NS) is not None else None)) for u in r.findall('s:url', NS)]
    ok(len(urls) <= 50000, f'{sm.replace(SITE, "")}: {len(urls)} адресов (≤ 50000)')
    for loc, lm in urls:
        if lm: ok(re.match(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$', lm) is not None, f'lastmod ISO: {loc}')
    all_urls += [u for u, _ in urls]
ok(len(all_urls) == len(set(all_urls)), 'в картах нет дублей')
ok(all(u.startswith(SITE + '/') for u in all_urls), 'все адреса абсолютные https://morrisgrad.com')
bad = [u for u in all_urls if re.search(r'/forum/(me|notifications|n/|admin|new|edit/)|/profile|/inventory|/chat|/api/|/u/|tiny-swords|idealpage', u)]
ok(not bad, 'в картах нет личных/служебных/дублирующих адресов ' + (str(bad) if bad else ''))
report['sitemap_urls'] = all_urls
st_codes = {}
for u in all_urls:
    s, hh, body = get(u)
    st_codes[u] = s
    robots_meta = re.search(r'<meta name="robots" content="([^"]*)"', body)
    canon = re.search(r'<link rel="canonical" href="([^"]*)"', body)
    ok(s == 200, f'из карты отдаётся 200: {u} ({s})')
    if s == 200 and robots_meta: ok('noindex' not in robots_meta.group(1), f'в карте только индексируемое: {u}')
    if s == 200 and canon: ok(canon.group(1) == u, f'каноникал совпадает с адресом в карте: {u} → {canon.group(1)}')

# --- страницы: мета, h1, alt, JSON-LD ---
class P(HTMLParser):
    def __init__(s): super().__init__(); s.h1 = 0; s.imgs_noalt = []; s.ld = []; s._ld = False; s._buf = ''; s.title = ''; s._t = False; s.meta = {}; s.links = {}; s.lang = None
    def handle_starttag(s, t, a):
        a = dict(a)
        if t == 'html': s.lang = a.get('lang')
        if t == 'h1': s.h1 += 1
        if t == 'img' and a.get('alt') is None: s.imgs_noalt.append(a.get('src', '')[:80])
        if t == 'script' and a.get('type') == 'application/ld+json': s._ld = True; s._buf = ''
        if t == 'title' and not s.title: s._t = True
        if t == 'meta': s.meta[a.get('name') or a.get('property') or ''] = a.get('content')
        if t == 'link' and a.get('rel') == 'canonical': s.links['canonical'] = a.get('href')
    def handle_endtag(s, t):
        if t == 'script' and s._ld: s.ld.append(s._buf); s._ld = False
        if t == 'title': s._t = False
    def handle_data(s, d):
        if s._ld: s._buf += d
        if s._t: s.title += d
pages = ['/', '/forum', '/forum?tab=new', '/forum/sections', '/forum/rules', '/forum/s/curse', '/forum/s/curse?sort=top', '/forum/t/3', '/forum/t/4', '/forum/t/3?page=2',
         '/forum/u/1', '/books', '/heroes', '/heroes/veles', '/games', '/games/sanctuary', '/games/tiny-swords', '/MorrisCurse', '/changelog-site', '/allkonrass', '/forum/t/99999', '/no-such-page']
report['pages'] = {}
for path in pages:
    s, hh, body = get(path)
    p = P(); p.feed(body)
    info = {'status': s, 'title': p.title.strip(), 'h1': p.h1, 'robots': p.meta.get('robots'), 'canonical': p.links.get('canonical'), 'description': p.meta.get('description'),
            'og:image': p.meta.get('og:image'), 'og:type': p.meta.get('og:type'), 'twitter:card': p.meta.get('twitter:card'), 'og:locale': p.meta.get('og:locale'), 'lang': p.lang,
            'img_without_alt': p.imgs_noalt, 'jsonld_types': []}
    for raw in p.ld:
        try:
            o = json.loads(raw); info['jsonld_types'].append(o.get('@type'))
            ok(o.get('@context') == 'https://schema.org', f'JSON-LD @context {path}')
            if o.get('@type') in ('DiscussionForumPosting', 'Article'):
                for k in ('headline', 'author', 'datePublished', 'url'): ok(k in o, f'{path} {o["@type"]}.{k}')
                ok(o['author'].get('name'), f'{path} автор с именем')
                ok(any(i.get('interactionType', '').endswith('LikeAction') for i in o.get('interactionStatistic', [])), f'{path} interactionStatistic Like')
                ok(isinstance(o.get('commentCount'), int), f'{path} commentCount')
                if o['@type'] == 'DiscussionForumPosting': ok(o.get('text'), f'{path} DiscussionForumPosting.text')
            if o.get('@type') == 'BreadcrumbList':
                ok(all(i.get('item', '').startswith(SITE) for i in o['itemListElement']), f'{path} BreadcrumbList абсолютные item')
        except Exception as e:
            ok(False, f'JSON-LD парсится: {path}: {e}')
    report['pages'][path] = info
    is404 = path in ('/forum/t/99999', '/no-such-page')
    if is404:
        ok(s == 404, f'{path} → 404'); ok('noindex' in (info['robots'] or ''), f'{path} noindex'); ok(info['canonical'] is None, f'{path} без каноникала')
        ok('nf-btn' in body, f'{path}: оформленная страница 404')
        continue
    ok(s == 200, f'{path} 200')
    ok(info['lang'] == 'ru', f'{path} lang=ru')
    ok(info['title'] and 10 <= len(info['title']) <= 90, f'{path} title {len(info["title"])} симв.')
    ok(info['description'] and 50 <= len(info['description']) <= 200, f'{path} description {len(info["description"] or "")} симв.')
    ok(info['canonical'] and info['canonical'].startswith(SITE) and '?tab=' not in info['canonical'] and 'sort=' not in info['canonical'], f'{path} canonical {info["canonical"]}')
    ok(info['og:image'] and info['og:image'].startswith(SITE), f'{path} og:image абсолютный')
    ok(info['twitter:card'] == 'summary_large_image' and info['og:locale'] == 'ru_RU', f'{path} twitter card + og:locale')
    if not path.startswith('/games/') or path == '/games':
        ok(info['h1'] == 1, f'{path} ровно один h1 (сейчас {info["h1"]})')
    ok(not info['img_without_alt'], f'{path} у всех img есть alt {info["img_without_alt"][:3]}')
for path, rule in [('/forum?tab=new', 'noindex'), ('/forum/s/curse?sort=top', 'noindex'), ('/forum/t/3', 'index'), ('/forum', 'index'), ('/', 'index')]:
    r = report['pages'][path]['robots'] or ''
    ok(r.startswith(rule), f'{path} robots={r}')
ok(report['pages']['/forum/t/3?page=2']['canonical'] == SITE + '/forum/t/3?page=2', 'страница 2 комментариев — каноникал сама на себя')
ok(report['pages']['/games/tiny-swords']['canonical'] == SITE + '/games/ascetics', 'дубликат tiny-swords → каноникал ascetics')
ok('WebSite' in report['pages']['/']['jsonld_types'] and 'Organization' in report['pages']['/']['jsonld_types'], 'главная: WebSite + Organization')
print('\n'.join(fails) or 'no failures')
print(f'\nseo-validate: {len(notes)} PASS, {len(fails)} FAIL; sitemap URLs: {len(all_urls)}')
if OUT: json.dump(report, open(OUT, 'w'), ensure_ascii=False, indent=1)
sys.exit(1 if fails else 0)
