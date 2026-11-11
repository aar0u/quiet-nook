import sys, numpy as np
sys.path.insert(0,".")
import keygs
for f in sys.argv[1:]:
    print(f, keygs.contamination(keygs.key(f)))
