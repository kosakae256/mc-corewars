"""Build an offline preview from the actual barrage roster, particle JSON and sprite.

python tools/pve3-barrage-preview.py -> out/barrage/index.html
Canvas simulates a stationary caster in empty space, not Minecraft collision/networking.
"""
import base64
import hashlib
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PACK=ROOT/'worlds/pve-v3/packs/pve_v3'
RP=PACK/'resource_packs/pve_v3'
OUT=ROOT/'out/barrage'


def main():
    roster=PACK/'scripts/core/roster/star5.ts'
    block=roster.read_text(encoding='utf-8').split('barrage: {',1)[1].split('\n  },',1)[0]
    def number(key): return float(re.search(r'\b'+key+r':\s*([\d.]+)',block)[1])
    orbit=block.split('orbit:',1)[1]
    particle=RP/'particles/barrage_bullet.json'
    effect=json.loads(particle.read_text(encoding='utf-8'))['particle_effect']
    texture=RP/(effect['description']['basic_render_parameters']['texture']+'.png')
    comp=effect['components']
    clock=PACK/'scripts/core/bullet-sprite.ts'
    ticks=int(re.search(r'BULLET_SPRITE_TICKS = (\d+)',clock.read_text(encoding='utf-8'))[1])
    assert 'body:' not in orbit and 'pve_v3:barrage_bullet' in orbit
    assert comp['minecraft:emitter_rate_instant']['num_particles']==1
    assert comp['minecraft:particle_lifetime_expression']['max_lifetime']=='v.bullet_life'
    assert comp['minecraft:particle_motion_dynamic']['linear_drag_coefficient']==0
    assert comp['minecraft:particle_initial_speed']==['v.bullet_vx','v.bullet_vy','v.bullet_vz']
    config={'count':int(number('count')),'speed':float(re.search(r'speed:\s*([\d.]+)',orbit)[1])*20,
            'range':number('range'),'interval':number('interval')/20,'refresh':ticks/20,
            'diameter':comp['minecraft:particle_appearance_billboard']['size'][0]*2}
    inputs={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()
            for p in [roster,particle,texture,clock,PACK/'scripts/services/bullet.ts',PACK/'scripts/services/throw.ts']}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'inputs.json').write_text(json.dumps({'config':config,'sha256':inputs,'limits':['stationary caster; no blocks or players','no engine lighting, culling, particle budgets or network latency']},indent=2),encoding='utf-8')
    html='''<!doctype html><html lang="ja"><meta charset="utf-8"><title>弾幕・丸弾プレビュー</title>
<style>body{background:#171d2b;color:#edf9ff;font:16px system-ui;max-width:1080px;margin:24px auto;padding:0 16px}canvas{width:100%;border:1px solid #4d697e;border-radius:8px}button,select,input{font:inherit;margin:6px}input[type=range]{width:260px}small{display:block;color:#b3c5d4;line-height:1.7}a{color:#67dbff}</style>
<h1>弾幕・丸弾プレビュー</h1><p>白い芯と青緑の輪郭。弾エンティティを使わず、短寿命の粒をつないで飛ばします。</p>
<button id="play">再生</button><select id="view"><option value="top">上空</option><option value="oblique">斜め</option></select><select id="bg"><option value="dark">暗い背景</option><option value="light">明るい背景</option></select>
<label>時刻<input id="time" type="range" min="0" max="8" step="0.01" value="3"></label><output id="label"></output>
<canvas id="scene" width="1000" height="700"></canvas>
<small id="stats"></small><small>実際のパーティクルJSON・PNG・敵定義を使用。固定された発射位置・障害物のない空間の確認用です。<br>ゲーム内の通信遅延・描画制限は模擬していません。<a href="inputs.json">入力と描画条件</a><br>更新後は python tools/pve3-barrage-preview.py を実行してください。</small>
<script>
const cfg=CONFIG, sprite=new Image();sprite.src='data:image/png;base64,SPRITE';
const canvas=document.querySelector('#scene'),ctx=canvas.getContext('2d'),slider=document.querySelector('#time'),view=document.querySelector('#view'),bg=document.querySelector('#bg'),play=document.querySelector('#play');let running=false,last=performance.now();
function draw(){if(!sprite.complete)return;const time=Number(slider.value),light=bg.value==='light',oblique=view.value==='oblique';ctx.fillStyle=light?'#c9d7cc':'#202b3b';ctx.fillRect(0,0,1000,700);ctx.imageSmoothingEnabled=false;const scale=10,sy=oblique?.55:1;const pos=(x,z)=>[500+x*scale,350+z*scale*sy];ctx.strokeStyle=light?'#afc2b7':'#304559';ctx.lineWidth=1;
 for(let a=-30;a<=30;a+=5){for(const segment of [[a,-30,a,30],[-30,a,30,a]]){let p=pos(segment[0],segment[1]),q=pos(segment[2],segment[3]);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke()}}
 let visible=0;for(let born=0;born<=time;born+=cfg.interval){const age=time-born;if(age*cfg.speed>=cfg.range)continue;
 // The script refreshes the visual every 4 ticks; each particle moves between refreshes.
 const refresh=Math.floor((age+1e-9)/cfg.refresh)*cfg.refresh,particleAge=age-refresh,radius=(refresh+particleAge)*cfg.speed;
 for(let i=0;i<cfg.count;i++){const a=i/cfg.count*Math.PI*2,p=pos(Math.cos(a)*radius,Math.sin(a)*radius),d=cfg.diameter*scale;ctx.drawImage(sprite,p[0]-d/2,p[1]-d/2,d,d);visible++}}
 ctx.fillStyle=light?'#293d50':'#f0f7ff';ctx.beginPath();ctx.arc(500,350,4,0,Math.PI*2);ctx.fill();ctx.font='14px system-ui';ctx.fillText('発射位置',514,354);
 ctx.fillText('弾の拡大表示',24,30);ctx.drawImage(sprite,24,44,128,128);ctx.fillText('5マス間隔のグリッド',24,675);
 document.querySelector('#label').textContent=time.toFixed(2)+' 秒';document.querySelector('#stats').textContent=`${cfg.count}方向 / ${cfg.speed}マス毎秒 / 射程${cfg.range}マス / 表示${visible}粒 / 弾エンティティ0`;
}
sprite.onload=draw;slider.oninput=view.onchange=bg.onchange=draw;play.onclick=()=>{running=!running;play.textContent=running?'停止':'再生'};
function tick(now){if(running){slider.value=(Number(slider.value)+(now-last)/1000)%8;draw()}last=now;requestAnimationFrame(tick)}requestAnimationFrame(tick);
</script></html>'''.replace('CONFIG',json.dumps(config)).replace('SPRITE',base64.b64encode(texture.read_bytes()).decode())
    (OUT/'index.html').write_text(html,encoding='utf-8')
    print(OUT/'index.html',config)


if __name__=='__main__': main()
