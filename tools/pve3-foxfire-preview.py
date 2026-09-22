"""Preview the real kitsune mesh, casting clips and particle JSONs in an offline browser.

Run: python tools/pve3-foxfire-preview.py
Open out/foxfire/index.html. Re-run after changing assets. The strict Molang subset
fails on unknown expressions; it never silently substitutes missing variables.
The fixed emission schedule mirrors services/foxfire.ts (recorded in inputs.json).
This is an orthographic inspection renderer, not the Minecraft game engine.
"""
import ast
import functools
import hashlib
import json
import math
import operator
import random
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from rig_preview.assets import Assets
from rig_preview.geometry import channels, matrices, mesh
from rig_preview.raster import render, camera
from rig_preview.timeline import sample

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT/'worlds/pve-v3/packs/pve_v3'
RP = PACK/'resource_packs/pve_v3'
OUT = ROOT/'out/foxfire'
FUNCTIONS = {'sin': lambda x: math.sin(math.radians(x)),
             'cos': lambda x: math.cos(math.radians(x)),
             'sqrt': math.sqrt, 'pow': pow, 'min': min, 'max': max}
OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
       ast.Div: operator.truediv}


@functools.lru_cache(maxsize=256)
def expression(source):
    return ast.parse(source, mode='eval').body


