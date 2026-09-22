"""Render the actual three RPG models/atlas/clips using the calibrated rig renderer.

Standing snapshots and animation frames, not a simulation of the game state machine.
No texture generation or image editing: images are rasterized from the actual meshes.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw
from rig_preview.assets import Assets
from rig_preview.geometry import channels, matrices, mesh
from rig_preview.raster import render
from rig_preview.timeline import sample

ROOT = Path(__file__).resolve().parents[1]
RP = ROOT / 'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3'
OUT = ROOT / 'out/saw-bomb-rpg'


def faces_at(assets, name, time=0, throwing=False):
    desc = assets.read(f'entity/{name}.entity.json')['minecraft:client_entity']['description']
    model, texture = assets.model(desc)
    names = ['rpg_hold']
    if name == 'sawman': names.append('rpg_spin')
    if throwing: names.append('rpg_throw')
    clips = [sample(assets.find('animations','animations',desc['animations'][n]),time) for n in names]
    faces = mesh(model,matrices(model['bones'],channels(clips,model['bones'])),texture,name)
    return faces


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    assets = Assets(RP)
    overview = Image.new('RGB',(1440,1440),(25,29,36))
    for row, name in enumerate(['sawman','bomblet','bomber']):
        sheet = Image.new('RGB',(1760,478),(25,29,36))
        faces = faces_at(assets,name)
        for col,yaw in enumerate([0,35,90,180]):
            img,_ = render(faces,yaw=yaw,pitch=8,size=440,center=(0,16,-3),span=39,unlit=False)
            sheet.paste(img,(col*440,38))
            ImageDraw.Draw(sheet).text((col*440+12,12),f'{name} / actual assets / yaw {yaw}',fill='white')
        sheet.save(OUT/f'{name}-views.png')
        for col,yaw in enumerate([0,35,180]):
            img,_ = render(faces,yaw=yaw,pitch=8,size=480,center=(0,16,-3),span=39,unlit=False)
            overview.paste(img,(col*480,row*480))
            ImageDraw.Draw(overview).text((col*480+12,row*480+12),f'{name} / {yaw} deg',fill='white')
    overview.save(OUT/'overview.png')
    for name in ['sawman','bomber']:
        frames=[]
        for i in range(20):
            time=i*.025
            faces=faces_at(assets,name,time,throwing=name=='bomber')
            img,_=render(faces,yaw=35,pitch=8,size=400,center=(0,16,-3),span=39,unlit=False)
            frames.append(img)
        frames[0].save(OUT/f'{name}-motion.gif',save_all=True,append_images=frames[1:],duration=25,loop=0)
        strip=Image.new('RGB',(1600,428),(25,29,36))
        for col,i in enumerate([0,4,10,18]):
            strip.paste(frames[i],(col*400,28))
            ImageDraw.Draw(strip).text((col*400+10,8),f'{name} / t={i*.025:.3f}',fill='white')
        strip.save(OUT/f'{name}-motion.png')
    (OUT/'inputs.json').write_text(json.dumps({'inputs_sha256':assets.inputs,
        'not_simulated':['Molang/controller transitions','walking/swimming','game lighting/materials']},indent=2))
    print(OUT)


if __name__ == '__main__':
    main()
