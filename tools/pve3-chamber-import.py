"""Extract only geometry.chen from the user's large 4D skin pack.

Source assets remain read-only. Spec: spec/31-chamber-4d-import.md.
"""
import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RP=ROOT/'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,default=Path('C:/Users/kosaka256/Documents/4d/使用データ/originalAAAA='))
    args=parser.parse_args()
    source=args.source.resolve()
    skins=json.loads((source/'skins.json').read_text(encoding='utf-8-sig'))
    skin=next(s for s in skins['skins'] if s['localization_name']=='chen' and s['texture']=='chen.png')
    collection=json.loads((source/'geometry.json').read_text(encoding='utf-8-sig'))
    original=collection[skin['geometry']]
    allowed={'texturewidth','textureheight','visible_bounds_width','visible_bounds_height','visible_bounds_offset','bones'}
    if set(original)-allowed:raise ValueError('Unmapped legacy geometry fields: '+str(set(original)-allowed))
    model={'description':{
        'identifier':'geometry.pve3.chamber.user4d',
        'texture_width':original['texturewidth'],'texture_height':original['textureheight'],
        **{k:original[k] for k in ('visible_bounds_width','visible_bounds_height','visible_bounds_offset') if k in original}},
        'bones':copy.deepcopy(original['bones'])}
    target=RP/'models/entity/pve3_chamber_user4d.geo.json'
    target.write_text(json.dumps({'format_version':'1.21.0','minecraft:geometry':[model]},indent=2)+'\n')
    texture=RP/'textures/entity/pve3/chamber_user_4d_v1.png'
    shutil.copyfile(source/'chen.png',texture)
    saved=json.loads(target.read_text())['minecraft:geometry'][0]
    assert saved['bones']==original['bones'], 'Bone/cube data changed during conversion'
    assert digest(source/'chen.png')==digest(texture), 'Texture changed during copy'
    path=RP/'entity/chamber.entity.json'
    entity=json.loads(path.read_text())
    desc=entity['minecraft:client_entity']['description']
    desc['geometry']['default']=model['description']['identifier']
    desc['textures']['default']='textures/entity/pve3/chamber_user_4d_v1'
    path.write_text(json.dumps(entity,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    report={'source':str(source),'skin':skin,'geometry':skin['geometry'],
        'source_sha256':{name:digest(source/name) for name in ('skins.json','geometry.json','chen.png')},
        'output_sha256':{str(p.relative_to(RP)):digest(p) for p in (target,texture)},
        'bones_identical':True,'texture_identical':True,'bones':len(model['bones']),
        'cubes':sum(len(b.get('cubes',[])) for b in model['bones']),
        'source_bytes':(source/'geometry.json').stat().st_size,'extracted_bytes':target.stat().st_size}
    out=ROOT/'worlds/pve-v3/user/chamber-import'
    out.mkdir(parents=True,exist_ok=True)
    (out/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('source_sha256','output_sha256')},ensure_ascii=False))


if __name__=='__main__':main()
