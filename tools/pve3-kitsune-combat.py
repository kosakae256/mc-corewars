"""Kitsune behavior groups, casting animations and recolored vanilla flame emitters.

spec/34-kitsune-foxfire.md. Preserves the custom mesh, tails and client effects.
Run pve3-foxfire-texture.ps1 for the deterministic vanilla-flame hue conversion.
"""
import copy
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT/'worlds/pve-v3/packs/pve_v3'
RP = PACK/'resource_packs/pve_v3'
BP = PACK/'behavior_packs/pve_v3'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, data):
    path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')


def behavior():
    path=BP/'entities/kitsune.json'
    doc=read(path)
    e=doc['minecraft:entity']; c=e['components']
    groups=e.setdefault('component_groups',{}); events=e.setdefault('events',{})
    e['description']['properties']['pve_v3:fox_charge']={
        'type':'int','range':[0,100],'default':0,'client_sync':True}
    c['minecraft:mark_variant']={'value':0}
    # Roster speed 1.0 uses the shared WALK conversion, not vanilla movement 1.0.
    c['minecraft:movement']={'value':0.2875,'max':2.0125}
    walk=groups.setdefault('pve_v3:fox_walk',{})
    for name in ['minecraft:behavior.move_around_target','minecraft:behavior.random_stroll']:
        if name in c: walk[name]=c.pop(name)
    walk['minecraft:behavior.move_around_target'].update(
        destination_position_range={'min':9,'max':10}, destination_pos_spread_degrees=30)
    c['minecraft:behavior.look_at_player']['look_distance']=40
    # This attack is entirely scripted. The old melee goal would walk into the player.
    for block in [c,*groups.values()]:
        block.pop('minecraft:behavior.melee_box_attack',None)
        block.pop('minecraft:attack',None)
    for phase,value in [('none',0),('charge',1),('slash',2)]:
        groups['pve_v3:pose_'+phase]={'minecraft:mark_variant':{'value':value}}
        events['pve_v3:pose_'+phase]={
            'remove':{'component_groups':['pve_v3:pose_none','pve_v3:pose_charge','pve_v3:pose_slash','pve_v3:fox_walk']},
            'add':{'component_groups':['pve_v3:pose_'+phase]+(['pve_v3:fox_walk'] if phase=='none' and 'pve_v3:ranged_seek' not in groups else [])}}
    # Initialization also runs from Script API, so existing entities recover after reload.
    if 'minecraft:entity_spawned' not in events:
        events['minecraft:entity_spawned']=copy.deepcopy(events['pve_v3:pose_none'])
    # Python preserves existing float properties as 0.0/10.0 rather than invalid ints.
    write(path,doc)


def archive_spin():
    """Retire kitsune's replaced spin assets while retaining the editable originals."""
    references=''.join(p.read_text(encoding='utf-8-sig') for folder in ['entity','attachables'] for p in (RP/folder).glob('*.json'))
    if 'animation.pve3.spin' in references: return
    archive=ROOT/'worlds/pve-v3/user/kitsune-candidates/legacy-combat'
    archive.mkdir(parents=True,exist_ok=True)
    for relative in ['animations/pve3_spin.animation.json','animation_controllers/pve3_spin.ac.json']:
        src=RP/relative
        if src.exists():
            dest=archive/src.name
            if dest.exists() and dest.read_bytes()!=src.read_bytes():
                raise ValueError('Legacy archive already contains different data: '+str(dest))
            shutil.copyfile(src,dest)
            src.unlink()


def pose(rotation,position):
    return {'rotation':[f'{v} - this' for v in rotation],
            'position':[f'{v} - this' for v in position]}


