"""
Final physics diagnosis: test rate * cap combos with basin-drain strategy.
Key question: what multiplier achieves >50% damage reduction for L2-L4?
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
W=H=32

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

def make_tiles(rate_mult=1.0, cap_mult=1.0):
    return {
        'grass':      dict(absorbCapacity=5,            absorbRate=0.3,            damageValue=0,   placeable=False, cost=0),
        'river':      dict(absorbCapacity=0,            absorbRate=0,              damageValue=0,   placeable=False, cost=0),
        'house':      dict(absorbCapacity=0,            absorbRate=0,              damageValue=100, placeable=False, cost=0),
        'tree':       dict(absorbCapacity=30*cap_mult,  absorbRate=0.8*rate_mult,  damageValue=0,   placeable=True,  cost=40),
        'raingarden': dict(absorbCapacity=18*cap_mult,  absorbRate=0.6*rate_mult,  damageValue=0,   placeable=True,  cost=35),
        'wetland':    dict(absorbCapacity=50*cap_mult,  absorbRate=1.2*rate_mult,  damageValue=0,   placeable=True,  cost=60),
        'pond':       dict(absorbCapacity=200*cap_mult, absorbRate=1.5*rate_mult,  damageValue=0,   placeable=True,  cost=120),
        'permeable':  dict(absorbCapacity=20*cap_mult,  absorbRate=0.6*rate_mult,  damageValue=0,   placeable=True,  cost=70),
        'levee':      dict(absorbCapacity=0,            absorbRate=0,              damageValue=0,   placeable=True,  cost=90),
    }

SIM_CFG = dict(stormDurationTicks=60, floodThreshold=0.5, leveHeight=1.5)

def run_sim(ld, placements, TILES, rain_mult=1.0):
    g, _ = generate_map(ld)
    occ={(x,y) for y in range(H) for x in range(W) if g[y][x]['type']!='grass'}
    for pl in placements:
        x,y,t=pl['x'],pl['y'],pl['type']
        if (x,y) in occ: continue
        td=TILES[t]
        if td['placeable']: g[y][x]['type']=t; occ.add((x,y))
    total_dmg=0.0
    rue=ld['rainRampUp']; pe=rue+ld['rainPeak']; pr=pe+ld['rainRampDown']
    for tick in range(1,SIM_CFG['stormDurationTicks']+1):
        if tick<=rue: rf=tick/rue
        elif tick<=pe: rf=1.0
        elif tick<=pr: rf=1.0-(tick-pe)/ld['rainRampDown']
        else: rf=0.0
        cr=ld['rainRate']*rf*rain_mult
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
    return total_dmg

def p(x,y,t): return {'x':x,'y':y,'type':t}

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

def basin_drain_solution(ld, TILES, tile_type='raingarden'):
    g, houses = generate_map(ld)
    occ={(x,y) for y in range(H) for x in range(W) if g[y][x]['type']!='grass'}
    n_tiles = ld['budget'] // TILES[tile_type]['cost']
    candidates = []
    for cy in range(H):
        for cx in range(W):
            if (cx,cy) in occ: continue
            min_dist = min(abs(cx-h[0])+abs(cy-h[1]) for h in houses)
            if min_dist > 5: continue
            candidates.append((g[cy][cx]['elevation'], min_dist, cx, cy))
    candidates.sort()
    placements=[]; used=set(); budget_left=ld['budget']
    for elev, dist, x, y in candidates:
        if (x,y) in used: continue
        cost = TILES[tile_type]['cost']
        if budget_left >= cost:
            used.add((x,y)); placements.append(p(x,y,tile_type)); budget_left -= cost
            if len(placements) >= n_tiles: break
    return placements

# Test different approaches
print('='*70)
print('FINAL PHYSICS FIX COMPARISON')
print('Basin-drain strategy. Target: >50% reduction for all levels.')
print('='*70)

base_tiles = make_tiles(1.0)
SCENARIOS = [
    ('No change',           lambda ld: (base_tiles, 1.0)),
    ('5x rate only',        lambda ld: (make_tiles(5.0,1.0), 1.0)),
    ('5x cap only',         lambda ld: (make_tiles(1.0,5.0), 1.0)),
    ('5x rate+cap',         lambda ld: (make_tiles(5.0,5.0), 1.0)),
    ('50% rain',            lambda ld: (base_tiles, 0.5)),
    ('50%rain + 5x rate',   lambda ld: (make_tiles(5.0,1.0), 0.5)),
    ('50%rain + 5x r+c',    lambda ld: (make_tiles(5.0,5.0), 0.5)),
    ('25% rain',            lambda ld: (base_tiles, 0.25)),
    ('25%rain + 3x r+c',    lambda ld: (make_tiles(3.0,3.0), 0.25)),
]

for ld in LEVELS:
    print(f"\n{ld['id']} (budget ${ld['budget']}):")
    T0 = make_tiles(1.0)
    base = run_sim(ld, [], T0)
    print(f"  baseline = {base:.0f}")
    for name, get_params in SCENARIOS:
        T, rm = get_params(ld)
        sol = basin_drain_solution(ld, T)
        base2 = run_sim(ld, [], T, rm)
        dmg  = run_sim(ld, sol, T, rm)
        pct  = 100*(1-dmg/base2) if base2>0 else 0
        print(f"  {name:<24}: base2={base2:>8.0f}  sol={dmg:>8.0f}  ({pct:>4.0f}%reduction)")
