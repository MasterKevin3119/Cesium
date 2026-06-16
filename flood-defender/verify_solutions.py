"""
FINAL VERIFICATION with 5x absorbRate + 5x absorbCapacity on placed tiles.
Designs educational reference solutions and outputs:
  1. Final damage/cost for each level
  2. Proposed damageCapForPass values
  3. Exact placement lists to paste into config.js
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
W=H=32

TILES = {
    'grass':      dict(absorbCapacity=5,    absorbRate=0.3,  damageValue=0,   placeable=False, cost=0),
    'river':      dict(absorbCapacity=0,    absorbRate=0,    damageValue=0,   placeable=False, cost=0),
    'house':      dict(absorbCapacity=0,    absorbRate=0,    damageValue=100, placeable=False, cost=0),
    # Placed tiles — 5x absorbRate, 5x absorbCapacity vs original
    'tree':       dict(absorbCapacity=150,  absorbRate=4.0,  damageValue=0,   placeable=True,  cost=40),
    'raingarden': dict(absorbCapacity=90,   absorbRate=3.0,  damageValue=0,   placeable=True,  cost=35),
    'wetland':    dict(absorbCapacity=250,  absorbRate=6.0,  damageValue=0,   placeable=True,  cost=60),
    'pond':       dict(absorbCapacity=1000, absorbRate=7.5,  damageValue=0,   placeable=True,  cost=120),
    'permeable':  dict(absorbCapacity=100,  absorbRate=3.0,  damageValue=0,   placeable=True,  cost=70),
    'levee':      dict(absorbCapacity=0,    absorbRate=0,    damageValue=0,   placeable=True,  cost=90),
}

SIM_CFG = dict(stormDurationTicks=60, floodThreshold=0.5, leveHeight=1.5)
LEVELS = [
    dict(id='L1', gridSeed=42,  numHouses=8,  numRiverCells=4, riverStartPos=(16,0),
         budget=800,  rainRate=0.15, riverInflow=0.2,  rainRampUp=10, rainPeak=20, rainRampDown=30),
    dict(id='L2', gridSeed=51,  numHouses=10, numRiverCells=5, riverStartPos=(16,0),
         budget=900,  rainRate=0.25, riverInflow=0.35, rainRampUp=8,  rainPeak=25, rainRampDown=27),
    dict(id='L3', gridSeed=63,  numHouses=12, numRiverCells=6, riverStartPos=(16,0),
         budget=950,  rainRate=0.35, riverInflow=0.5,  rainRampUp=7,  rainPeak=30, rainRampDown=23),
    dict(id='L4', gridSeed=73,  numHouses=14, numRiverCells=7, riverStartPos=(16,0),
         budget=1200, rainRate=0.45, riverInflow=0.65, rainRampUp=5,  rainPeak=35, rainRampDown=20),
]

def make_rng(seed):
    s=[seed]
    def r(): s[0]=(s[0]*9301+49297)%233280; return s[0]/233280
    return r

def generate_map(ld):
    g=[[{'type':'grass','elevation':0,'water':0.0,'absorbed':0.0} for _ in range(W)] for _ in range(H)]
    rng=make_rng(ld['gridSeed']); rx,ry=ld['riverStartPos']
    for i in range(ld['numRiverCells']):
        cy=ry+i
        if cy<H: g[cy][rx]['type']='river'
    houses=[]; placed=0
    while placed<ld['numHouses']:
        x=int(rng()*W); y=int(rng()*H)
        if g[y][x]['type']=='grass': g[y][x]['type']='house'; houses.append((x,y)); placed+=1
    for y in range(H):
        for x in range(W): g[y][x]['elevation']=int(rng()*3)
    return g, houses

def run_sim(ld, placements):
    g, _ = generate_map(ld)
    occ={(x,y) for y in range(H) for x in range(W) if g[y][x]['type']!='grass'}
    spent=0; skipped=[]
    for pl in placements:
        x,y,t=pl['x'],pl['y'],pl['type']
        if (x,y) in occ: skipped.append((x,y,t)); continue
        td=TILES[t]
        if not td['placeable']: continue
        g[y][x]['type']=t; spent+=td['cost']; occ.add((x,y))
    total_dmg=0.0
    rue=ld['rainRampUp']; pe=rue+ld['rainPeak']; pr=pe+ld['rainRampDown']
    for tick in range(1,SIM_CFG['stormDurationTicks']+1):
        if tick<=rue: rf=tick/rue
        elif tick<=pe: rf=1.0
        elif tick<=pr: rf=1.0-(tick-pe)/ld['rainRampDown']
        else: rf=0.0
        cr=ld['rainRate']*rf
        for y in range(H):
            for x in range(W):
                g[y][x]['water']+=cr
                if g[y][x]['type']=='river': g[y][x]['water']+=ld['riverInflow']
        for y in range(H):
            for x in range(W):
                c=g[y][x]; td=TILES[c['type']]
                if td['absorbCapacity']==0: continue
                can=min(td['absorbRate'],td['absorbCapacity']-c['absorbed'],c['water'])
                c['water']-=can; c['absorbed']+=can
        ng=[[{'type':g[y][x]['type'],'elevation':g[y][x]['elevation'],'water':0.0,'absorbed':g[y][x]['absorbed']}
             for x in range(W)] for y in range(H)]
        for y in range(H):
            for x in range(W):
                c=g[y][x]
                if c['water']<=0.01: ng[y][x]['water']+=c['water']; continue
                head=c['elevation']+c['water']; rem=c['water']
                for dx,dy in((0,-1),(0,1),(-1,0),(1,0)):
                    nx2,ny2=x+dx,y+dy
                    if not(0<=nx2<W and 0<=ny2<H): continue
                    n=g[ny2][nx2]; nh=n['elevation']+n['water']
                    if c['type']=='levee' and head<=SIM_CFG['leveHeight']: continue
                    if n['type']=='levee' and nh<=SIM_CFG['leveHeight']: continue
                    if nh>=head: continue
                    fa=min(rem*0.5,(head-nh)*0.3); rem-=fa; ng[ny2][nx2]['water']+=fa
                ng[y][x]['water']+=rem
        g=ng
        for y in range(H):
            for x in range(W):
                c=g[y][x]; td=TILES[c['type']]
                if td['damageValue']>0 and c['water']>SIM_CFG['floodThreshold']:
                    total_dmg+=(c['water']-SIM_CFG['floodThreshold'])*td['damageValue']
    return {'damage':total_dmg,'spent':spent,'skipped':skipped}

def p(x,y,t): return {'x':x,'y':y,'type':t}

def build_educational_solution(ld):
    """
    Build a solution that:
    1. Places trees flanking river (river health principle)
    2. Places 2 lowest-elevation tiles adjacent to each house (local drainage principle)
    Strategy is EDUCATIONAL: clearly demonstrates where to place tiles.
    """
    g, houses = generate_map(ld)
    occ={(x,y) for y in range(H) for x in range(W) if g[y][x]['type']!='grass'}
    rx, ry = ld['riverStartPos']

    budget = ld['budget']
    placements = []
    used = set(occ)

    # Step 1: Tree flanking for first 3 river rows (educational: river buffer)
    available = list(ld.get('availableTileTypes', ['tree','raingarden','wetland','pond','permeable','levee']))
    tree_cost = TILES['tree']['cost']

    # Use wetland if L3/L4, else tree for river flanking
    river_tile = 'wetland' if ld['id'] in ('L3','L4') else 'tree'
    river_tile_cost = TILES[river_tile]['cost']

    n_river_rows = min(ld['numRiverCells'], 3)
    for i in range(n_river_rows):
        cy = ry + i
        for cx in [rx-1, rx+1]:
            if 0<=cx<W and (cx,cy) not in used and budget >= river_tile_cost:
                placements.append(p(cx,cy,river_tile))
                used.add((cx,cy)); budget -= river_tile_cost

    # Step 2: For each house, place raingarden at the 2 LOWEST adjacent grass cells
    # (educational: local drainage moat)
    rg_cost = TILES['raingarden']['cost']

    for hx, hy in houses:
        h_elev = g[hy][hx]['elevation']
        # Get adjacent cells (4 cardinal directions only)
        adj = []
        for dx, dy in ((0,-1),(0,1),(-1,0),(1,0)):
            nx, ny = hx+dx, hy+dy
            if 0<=nx<W and 0<=ny<H and (nx,ny) not in used:
                adj.append((g[ny][nx]['elevation'], nx, ny))
        adj.sort()  # lowest elevation first (most effective drainage)

        count = 0
        for elev, nx, ny in adj:
            if budget >= rg_cost:
                placements.append(p(nx,ny,'raingarden'))
                used.add((nx,ny)); budget -= rg_cost; count += 1
                if count >= 2: break  # 2 drains per house

    # If budget remains, add a downstream pond
    pond_cost = TILES['pond']['cost']
    outlet_y = ry + ld['numRiverCells']  # just below river
    if 0<=outlet_y<H and (rx, outlet_y) not in used and budget >= pond_cost:
        placements.append(p(rx, outlet_y, 'pond'))
        used.add((rx, outlet_y)); budget -= pond_cost

    return placements

# ── Run and report ────────────────────────────────────────────────────────────
print('='*65)
print('FINAL REFERENCE SOLUTIONS (with 5x rate+cap physics)')
print('='*65)

results = {}
for ld in LEVELS:
    base   = run_sim(ld, [])['damage']
    sol    = build_educational_solution(ld)
    result = run_sim(ld, sol)
    pct    = 100*(1-result['damage']/base) if base>0 else 0
    ok     = 'OK' if result['spent'] <= ld['budget'] else 'OVER!'
    results[ld['id']] = (base, result['damage'], result['spent'], sol)
    print(f"\n{ld['id']}: baseline={base:.0f}  solution_dmg={result['damage']:.0f}  ({pct:.0f}% reduction)")
    print(f"   cost: ${result['spent']} / ${ld['budget']}  [{ok}]")
    if result['skipped']:
        print(f"   skipped: {result['skipped']}")

print('\n')
print('='*65)
print('PROPOSED damageCapForPass = 60% of baseline')
print('(reference clearly passes, doing nothing clearly fails)')
print('='*65)
for ld in LEVELS:
    base, dmg, spent, sol = results[ld['id']]
    cap = int(base * 0.6 / 100 + 0.999) * 100
    print(f"  {ld['id']}: cap={cap}  ref_dmg={dmg:.0f}  passes={'YES' if dmg<cap else 'NO'}  baseline_fails={'YES' if base>cap else 'NO'}")

print('\n')
print('='*65)
print('PLACEMENT LISTS for config.js referenceSolution')
print('='*65)
for ld in LEVELS:
    base, dmg, spent, sol = results[ld['id']]
    g, houses = generate_map(ld)
    occ={(x,y) for y in range(H) for x in range(W) if g[y][x]['type']!='grass'}
    seen=set()
    clean=[pl for pl in sol if (pl['x'],pl['y']) not in seen and not seen.add((pl['x'],pl['y']))]
    cost = sum(TILES[pl['type']]['cost'] for pl in clean)
    print(f"\n  // {ld['id']} referenceSolution  ${cost}/${ld['budget']}")
    for pl in clean:
        print(f"  {{x:{pl['x']},y:{pl['y']},type:'{pl['type']}'}},")
