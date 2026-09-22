"""実際のRPの模型・テクスチャ・装飾キーからカタログと動作プレビューを描画。"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rig_preview.geometry import channels, matrices, mesh, uv_faces
from rig_preview.timeline import sample
from rig_preview.raster import render
from rig_preview.assets import scene as shotgun_scene
from build import ROOT, RP, CATALOG

OUT=ROOT/'out/enemy-designs-v1'


def load(ident):
    desc=json.loads((RP/f'entity/{ident}.entity.json').read_text(encoding='utf-8'))['minecraft:client_entity']['description']
    path=RP/f'models/entity/pve3_design_{ident}.geo.json'
    model=json.loads(path.read_text())['minecraft:geometry'][0]
    texture=np.array(Image.open(RP/(desc['textures']['default']+'.png')).convert('RGBA'))
    path=RP/f'animations/pve3_design_{ident}.animation.json'
    clips=list(json.loads(path.read_text())['animations'].values()) if path.exists() else []
    return model,texture,clips


def geometry(ident,t):
    if ident=='shotgun': return shotgun_scene(RP,time=t)[0]
    model,texture,clips=load(ident)
    pose=channels([sample(c,t%c['animation_length']) for c in clips],model['bones'])
    return mesh(model,matrices(model['bones'],pose),texture,ident)


def verify(ident):
    model,texture,clips=load(ident)
    assert texture.shape==(128,128,4),(ident,texture.shape)
    names={b['name'].lower() for b in model['bones']}
    assert len(names)==len(model['bones']),ident+' duplicate bones'
    assert model['description']['identifier']==f'geometry.pve3.design.{ident}'
    for b in model['bones']:
        if b.get('parent'): assert b['parent'].lower() in names
        for cube in b.get('cubes',[]):
            assert all(s>0 for s in cube['size'])
            for face in uv_faces(cube,b).values():
                u,v=face['uv'];du,dv=face['uv_size']
                assert min(u,u+du)>=0 and max(u,u+du)<=128
                assert min(v,v+dv)>=0 and max(v,v+dv)<=128
    for c in clips:
        for bone in c['bones']: assert bone.lower() in names,(ident,bone)
        for t in (0,.13,.37): matrices(model['bones'],channels([sample(c,t)],model['bones']))
    desc=json.loads((RP/f'entity/{ident}.entity.json').read_text())['minecraft:client_entity']['description']
    original=ROOT/f'worlds/pve-v3/user/enemy-designs-v1/original-entities/{ident}.entity.json'
    original=json.loads(original.read_text())['minecraft:client_entity']['description']
    for alias,value in original['animations'].items(): assert desc['animations'][alias]==value
    previous=iter(desc['scripts']['animate'])
    assert all(any(now==old for now in previous) for old in original['scripts']['animate'])
    # Base head/body faces must be opaque; overlays stay transparent.
    for x,y,w,h in [(0,8,32,8),(0,20,56,12),(16,52,32,12)]:
        assert (texture[y:y+h,x:x+w,3]==255).all(),ident+' transparent base'
    return {'id':ident,'bones':len(names),'cubes':sum(len(b.get('cubes',[])) for b in model['bones']),
            'animations':len(clips),'texture_sha256':hashlib.sha256(texture.tobytes()).hexdigest()}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',nargs='*')
    parser.add_argument('--verify-only',action='store_true')
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    font_path=Path('C:/Windows/Fonts/meiryo.ttc')
    font=ImageFont.truetype(str(font_path),18) if font_path.exists() else ImageFont.load_default()
    report=[];cards=[]
    for d in CATALOG:
        ident=d['id']
        if args.only and ident not in args.only: continue
        report.append(verify(ident))
        if args.verify_only: continue
        faces=geometry(ident,0)
        for label,yaw in [('front',0),('quarter',35),('back',180)]:
            picture,_=render(faces,yaw=yaw,pitch=8 if label=='quarter' else 0,
                             size=400,center=(0,18,0),span=43,unlit=True)
            picture.save(OUT/f'{ident}-{label}.png')
        card=Image.new('RGB',(400,442),(27,32,41))
        card.paste(Image.open(OUT/f'{ident}-quarter.png'),(0,42))
        ImageDraw.Draw(card).text((16,8),d['name']+' / '+ident,fill='white',font=font)
        cards.append(card)
        if report[-1]['animations']:
            frames=[]
            for i in range(16):
                frame,_=render(geometry(ident,i*.05),yaw=35,pitch=8,size=320,center=(0,18,0),span=43,unlit=True)
                frames.append(frame)
            frames[0].save(OUT/f'{ident}-motion.gif',save_all=True,append_images=frames[1:],duration=50,loop=0)
        print('Verified and rendered:',ident,flush=True)
    if len({r['texture_sha256'] for r in report})!=len(report): raise ValueError('Duplicate textures')
    if cards:
        sheet=Image.new('RGB',(400*4,442*((len(cards)+3)//4)),(27,32,41))
        for i,card in enumerate(cards):sheet.paste(card,((i%4)*400,(i//4)*442))
        sheet.save(OUT/'catalog.png')
        entries=''.join('<article><h2>'+d['name']+' <small>'+d['id']+'</small></h2>'+
                       ''.join('<img loading="lazy" src="'+d['id']+'-'+v+'.png">' for v in ('front','quarter','back'))+
                       ('<img loading="lazy" src="'+d['id']+'-motion.gif">' if (OUT/(d['id']+'-motion.gif')).exists() else '')+
                       '<p>'+d['design']+'</p></article>' for d in CATALOG if any(r['id']==d['id'] for r in report))
        (OUT/'index.html').write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><title>PVE 敵デザイン</title>'+
          '<style>body{background:#171d26;color:#eee;font:16px sans-serif;margin:32px}article{background:#252d38;border-radius:12px;padding:20px;margin:20px 0}img{width:23%;image-rendering:pixelated}small,p{color:#adbccc}h1{font-size:26px}</style>'+
          '<h1>PVE v3 敵デザイン</h1><p>RPの実データによる正面・斜め・背面・装飾アニメーション。実機の照明と戦闘状態は別途確認。</p>'+entries+'</html>',encoding='utf-8')
    (OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('PASS:',len(report),'unique designs')


if __name__=='__main__':main()
