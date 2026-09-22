"""生成済みテクスチャと模型を専用参照で適用する。元のentityは初回に退避する。"""
import argparse
import json
import shutil
from pathlib import Path

from models import create

ROOT=Path(__file__).resolve().parents[2]
RP=ROOT/'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3'
ART=ROOT/'worlds/pve-v3/user/enemy-designs-v1'
CATALOG=json.loads((Path(__file__).parent/'catalog.json').read_text(encoding='utf-8'))


def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--only',nargs='*')
    args=p.parse_args()
    base=json.loads((RP/'models/entity/pve3_humanoid.geo.json').read_text())['minecraft:geometry'][0]
    made=[]
    for d in CATALOG:
        ident=d['id']
        if args.only and ident not in args.only: continue
        texture=f'textures/entity/pve3/{ident}_design_v1'
        if not (RP/(texture+'.png')).exists():
            print('Missing texture:',ident)
            continue
        path=RP/f'entity/{ident}.entity.json'
        backup=ART/'original-entities'/path.name
        if not backup.exists():
            backup.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(path,backup)
        doc=json.loads(path.read_text(encoding='utf-8'))
        desc=doc['minecraft:client_entity']['description']
        model,clips=create(base,ident,d['model'])
        write(RP/f'models/entity/pve3_design_{ident}.geo.json',
              {'format_version':'1.21.0','minecraft:geometry':[model]})
        if clips:
            write(RP/f'animations/pve3_design_{ident}.animation.json',{'format_version':'1.8.0','animations':clips})
        desc['geometry']['default']=model['description']['identifier']
        desc['textures']['default']=texture
        for name in clips:
            alias='design_'+name.rsplit('.',1)[1]
            desc['animations'][alias]=name
            if alias not in desc['scripts']['animate']: desc['scripts']['animate'].append(alias)
        write(path,doc)
        made.append(ident)
    print('Applied',len(made),':',', '.join(made))


if __name__=='__main__': main()
