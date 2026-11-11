import sys, numpy as np, shutil
sys.path.insert(0,".")
import keygs
base=keygs.key("gs_neutral.png")[...,3]
picks={}
for n in ["happy","shy","sleepy","think","cheer","blink"]:
    best=None
    for i in (1,2):
        f=f"cand/{n}_{i}.png"; r=keygs.key(f)
        drift=float((np.abs(r[...,3]-base)>0.5)[:430].mean())   # alpha differences in the head area (rows < 430)
        hair=float((np.abs(r[...,3]-base)>0.5)[430:, :345].sum())  # hair silhouette drift on her left
        s=keygs.contamination(r)
        print(n,i,"contam",s,"head-alpha-diff %.4f"%drift,"hair-drift px",int(hair))
        score=s+hair*0.5
        if best is None or score<best[0]: best=(score,f)
    picks[n]=best[1]; shutil.copy(best[1],f"gs_{n}.png")
print(picks)
