"""Render the actual two RPG assets and numeric keyframes; spec/37."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw
from rig_preview.assets import Assets
from rig_preview.geometry import channels, matrices, mesh
from rig_preview.timeline import sample
from rig_preview.raster import render

ROOT=Path(__file__).resolve().parents[1]
RP=ROOT/'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3'
OUT=ROOT/'out/crit-flyer'


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    inputs={}
    for name in ['flyer','crit']:
        a=Assets(RP);d=a.read(f'entity/{name}.entity.json')['minecraft:client_entity']['description']
        model,skin=a.model(d)
        clips={key:a.find('animations','animations',d['animations']['rpg_'+key]) for key in ['idle','attack']}
        def frame(t,yaw,attack=False):
            poses=[sample(clips['idle'],t%1)]
            if attack:poses.append(sample(clips['attack'],t))
            faces=mesh(model,matrices(model['bones'],channels(poses,model['bones'])),skin,name)
            img,_=render(faces,yaw,8,640,[0,20,0],60)
            ImageDraw.Draw(img).text((12,12),f'{name} / {"attack" if attack else "idle"} / {t:.2f}s / yaw {yaw}',fill='white')
            return img
        sheet=Image.new('RGB',(1920,1280))
        for i,yaw in enumerate([0,40,90,180,-40,-90]):
            img=frame(.15,yaw);img.save(OUT/f'{name}-view-{i}.png');sheet.paste(img,((i%3)*640,(i//3)*640))
        sheet.save(OUT/f'{name}-views.png')
        for phase,limit in [('idle',1),('attack',.5)]:
            images=[]
            for i in range(round(limit*20)+1):
                img=frame(i/20,35,phase=='attack');img.save(OUT/f'{name}-{phase}-{i:02}.png');images.append(img)
            images[0].save(OUT/f'{name}-{phase}.gif',save_all=True,append_images=images[1:],duration=50,loop=0)
        inputs[name]=a.inputs
        print(name,'rendered',flush=True)
    (OUT/'inputs.json').write_text(json.dumps({'sha256':inputs,'limits':['orthographic camera; approximate lighting','numeric animation keys only; no game AI/head tracking or engine animation blending']},indent=2))
    (OUT/'index.html').write_text('''<!doctype html><meta charset="utf-8"><title>敵モデル確認</title>
<style>body{background:#171d28;color:white;font:16px system-ui;margin:24px}img{width:min(90vw,640px);image-rendering:pixelated}button,select,input{font:inherit;margin:8px}</style>
<h1>痛恨の一撃・飛行</h1><select id="mob"><option value="flyer">飛行</option><option value="crit">痛恨の一撃</option></select>
<select id="phase"><option value="idle">待機・羽ばたき</option><option value="attack">攻撃</option></select>
<button id="play">再生</button><input id="time" type="range" min="0" max="20" value="0"><span id="label"></span><br><img id="frame">
<p>実際のモデル・テクスチャ・アニメーションを使用。実機の頭の追尾や地形・照明は模擬していません。</p>
<script>const mob=document.querySelector('#mob'),phase=document.querySelector('#phase'),slider=document.querySelector('#time'),img=document.querySelector('#frame');let playing=false;
function draw(){slider.max=phase.value==='idle'?20:10;img.src=mob.value+'-'+phase.value+'-'+String(slider.value).padStart(2,'0')+'.png';document.querySelector('#label').textContent=(slider.value/20).toFixed(2)+'秒'}
mob.onchange=phase.onchange=slider.oninput=draw;document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'停止':'再生'};
setInterval(()=>{if(playing){slider.value=(Number(slider.value)+1)%(Number(slider.max)+1);draw()}},50);draw();</script>''',encoding='utf-8')


if __name__=='__main__':main()