def animation():
    model=read(RP/'models/entity/pve3_kitsune_selected_a.geo.json')['minecraft:geometry'][0]
    bones={b['name']:b for b in model['bones']}
    def rest(name):
        b=bones[name];p=bones[b['parent']]
        return [round(a-v,6) for a,v in zip(b['pivot'],p['pivot'])]
    charge={};release={}
    for name,sign in [('rightArm',-1),('leftArm',1)]:
        charge[name]=pose([0,0,0],rest(name))
        charge[name]['rotation']={
            '0.0':pose([-25,sign*12,sign*12],[])['rotation'],
            '0.18':pose([-140,sign*5,sign*28],[])['rotation'],
            '0.65':pose([-170,sign*5,sign*28],[])['rotation'],
            '0.85':pose([-170,sign*5,sign*28],[])['rotation'],
            '0.999':pose([-90,sign*12,0],[])['rotation']}
        release[name]=pose([-90,sign*12,0],rest(name))
    for name in ['body','leftLeg','rightLeg']:
        charge[name]=pose([0,0,0],rest(name))
        release[name]=pose([0,0,0],rest(name))
    charge['body']['rotation']={
        '0.0':pose([4,0,0],[])['rotation'],
        '0.25':pose([-6,0,0],[])['rotation'],
        '0.85':pose([-6,0,0],[])['rotation'],
        '0.999':pose([8,0,0],[])['rotation']}
    release['body']=pose([8,0,0],rest('body'))
    # Head keeps looking; body yaw is supplied by the server, tails retain their clip.
    clips={
        'animation.pve3.kitsune.charge':{'loop':True,'animation_length':1,
            'anim_time_update':"math.min(0.999, q.property('pve_v3:fox_charge') * 0.01)",'bones':charge},
        'animation.pve3.kitsune.release':{'loop':True,'animation_length':.5,'bones':release}}
    write(RP/'animations/pve3_kitsune_combat.animation.json',{'format_version':'1.8.0','animations':clips})
    controller='controller.animation.pve3.kitsune_foxfire'
    write(RP/'animation_controllers/pve3_kitsune_foxfire.ac.json',{
        'format_version':'1.10.0','animation_controllers':{controller:{'initial_state':'idle','states':{
            'idle':{'transitions':[{'charge':'q.mark_variant == 1'},{'release':'q.mark_variant == 2'}]},
            'charge':{'animations':['fox_charge'],'transitions':[{'release':'q.mark_variant == 2'},{'idle':'q.mark_variant == 0'}]},
            'release':{'animations':['fox_release'],'transitions':[{'idle':'q.mark_variant == 0'},{'charge':'q.mark_variant == 1'}]}
        }}}})
    path=RP/'entity/kitsune.entity.json';doc=read(path);d=doc['minecraft:client_entity']['description']
    d['animations'].update(fox_charge='animation.pve3.kitsune.charge',
        fox_release='animation.pve3.kitsune.release',fox_combat=controller)
    for key in ['pve3_spin','pve3_spin_controller']: d['animations'].pop(key,None)
    d['scripts']['animate']=[v for v in d['scripts']['animate'] if v not in ['pve3_spin_controller','fox_combat']]+['fox_combat']
    write(path,doc)


def cone_offset(radius):
    """Uniform solid angle around a three-dimensional axis, supplied by Script API."""
    cosine='(1 - v.particle_random_1 * (1 - math.cos(v.fox_angle * 0.5)))'
    sine=f'math.sqrt(math.max(0, 1 - {cosine} * {cosine}))'
    azimuth='(v.particle_random_2 * 360)'
    return [f'(v.fox_forward_{axis} * {cosine} + v.fox_right_{axis} * {sine} * math.cos({azimuth}) + v.fox_up_{axis} * {sine} * math.sin({azimuth})) * ({radius})' for axis in 'xyz']


def travel_radius(random=3):
    """One stable speed per particle, independent of direction and lifetime."""
    return f'v.particle_age * (30 + v.particle_random_{random} * 60)'


def particles():
    original=read(ROOT/'bedrock-samples/resource_pack/particles/basic_flame.json')
    billboard=original['particle_effect']['components']['minecraft:particle_appearance_billboard']
    for color in ['blue','purple']:
        for kind in ['charge','wave']:
            wave=kind=='wave'
            # Visuals continue beyond the damage range at constant speed until expiration.
            radius=travel_radius()
            shape={'offset':[0,0,0],'direction':[0,1,0]}
            bill=copy.deepcopy(billboard)
            bill.pop('direction',None)
            size='(0.6 + v.particle_random_4 * 0.5) * (1 - 0.65 * v.particle_age / v.particle_lifetime) + 0.06' if wave else '(0.12 + v.particle_random_1 * 0.12) * (1 - v.particle_age / v.particle_lifetime)'
            bill.update(size=[size,size],uv={'texture_width':8,'texture_height':8,'uv':[0,0],'uv_size':[8,8]})
            components={
                'minecraft:emitter_lifetime_once':{'active_time':.05},
                'minecraft:emitter_rate_instant':{'num_particles':240 if wave else 3},
                'minecraft:emitter_shape_point':shape,
                'minecraft:particle_initial_speed':.6 if wave else .2,
                'minecraft:particle_motion_dynamic':{'linear_acceleration':[0,.5,0],'linear_drag_coefficient':1},
                'minecraft:particle_lifetime_expression':{'max_lifetime':'0.45 + v.particle_random_4 * 1.55' if wave else .4},
                'minecraft:particle_appearance_billboard':bill,
                'minecraft:particle_appearance_tinting':{'color':[1,1,1,
                    'math.min(1, v.particle_age / 0.025) * (1 - v.particle_age / v.particle_lifetime)' if wave else '1 - v.particle_age / v.particle_lifetime']}}
            if wave:
                components.pop('minecraft:particle_motion_dynamic')
                components.pop('minecraft:particle_initial_speed')
                components['minecraft:particle_motion_parametric']={'relative_position':cone_offset(radius)}
            write(RP/f'particles/foxfire_{kind}_{color}.json',{'format_version':'1.10.0','particle_effect':{
                'description':{'identifier':f'pve_v3:foxfire_{kind}_{color}',
                    'basic_render_parameters':{'material':'particles_alpha','texture':f'textures/particle/pve3_foxfire_{color}'}},
                'components':components}})