def evaluate(value, variables):
    """Only the arithmetic and degree-based functions used by these particle files."""
    if isinstance(value, (float, int)):
        return value
    def walk(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in OPS:
            return OPS[type(node.op)](walk(node.left), walk(node.right))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            return walk(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id in ('v', 'variable'):
            return variables[node.attr]
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == 'math' and not node.keywords:
            return FUNCTIONS[node.func.attr](*(walk(arg) for arg in node.args))
        raise ValueError(f'Unsupported Molang: {value}')
    return walk(expression(value))


def vector(values, variables):
    return np.array([evaluate(v, variables) for v in values], dtype=float)


class Preview:
    def __init__(self, forward=(0,0,1)):
        self.assets = Assets(RP)
        a = self.assets
        desc = a.read('entity/kitsune.entity.json')['minecraft:client_entity']['description']
        self.model, self.skin = a.model(desc)
        self.clips = {name: a.find('animations', 'animations', desc['animations']['fox_'+name])
                      for name in ('charge', 'release')}
        # Fetch attack dimensions from the actual enemy definition, not a second set.
        roster = (PACK/'scripts/core/roster/star5.ts').read_text(encoding='utf-8')
        block = roster.split('kitsune: {', 1)[1].split('\n  },', 1)[0]
        self.radius = float(re.search(r'radius:\s*([\d.]+)', block)[1])
        self.angle = float(re.search(r'angle:\s*([\d.]+)', block)[1])
        self.charge = float(re.search(r'windup:\s*([\d.]+)', block)[1])/20
        self.recover = float(re.search(r'recover:\s*([\d.]+)', block)[1])/20
        forward=np.array(forward,dtype=float); forward/=np.linalg.norm(forward)
        flat=np.hypot(forward[0],forward[2])
        right=np.array([forward[2],0,-forward[0]])/flat if flat>1e-9 else np.array([1,0,0])
        self.basis={'forward':forward,'right':right,'up':np.cross(forward,right)}
        self.effects = {}
        for path in sorted((RP/'particles').glob('foxfire_*.json')):
            effect = a.read(path.relative_to(RP))['particle_effect']
            params = effect['description']['basic_render_parameters']
            texture = RP/(params['texture']+'.png'); a.track(texture)
            components = effect['components']
            uv = components['minecraft:particle_appearance_billboard']['uv']
            x, y = uv['uv']; w, h = uv['uv_size']
            with Image.open(texture) as img:
                if img.size != (uv['texture_width'], uv['texture_height']):
                    raise ValueError('Texture dimensions differ from UV declaration')
                tile = img.convert('RGBA').crop((x,y,x+w,y+h))
            self.effects[path.stem.removeprefix('foxfire_')] = (components, tile, params['material'])
        self.bursts = []
        # Runtime charges every 6 ticks. Model forward is -Z; runtime forward is +Z.
        for i in range(math.ceil(self.charge/.3)):
            t = i*.3
            for side, color in [(-1,'blue'), (1,'purple')]:
                self.emit('charge_'+color, t, (side*.25,1.35,.65))
            for name in ('orbit','charge_glow'):
                self.emit(name,t,(0,1.3,.6))
            for name in ('aura_blue','aura_purple'):
                self.emit(name,t,(0,0,0))
        for name in ('wave_blue','wave_purple','front','embers','flash'):
            self.emit(name,self.charge,(0,1.3,.6) if name=='flash' else (0,1.3,0))

    def emit(self, name, time, origin):
        c, _, _ = self.effects[name]
        rng = random.Random(f'{name}/{time}')
        for _ in range(c['minecraft:emitter_rate_instant']['num_particles']):
            v = {f'particle_random_{i}':rng.random() for i in range(1,5)}
            v.update(fox_range=self.radius, fox_angle=self.angle, particle_age=0)
            v.update({f'fox_{name}_{axis}':float(value) for name,direction in self.basis.items() for axis,value in zip('xyz',direction)})
            v['particle_lifetime'] = evaluate(c['minecraft:particle_lifetime_expression']['max_lifetime'],v)
            shape = c['minecraft:emitter_shape_point']
            start = vector(shape['offset'],v)
            direction = vector(shape.get('direction',[0,1,0]),v)
            velocity = direction/max(np.linalg.norm(direction),1e-9)*evaluate(c.get('minecraft:particle_initial_speed',0),v)
            self.bursts.append((name,time,np.array(origin),start,velocity,v))

    def particles(self, time):
        result = []
        for name,born,origin,start,velocity,initial in self.bursts:
            age = time-born
            if not 0 <= age < initial['particle_lifetime']:
                continue
            v = dict(initial,particle_age=age)
            c,texture,material = self.effects[name]
            if 'minecraft:particle_motion_parametric' in c:
                offset = vector(c['minecraft:particle_motion_parametric']['relative_position'],v)
            else:
                motion = c.get('minecraft:particle_motion_dynamic',{})
                acc = vector(motion.get('linear_acceleration',[0,0,0]),v)
                drag = evaluate(motion.get('linear_drag_coefficient',0),v)
                # Exact constant-acceleration/linear-drag solution. Engine tick rounding differs.
                offset = start + ((velocity-acc/drag)*(1-math.exp(-drag*age))/drag+acc/drag*age if drag else velocity*age+acc*age*age/2)
            size = vector(c['minecraft:particle_appearance_billboard']['size'],v)
            tint = vector(c['minecraft:particle_appearance_tinting']['color'],v)
            result.append(((origin+offset)*[-16,16,-16],size*16,texture,material,tint))
        return result

    def faces(self,time):
        poses = []
        if time < self.charge:
            poses.append(sample(self.clips['charge'],min(.999,time/self.charge)))
        elif time < self.charge+self.recover:
            poses.append(sample(self.clips['release'],time-self.charge))
        return mesh(self.model,matrices(self.model['bones'],channels(poses,self.model['bones'])),self.skin,'kitsune')

    def frame(self,time,view):
        yaw,pitch,center,span = {
            'near':(35,8,(0,19,-2),57),
            'wide':(155,48,(0,12,-110),440),
            'top':(180,85,(0,0,-110),440),
            'side':(90,0,(0,20,-110),440),
            'spread':(155,48,(0,12,-110),440),
        }[view]
        if view != 'near':
            extent=self.radius
            if view=='spread':
                extent=max([extent,*[np.linalg.norm((p[0]-[0,20.8,0])/16) for p in self.particles(time)]])
            center=self.basis['forward']*[-16,16,-16]*(extent*.47)+np.array([0,20,0])
            span=extent*29.3333333333
        size=560; cam=camera(yaw,pitch); center=np.array(center)
        faces=self.faces(time)
        img,ids=render(faces,yaw=yaw,pitch=pitch,size=size,center=center,span=span)
        depth=np.full((size,size),np.inf)
        # Reconstruct each visible face's plane to occlude billboards against the model.
        for i in np.unique(ids):
            if i<0: continue
            vertices=(faces[i][0]-center)@cam.T
            n=np.cross(vertices[1]-vertices[0],vertices[3]-vertices[0])
            if abs(n[2])<1e-9: continue
            yy,xx=np.where(ids==i)
            px=(xx+.5-size/2)*span/size; py=-(yy+.5-size/2)*span/size
            depth[yy,xx]=(np.dot(n,vertices[0])-n[0]*px-n[1]*py)/n[2]
        canvas=np.array(img,dtype=float)/255
        particles=[]
        for pos,half,texture,material,tint in self.particles(time):
            p=(pos-center)@cam.T
            particles.append((p,half,texture,material,tint))
        for p,half,texture,material,tint in sorted(particles,key=lambda p:-p[0][2]):
            w,h=np.maximum(1,np.rint(half*2*size/span)).astype(int)
            xy=p[:2]*[1,-1]*size/span+size/2
            x,y=np.rint(xy-[w/2,h/2]).astype(int)
            x0,y0=max(x,0),max(y,0); x1,y1=min(x+w,size),min(y+h,size)
            if x0>=x1 or y0>=y1: continue
            tex=np.array(texture.resize((w,h),Image.Resampling.NEAREST),dtype=float)/255
            tex=tex[y0-y:y1-y,x0-x:x1-x]*np.clip(tint,0,1)
            alpha=tex[:,:,3:4]*(p[2]<depth[y0:y1,x0:x1,None])
            region=canvas[y0:y1,x0:x1]
            if material=='particles_add': region[:]=np.minimum(1,region+tex[:,:,:3]*alpha)
            elif material=='particles_alpha': region[:]=region*(1-alpha)+tex[:,:,:3]*alpha
            else: raise ValueError('Unsupported material '+material)
        img=Image.fromarray(np.uint8(np.clip(canvas*255,0,255)))
        d=ImageDraw.Draw(img)
        phase='CHARGE' if time<self.charge else 'RELEASE' if time<self.charge+self.recover else 'RECOVERY COMPLETE'
        d.text((12,12),f'{view.upper()} / {time:.2f} s / {phase}',fill='white')
        d.text((12,size-24),f'Actual assets / {self.radius:g} m / {self.angle:g} deg / {len(particles)} particles',fill='white')
        return img


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    preview=Preview()
    times=np.arange(0,preview.charge+2.21,.05)
    snapshots=[]
    for view in ('near','wide','top','side','spread'):
        frames=[]
        for i,time in enumerate(times):
            frame=preview.frame(float(time),view)
            frame.save(OUT/f'{view}-{i:03}.png'); frames.append(frame)
        frames[0].save(OUT/f'{view}.gif',save_all=True,append_images=frames[1:],duration=50,loop=0)
        snapshots.append([frames[i] for i in (58,61,65,96)])
        print(view,'rendered',flush=True)
    sheet=Image.new('RGB',(2240,2800))
    for row,frames in enumerate(snapshots):
        for col,img in enumerate(frames): sheet.paste(img,(col*560,row*560))
    sheet.save(OUT/'overview.png')
    report={'inputs_sha256':preview.assets.inputs,'runtime_sha256':{},
        'range':preview.radius,'angle':preview.angle,'charge_seconds':preview.charge,
        'limits':['orthographic camera, approximate additive material and lighting',
                  'fixed caster/target and mirrored emission schedule; no runtime AI simulation',
                  'tails held at model rest pose; game head tracking and walk not simulated',
                  'constant motion integrated analytically; no engine particle budgets/culling']}
    for rel in ['scripts/services/foxfire.ts','scripts/services/charged-sweep.ts','scripts/core/roster/star5.ts']:
        report['runtime_sha256'][rel]=hashlib.sha256((PACK/rel).read_bytes()).hexdigest()
    (OUT/'inputs.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    html='''<!doctype html><html lang="ja"><meta charset="utf-8"><title>妖狐・狐火プレビュー</title>
<style>body{background:#171b24;color:#eff1ff;font:16px system-ui;max-width:1000px;margin:24px auto}button,select,input{font:inherit;margin:8px}img{width:min(90vw,700px);image-rendering:pixelated}input{width:55%}small{display:block;color:#bac3d4;line-height:1.7}</style>
<h1>妖狐・狐火プレビュー</h1><p>実際のモデル・アニメーション・パーティクル定義を読み込んだ確認画面</p>
<select id="view"><option value="near">手元と構え</option><option value="wide">当たり判定の範囲</option><option value="top">上から範囲を見る</option><option value="side">真横から厚みを見る</option><option value="spread">広がり全体（自動ズーム）</option></select>
<button id="play">再生</button><select id="speed"><option value="1">通常</option><option value=".25">1/4 速度</option><option value="2">2 倍速で確認</option></select><br>
<input id="time" type="range" min="0" max="MAX" value="0"><output id="label"></output><br><img id="frame" alt="狐火プレビュー">
<small>溜め 3 秒 → 一撃 → 余韻。再生速度の変更は確認用で、呪いの実装シミュレーションではありません。<br>
入力を変更したら <code>python tools/pve3-foxfire-preview.py</code> を再実行してください。<br>
Minecraft と照明・加算描画・粒子数制限は異なります。<a href="inputs.json">入力のハッシュと再現範囲</a></small>
<script>const view=document.querySelector('#view'),slider=document.querySelector('#time'),frame=document.querySelector('#frame'),label=document.querySelector('#label'),button=document.querySelector('#play');let playing=false,acc=0,last=performance.now();
function draw(){frame.src=view.value+'-'+String(slider.value).padStart(3,'0')+'.png';label.textContent=(slider.value/20).toFixed(2)+' 秒'}view.onchange=slider.oninput=draw;button.onclick=()=>{playing=!playing;button.textContent=playing?'停止':'再生'};
function tick(now){if(playing){acc+=(now-last)*Number(document.querySelector('#speed').value);while(acc>=50){slider.value=(Number(slider.value)+1)%(Number(slider.max)+1);acc-=50;draw()}}last=now;requestAnimationFrame(tick)}draw();requestAnimationFrame(tick);</script></html>'''.replace('MAX',str(len(times)-1))
    (OUT/'index.html').write_text(html,encoding='utf-8')
    print(OUT/'index.html')


if __name__=='__main__':
    main()
