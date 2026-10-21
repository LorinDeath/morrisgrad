#!/usr/bin/env python3
"""Integration conflict resolver for integ-preview (light-nowashout + ui-cursed-rework + dome-city + integ-city-light).
Applied after git rerere to every conflicted file still carrying markers. Each rule is a pure function of the
(ours, theirs) hunk, so it survives new commits on the branch heads as long as the conflict shape stays the same.
Exit 1 if some conflict could not be resolved (rebuild.sh then stops for manual work)."""
import re, sys, subprocess
PAT = re.compile(r'<<<<<<< [^\n]*\n(.*?)(?:\|\|\|\|\|\|\| [^\n]*\n.*?)?=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
KEY = lambda x: re.match(r"\['([^']+)'", x).group(1)

def union_list_line(a, b):
    """KINDS / Kind / ALL_TABS: one line on each side -> union of items (ours order, theirs-only appended)."""
    if a.startswith('export type Kind'):
        ia = [x.strip() for x in a.split('=', 1)[1].strip().rstrip(';').split('|')]
        ib = [x.strip() for x in b.split('=', 1)[1].strip().rstrip(';').split('|')]
        return a.split('=', 1)[0] + '= ' + ' | '.join(ia + [x for x in ib if x not in ia]) + ';\n'
    if 'ALL_TABS' in a:
        ia = re.findall(r"\['[^']+', '[^']*'\]", a); ib = re.findall(r"\['[^']+', '[^']*'\]", b)
        keys = {KEY(x) for x in ia}
        extra = [x for x in ib if KEY(x) not in keys]          # feature tabs go right before «⚒ Улучшение»
        k = next(i for i, x in enumerate(ia) if KEY(x) == 'upgrade')
        return 'const ALL_TABS = [' + ', '.join(ia[:k] + extra + ia[k:]) + '];\n'
    if 'KINDS' in a:
        ia = re.findall(r'"[^"]+"', a); ib = re.findall(r'"[^"]+"', b)
        return 'export const KINDS: Kind[] = [' + ', '.join(ia + [x for x in ib if x not in ia]) + '];\n'
    return None

def tables_union(ra, rb):
    """TABLES: add theirs-only `kind: { main: CFG }` entries before upgrade."""
    ea = dict(re.findall(r'(\w+): (\{ main: \w+ \})', ra)); eb = re.findall(r'(\w+): (\{ main: \w+ \})', rb)
    add = ''.join(f'{k}: {v}, ' for k, v in eb if k not in ea)
    return ra.replace('upgrade: { main: UPG }', add + 'upgrade: { main: UPG }', 1)

def resolve(path, a, b):
    if set(b.splitlines()) <= set(a.splitlines()):          # theirs already in ours (integ-city-light re-orders)
        return a
    if path.endswith('HANDOFF.md'):                          # both branch handoffs, ours first
        return a.rstrip('\n') + '\n\n---\n\n' + b
    if path.endswith('profile.ts') and 'kst: killStats' in b and 'light: lightClient()' in a:
        # snapshot/meta_state: light (lightClient) + kst + city fields
        return b.replace('bmv: blkVisClient(), ', 'bmv: blkVisClient(), light: lightClient(), ', 1)
    if path.endswith('terrainChunks.js') and 'texPref.js' in a and 'city/tiles_dark' in b:
        # ui: 16/32 sets via texPref TILES; city: only its own dark tileset imports (fixed 16 imports dropped)
        return a + ''.join(l + '\n' for l in b.splitlines() if 'city/tiles_dark' in l)
    if path.endswith('terrainChunks.js') and 'TILES.sheets' in a and 'this.dark' in b:
        return a + ''.join(l + '\n' for l in b.splitlines() if 'this.dark' in l)
    if a.count('\n') == 1 and b.count('\n') == 1 and '{ main:' in a and '{ main:' in b:
        return tables_union(a, b)
    if a.count('\n') == 1 and b.count('\n') == 1:
        r = union_list_line(a, b)
        if r: return r
    if all(l.startswith('import ') or not l.strip() for l in (a + b).splitlines()):
        return a + ''.join(l + '\n' for l in b.splitlines() if l not in a.splitlines())
    if path.endswith('overrides.ts') and '  rare:' in a and '  rare:' in b:
        ia, ib = a.index('  rare:'), b.index('  rare:')     # ours schemas + theirs schemas + rare + TABLES union
        return a[:ia] + b[:ib] + tables_union(a[ia:], b[ib:])
    if path.endswith('arinarLayout.ts') and 'waters' in a and 'cityW' in b:
        return b.replace('cityP, cityW };', 'cityP, cityW, waters }; // waters — быстрый отсев в liquid.ts (ui)')
    if path.endswith('propCollision.ts'):
        if a.startswith('import') and 'liquid' in a and 'cityBuild' in b:
            return a + b
        if 'resolveLiquid' in a and 'resolveRoom' in b:      # city interiors first (rooms never liquid), then props + liquid
            return ("  if (world === 'arinar' && inRoomArea(x, y)) return resolveRoom(x, y, r); // интерьер здания города (cityBuild.ts)\n"
                    "  const [px, py] = resolveCircle(worldGrid(world, x, y), x, y, r);\n"
                    "  const [lx, ly] = resolveLiquid(world, px, py);\n"
                    "  return lx === px && ly === py ? [px, py] : resolveCircle(worldGrid(world, lx, ly), lx, ly, r);\n"
                    "}\n"
                    "export function blockedWorld(world: string, x: number, y: number, r = BODY_R): boolean {\n"
                    "  if (world === 'arinar' && inRoomArea(x, y)) return !roomWalkable(x, y, r);\n"
                    "  return blocked(worldGrid(world, x, y), x, y, r) || inLiquid(world, x, y);\n")
    return None

def dedupe_schema(s):
    """git can auto-merge the same SCHEMA block (light) twice when it sits at different places on two branches: keep the first copy."""
    if 'export const SCHEMA' not in s: return s
    start = s.index('export const SCHEMA'); end = s.index('export const TABLES'); body = s[start:end]
    blk = re.compile(r'(  // [^\n]*\n)?  (\w+): \{ name: "[^"]*", fields: \[.*?\] \},\n', re.S)
    def rep(m):
        return '' if m.group(0) in body[:m.start()] else m.group(0)
    return s[:start] + blk.sub(rep, body) + s[end:]

def main():
    files = subprocess.run(['git', 'diff', '--name-only', '--diff-filter=U'], capture_output=True, text=True).stdout.split()
    bad = []
    for f in files:
        s = open(f).read()
        if '<<<<<<<' in s:
            def rep(m):
                r = resolve(f, m.group(1), m.group(2))
                if r is None: bad.append(f); return m.group(0)
                return r
            s = PAT.sub(rep, s)
        if f.endswith('overrides.ts'): s = dedupe_schema(s)
        open(f, 'w').write(s)
        if '<<<<<<<' not in s: print('resolved', f)
    if bad: print('UNRESOLVED', sorted(set(bad))); sys.exit(1)
main()
