"""The auction house search result on screen, read from the running game's Lua state (read-only): every listed item's price and affixes.
LuaObjectMap[*_AuctionHouseShowGoodV2].GoodDatas[i].GoodData._Raw_Data: PriceNum / PriceType (100300 = Flame Elementium), ItemData._Raw_Data:
ConfigBaseId, Level, AffixList.{Prefix,Suffix}InfoList[j]: Id, TLv (tier), Complex (text), DynArgs.
usage (elevated shell, game running, a market search open): python scripts/market_listings.py  -> JSON on stdout. Env DPS_DEBUG: the dps-debug checkout
(its reader/ supplies the memory and Lua access; default: the sibling ../dps-debug)."""
import json, os, re, sys
from pathlib import Path
DD = Path(os.environ.get('DPS_DEBUG') or Path(__file__).resolve().parents[2] / 'dps-debug')
sys.path[:0] = [str(DD / 'reader'), str(DD / 're' / 'tools')]
from mem import Proc
from lua import Lua

def listings(L):
    objs = L.path(L.globals(), 'LuaObjectMgr', 'LuaObjectMap')
    # the client keeps an old results view next to the one on screen (a memory search opens a second one): the newest view with goods
    shows = sorted(((int(k.split('_')[0]), v) for k, v in L.items(objs) if isinstance(k, str) and k.endswith('_AuctionHouseShowGoodV2')), key=lambda kv: -kv[0])
    goods = next((g for _, v in shows for g in [L.get(v, 'GoodDatas')] if g and any(True for _ in L.items(g))), None)
    if not goods:
        return []
    val = lambda tv: tv and L.val(tv)
    def side(aff, name):
        lst = aff and L.get(aff, name)
        out = []
        for _, a in sorted(L.items(lst) if lst else [], key=lambda kv: kv[0]):
            dyn = L.get(a, 'DynArgs')
            out.append({'id': val(L.get(a, 'Id')), 'tier': val(L.get(a, 'TLv')), 'text': re.sub(r'<[^>]+>', '', str(val(L.get(a, 'Complex')) or '')),
                        'dyn': [val(x) for _, x in sorted(L.items(dyn), key=lambda kv: kv[0])] if dyn else []})
        return out
    res = []
    for i, g in sorted(L.items(goods), key=lambda kv: kv[0]):
        raw = L.path(g, 'GoodData', '_Raw_Data')
        it = L.path(raw, 'ItemData', '_Raw_Data')
        aff = it and L.get(it, 'AffixList')
        td = it and L.get(it, 'TalentDatas')   # a slate (Pedigree of Gods, divinity slates): its talents and shape
        tl = td and L.get(td, 'BaseTalentList')
        res.append({'n': i, 'price': val(L.get(raw, 'PriceNum')), 'priceType': val(L.get(raw, 'PriceType')), 'baseId': val(L.get(it, 'ConfigBaseId')),
                    'level': val(L.get(it, 'Level')), 'prefix': side(aff, 'PrefixInfoList'), 'suffix': side(aff, 'SuffixInfoList'), 'fixed': side(aff, 'BAffixInfoList'), 'base': side(aff, 'BaseAttrInfoList'),
                    **({'talents': [val(x) for _, x in sorted(L.items(tl), key=lambda kv: kv[0])], 'shapeId': val(L.get(td, 'ShapeId'))} if tl else {})})
    return res

if __name__ == '__main__':
    if '--serve' in sys.argv:   # market.ts --watch: one read per line on stdin, one JSON line out; attached once (again after a failed read: the game restarted)
        L = None
        for _ in sys.stdin:
            try:
                L = L or Lua(Proc()); out = listings(L)
            except Exception as e:
                L, out = None, {'error': str(e)}
            print(json.dumps(out), flush=True)
    else:
        print(json.dumps(listings(Lua(Proc())), ensure_ascii=False))