def accents():
    """Additional custom movement and flashes using existing project textures."""
    ring='v.particle_random_1 * 360 + v.particle_age * 400'
    defs={
        'orbit':(12,.65,'pve3_spark',[.055,.14],[.5,.35,1,1],{
            'minecraft:particle_motion_parametric':{'relative_position':[
                f'math.cos({ring}) * (0.7 - v.particle_age * 0.65)',
                'v.particle_age * 0.4',f'math.sin({ring}) * (0.7 - v.particle_age * 0.65)']}}),
        'charge_glow':(1,.35,'pve3_glow',[.35,.35],[.3,.25,1,.45],{}),
        'flash':(1,.22,'pve3_glow',['1.6 * (1 - v.particle_age / v.particle_lifetime)']*2,[.6,.65,1,.75],{}),
        'front':(84,'0.35 + v.particle_random_3 * 1.1','pve3_flame',[.55,.8],[.35,.35,1,.9],{
            'minecraft:particle_motion_parametric':{'relative_position':
                cone_offset(travel_radius(4))}}),
        'embers':(96,'0.5 + v.particle_random_4 * 1.5','pve3_spark',[.04,.19],[.7,.5,1,1],{
            'minecraft:particle_motion_parametric':{'relative_position':
                cone_offset(travel_radius())}})
    }
    for name,(count,life,texture,size,color,extra) in defs.items():
        from PIL import Image
        with Image.open(RP/f'textures/particle/{texture}.png') as img: width,height=img.size
        components={
            'minecraft:emitter_lifetime_once':{'active_time':.05},
            'minecraft:emitter_rate_instant':{'num_particles':count},
            'minecraft:emitter_shape_point':{'offset':[0,0,0]},
            'minecraft:particle_lifetime_expression':{'max_lifetime':life},
            'minecraft:particle_appearance_billboard':{'size':size,'facing_camera_mode':'lookat_xyz',
                'uv':{'texture_width':width,'texture_height':height,'uv':[0,0],'uv_size':[width,height]}},
            'minecraft:particle_appearance_tinting':{'color':color[:3]+[f'{color[3]} * (1 - v.particle_age / v.particle_lifetime)']}}
        components.update(extra)
        write(RP/f'particles/foxfire_{name}.json',{'format_version':'1.10.0','particle_effect':{
            'description':{'identifier':f'pve_v3:foxfire_{name}',
                'basic_render_parameters':{'material':'particles_add','texture':f'textures/particle/{texture}'}},
            'components':components}})


def aura():
    """Blue and purple flames spiral around the body while charging."""
    for color,sign in [('blue',1),('purple',-1)]:
        doc=read(RP/f'particles/foxfire_charge_{color}.json')
        effect=doc['particle_effect']; effect['description']['identifier']=f'pve_v3:foxfire_aura_{color}'
        c=effect['components']; c['minecraft:emitter_rate_instant']['num_particles']=10
        c['minecraft:particle_lifetime_expression']['max_lifetime']='0.6 + v.particle_random_4 * 0.2'
        c.pop('minecraft:particle_motion_dynamic');c.pop('minecraft:particle_initial_speed')
        angle=f'v.particle_random_1 * 360 + v.particle_age * {sign*230}'
        radius='(0.65 + v.particle_random_2 * 0.2)'
        c['minecraft:particle_motion_parametric']={'relative_position':[
            f'math.cos({angle}) * {radius}', '.15 + v.particle_random_3 * 1.8 + v.particle_age * .5',
            f'math.sin({angle}) * {radius}']}
        c['minecraft:particle_appearance_billboard']['size']=['(.16 + v.particle_random_4 * .12) * (1 - v.particle_age / v.particle_lifetime)']*2
        c['minecraft:particle_appearance_tinting']['color']=[1,1,1,'0.85 * (1 - v.particle_age / v.particle_lifetime)']
        write(RP/f'particles/foxfire_aura_{color}.json',doc)


def sounds():
    """Dedicated attenuation distances; keep vanilla and other custom sounds intact."""
    path=RP/'sounds/sound_definitions.json'
    doc=read(path)
    for name,source in [('ignite','sounds/fire/ignite'),('blast','sounds/mob/ghast/fireball4')]:
        doc['sound_definitions'][f'pve_v3:foxfire.{name}']={
            'category':'hostile','min_distance':64.0,'max_distance':96.0,
            'sounds':[{'name':source,'volume':1.0,'is3D':True,'stream':False}]}
    write(path,doc)


if __name__=='__main__':
    sounds()
    behavior();animation();archive_spin();particles();accents();aura()
    print('Kitsune: speed 1.0, 2 clips, 11 emitters, 30-90 m/s per-particle travel, up to 2 s flames')
