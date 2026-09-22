"""Build the selected kitsune A geometry; spec/29-humanoid-designs.md.

Run pve3-kitsune-texture.ps1 first. No raster painting in this script.
"""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RP = ROOT / 'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3'
BODY_WIDTH = 6.5
BODY_DEPTH = 3.4
ARM_WIDTH = 3
SLEEVE_WIDTH = 3.25
SLEEVE_DEPTH = 4.25


def write(path, value):
    (RP/path).write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')


def patch(tile, rect=(0, 0, 32, 32)):
    x, y, w, h = rect
    return {'uv': [tile % 4*32+x, tile//4*32+y], 'uv_size': [w, h]}


def uv(tile, front=None, back=None, rect=(0, 0, 32, 32)):
    result = {face: patch(tile, rect) for face in ('north', 'south', 'east', 'west', 'up', 'down')}
    if front is not None: result['north'] = patch(front)
    if back is not None: result['south'] = patch(back)
    return result


def slim_proportions(bones):
    """Fit the torso, legs and costume together, then place slim arms at the shoulders.

    Cube and bone coordinates are model-space values, so update child pivots as
    well as their cubes. Keep head/tails full size and retain the animation rig.
    """
    factors = (BODY_WIDTH/8, 1, BODY_DEPTH/4)

    def resized(vector):
        return [round(v*f,6) for v,f in zip(vector,factors)]

    for name,b in bones.items():
        if name in ('body','fox_sash','leftLeg','rightLeg','leftPants','rightPants') or name.endswith(('_robe','_foot')):
            b['pivot']=resized(b['pivot'])
            for c in b.get('cubes',[]):
                c['origin']=resized(c['origin'])
                c['size']=resized(c['size'])
    for side,sign in [('right',-1),('left',1)]:
        shoulder=sign*(BODY_WIDTH/2+1)
        center=sign*(BODY_WIDTH/2+ARM_WIDTH/2)
        for name in (side+'Arm',side+'Sleeve','fox_'+side+'_sleeve'):
            bones[name]['pivot'][0]=shoulder
        arm=bones[side+'Arm']['cubes'][0]
        arm['origin'][0]=center-ARM_WIDTH/2
        arm['size'][0]=ARM_WIDTH
        sleeve=bones['fox_'+side+'_sleeve']['cubes'][0]
        sleeve['origin'][0]=center-SLEEVE_WIDTH/2
        sleeve['origin'][2]=-SLEEVE_DEPTH/2
        sleeve['size'][0]=SLEEVE_WIDTH
        sleeve['size'][2]=SLEEVE_DEPTH
        item=bones[side+'Item']
        item['pivot'][0]=center
        for position in item.get('locators',{}).values():
            position[0]=center


def build():
    model = copy.deepcopy(json.loads((RP/'models/entity/pve3_humanoid.geo.json').read_text())['minecraft:geometry'][0])
    model['description'].update(identifier='geometry.pve3.kitsune.selected_a', texture_width=128,
        texture_height=128, visible_bounds_width=3.5, visible_bounds_height=3,
        visible_bounds_offset=[0, 1.1, 0])
    bones = {b['name']: b for b in model['bones']}
    # Keep all vanilla animation bindings. Only replace their visible surfaces.
    for name, b in bones.items():
        if name in ('hat', 'jacket', 'leftSleeve', 'rightSleeve', 'leftPants', 'rightPants'):
            b['cubes'] = []
        for cube in b.get('cubes', []):
            if name == 'head': cube['uv'] = uv(1, front=0)
            elif name == 'body': cube['uv'] = uv(4, front=2, back=3)
            elif name.endswith('Arm'): cube['uv'] = uv(6, front=4, back=5)
            elif name.endswith('Leg'): cube['uv'] = uv(15, front=10, back=10)

    def bone(name, parent, pivot, rotation=None):
        b = {'name': name, 'parent': parent, 'pivot': list(pivot), 'cubes': []}
        if rotation is not None: b['rotation'] = rotation
        bones[name] = b
        model['bones'].append(b)
        return name

    def cube(name, origin, size, tile=11, front=None, back=None, rect=(0,0,32,32)):
        c = {'origin': origin, 'size': size, 'uv': uv(tile,front,back,rect)}
        # Small solid-material pieces use a small patch, keeping texel density
        # consistent with the costume instead of squeezing a whole tile onto a bell.
        if tile in (1,11,13,14,15) and rect==(0,0,32,32):
            w,h,d=size
            for face,a,b in [('north',w,h),('south',w,h),('east',d,h),('west',d,h),('up',w,d),('down',w,d)]:
                pw,ph=min(28,max(1,round(a*2))),min(28,max(1,round(b*2)))
                c['uv'][face]=patch(tile,((32-pw)//2,(32-ph)//2,pw,ph))
        bones[name]['cubes'].append(c)
        return c

    hair = bone('fox_hair', 'head', [0,24,0])
    cube(hair, [-4.25,31.3,-4.25], [8.5,1.1,8.5], 1)
    for sign in (-1,1):
        x = -4.6 if sign < 0 else 3.4
        cube(hair, [x,24,-4.5], [1.2,7.5,1.1], 1)
        cube(hair, [x+.2,21.8,-3.8], [.85,3.3,1], 1)
        cube(hair, [-4.45 if sign<0 else 3.65,24,-2.9], [.8,7.3,6.8], 1)
    cube(hair, [-.65,28.4,-4.55], [1.3,3.5,.75], 1)
    # Rear hair locks descend to the shoulder blades; separated by small steps.
    for x, bottom in [(-3.8,20.8),(-2.1,19.2),(-.45,20),(1.2,19.5),(2.8,21.2)]:
        cube(hair, [x,bottom,3.8], [1.75,31.8-bottom,.85], 1)
    cube(hair, [-1.5,27.7,4.7], [3,.65,.35], 13)
    cube(hair, [-.45,27.3,4.9], [.9,1.25,.5], 14)
    for x in (-.95,.65): cube(hair, [x,23,4.75], [.4,4.8,.3], 13)

    # Keep both ears in the already-visible hair bone. The separate negative-
    # suffix ear was missing in-game; bake each static ear transform into cubes.
    for sign in (-1,1):
        ear = hair
        first_ear_cube = len(bones[ear]['cubes'])
        x=sign*3-1.4
        cube(ear,[x,32,-1],[2.8,1.4,1.5])
        cube(ear,[x+.35,33.4,-.9],[2.1,1.3,1.3])
        cube(ear,[x+.7,34.7,-.8],[1.4,1.2,1.1])
        cube(ear,[x+1,35.9,-.7],[.8,.8,.9])
        cube(ear,[x+.65,32.3,-1.08],[1.5,1.1,.15],13)
        cube(ear,[x+.9,33.4,-.98],[1,1.2,.15],13)
        cube(ear,[x+1.15,34.6,-.88],[.5,.9,.15],13)
        for c in bones[ear]['cubes'][first_ear_cube:]:
            c['pivot'] = [sign*3,32,0]
            c['rotation'] = [0,0,-sign*10]

    # Sleeves widen below the shoulder, with the tile's red cuff at the wrist.
    for side,x in [('right',-8.5),('left',3.75)]:
        sleeve=bone('fox_'+side+'_sleeve',side+'Arm',[(-5 if side=='right' else 5),22,0])
        cube(sleeve,[x,12,-2.45],[4.75,10.5,4.9],6,front=4,back=5)

    # Two separate robe panels follow their corresponding legs, leaving feet visible.
    for side,x in [('right',-4.5),('left',0)]:
        robe=bone('fox_'+side+'_robe',side+'Leg',[(-1.9 if side=='right' else 1.9),12,0])
        c=cube(robe,[x,3,-2.65],[4.5,9.4,5.3],9,front=7,back=8)
        # Split the single front design across both legs; avoid duplicate center stripes.
        c['uv']['north']=patch(7,(0 if side=='right' else 16,0,16,32))
        c['uv']['south']=patch(8,(0 if side=='left' else 16,0,16,32))
        foot=bone('fox_'+side+'_foot',side+'Leg',[(-1.9 if side=='right' else 1.9),12,0])
        cube(foot,[-4 if side=='right' else 0,1.3,-2.2],[4,2.2,4.4],11)
        cube(foot,[-4.15 if side=='right' else -.15,0,-2.8],[4.3,1.3,5],15)
    belt=bone('fox_sash','body',[0,14,0])
    cube(belt,[-4.25,12.5,-2.5],[8.5,2,5],15)
    cube(belt,[-4.35,14.3,-2.6],[8.7,.3,5.2],14,rect=(5,5,14,10))
    cube(belt,[-4.35,12.2,-2.65],[8.7,.6,5.3],13)
    cube(belt,[1.5,12.4,-3.4],[1.8,1.5,.8],13)
    cube(belt,[.4,12.8,-3.2],[1.4,.7,.6],13)
    for x,bottom in [(1,7.5),(2.8,8.8)]:
        cube(belt,[x,bottom,-3.05],[.65,12.8-bottom,.45],13)
        cube(belt,[x,bottom,-3.1],[.65,.4,.55],14,rect=(5,5,14,10))
    cube(belt,[2,11,-3.8],[1.6,1.5,1.2],14,rect=(3,3,22,20))
    cube(belt,[2.2,10.85,-3.65],[1.2,.35,.9],14)
    cube(belt,[2.67,11,-3.85],[.3,.7,.12],15)

    animation_bones={}
    for i,(x,yaw,lift) in enumerate([(-1.8,-38,24),(0,0,48),(1.8,38,24)]):
        tail=bone(f'fox_tail_{i}','body',[x,12,2.5],[lift,yaw,0])
        # Four overlapping segments taper towards the raised red tip.
        cube(tail,[x-1.3,10.7,2.5],[2.6,2.6,3])
        cube(tail,[x-2,10,4.9],[4,4,3.6])
        cube(tail,[x-2.1,9.9,8],[4.2,4.2,3.6])
        cube(tail,[x-1.7,10.3,11],[3.4,3.4,2.7],12)
        cube(tail,[x-1.1,10.9,13.2],[2.2,2.2,1.5],13)
        animation_bones[tail]={'rotation':{'0':[0,-4,0],'1.5':[2,4,0],'3':[0,-4,0]}}

    slim_proportions(bones)
    write('models/entity/pve3_kitsune_selected_a.geo.json',{'format_version':'1.21.0','minecraft:geometry':[model]})
    clip='animation.pve3.kitsune.selected_a.tails'
    write('animations/pve3_kitsune_selected_a.animation.json',{'format_version':'1.8.0','animations':{
        clip:{'loop':True,'animation_length':3,'bones':animation_bones}}})
    entity=json.loads((RP/'entity/kitsune.entity.json').read_text())
    desc=entity['minecraft:client_entity']['description']
    desc['textures']['default']='textures/entity/pve3/kitsune_selected_a_v1'
    desc['geometry']['default']='geometry.pve3.kitsune.selected_a'
    desc['animations']['fox_tails']=clip
    if 'fox_tails' not in desc['scripts']['animate']:desc['scripts']['animate'].append('fox_tails')
    write('entity/kitsune.entity.json',entity)
    print('Kitsune A:',len(model['bones']),'bones,',sum(len(b.get('cubes',[])) for b in model['bones']),'cubes')


if __name__=='__main__': build()
