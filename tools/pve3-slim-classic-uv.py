"""Slim arms using an unchanged classic-layout skin. See spec/29-humanoid-designs.md."""
import copy
import json
from pathlib import Path

from rig_preview.geometry import uv_faces

RP=Path(__file__).resolve().parents[1]/'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3'


def build():
    classic=json.loads((RP/'models/entity/pve3_humanoid.geo.json').read_text())['minecraft:geometry'][0]
    slim=json.loads((RP/'models/entity/pve3_humanoid_slim.geo.json').read_text())
    model=slim['minecraft:geometry'][0]
    model['description']['identifier']='geometry.pve3.humanoid.slim_classic_uv'
    originals={b['name']:b for b in classic['bones']}
    for bone in model['bones']:
        if bone['name'] not in ('leftArm','rightArm','leftSleeve','rightSleeve'):continue
        original=originals[bone['name']]
        for cube,source in zip(bone['cubes'],original['cubes'],strict=True):
            faces=copy.deepcopy(uv_faces(source,original))
            # Per-face geometry encodes the top/bottom orientation opposite to
            # the normalized box-UV representation returned by uv_faces.
            for face in ('up','down'):
                f=faces[face]
                f['uv']=[u+s for u,s in zip(f['uv'],f['uv_size'])]
                f['uv_size']=[-s for s in f['uv_size']]
            cube['uv']=faces
    target=RP/'models/entity/pve3_humanoid_slim_classic_uv.geo.json'
    target.write_text(json.dumps(slim,indent=2)+'\n')
    print('Created slim classic-UV geometry; arm and sleeve faces retain original source rectangles.')


if __name__=='__main__':build()
