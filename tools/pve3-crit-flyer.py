"""Build two RPG enemies from generated texture tiles; spec/37. No raster painting."""
import copy
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RP=ROOT/'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3'


def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def write(path,value): path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')


def patch(tile,rect=(0,0,32,32)):
    x,y,w,h=rect
    return {'uv':[tile%4*32+x,tile//4*32+y],'uv_size':[w,h]}


def uv(tile,front=None,back=None,rect=(0,0,32,32)):
    out={f:patch(tile,rect) for f in ('north','south','east','west','up','down')}
    if front is not None: out['north']=patch(front)
    if back is not None: out['south']=patch(back)
    return out


class Rig:
    def __init__(self,name,slim=False):
        self.name=name
        self.model=copy.deepcopy(read(RP/'models/entity/pve3_humanoid.geo.json')['minecraft:geometry'][0])
        self.model['description'].update(identifier=f'geometry.pve3.{name}.rpg',texture_width=128,
            texture_height=128,visible_bounds_width=5,visible_bounds_height=4,visible_bounds_offset=[0,1.3,0])
        self.bones={b['name']:b for b in self.model['bones']}
        for key,b in self.bones.items():
            if key in ('hat','jacket','leftSleeve','rightSleeve','leftPants','rightPants'):
                b['cubes']=[]
            for c in b.get('cubes',[]):
                c.pop('mirror',None)
                if key=='head': c['uv']=uv(1,0)
                elif key=='body': c['uv']=uv(14 if slim else 6,2,3)
                elif key.endswith('Arm'): c['uv']=uv(4,4,5)
                elif key.endswith('Leg'): c['uv']=uv(15,10,10)
        if slim:
            for side,sign in [('left',1),('right',-1)]:
                arm=self.bones[side+'Arm']['cubes'][0]
                arm.update(origin=[4 if sign==1 else -7,12,-2],size=[3,12,4])
        self.clips={}

    def bone(self,name,parent,pivot):
        b={'name':name,'parent':parent,'pivot':pivot,'cubes':[]}
        self.bones[name]=b;self.model['bones'].append(b)
        return name

    def cube(self,bone,origin,size,tile,front=None,back=None,rect=None):
        c={'origin':origin,'size':size,'uv':uv(tile,front,back,rect or (0,0,32,32))}
        if front is None and rect is None:
            # Material pieces crop a small part of a tile, preserving texel density.
            w,h,d=size
            for face,a,b in [('north',w,h),('south',w,h),('east',d,h),('west',d,h),('up',w,d),('down',w,d)]:
                pw,ph=min(30,max(1,round(a*2))),min(30,max(1,round(b*2)))
                c['uv'][face]=patch(tile,((32-pw)//2,(32-ph)//2,pw,ph))
        self.bones[bone]['cubes'].append(c)
        return c

    def pose(self,name,rotation):
        b=self.bones[name];p=self.bones[b['parent']]
        return {'rotation':[f'{v} - this' for v in rotation],
            'position':[f'{a-v} - this' for a,v in zip(b['pivot'],p['pivot'])]}

    def keys(self,name,frames):
        out=self.pose(name,next(iter(frames.values())))
        out['rotation']={str(t):self.pose(name,v)['rotation'] for t,v in frames.items()}
        return out

    def save(self):
        name=self.name
        write(RP/f'models/entity/pve3_{name}_rpg.geo.json',{'format_version':'1.21.0','minecraft:geometry':[self.model]})
        write(RP/f'animations/pve3_{name}_rpg.animation.json',{'format_version':'1.8.0','animations':{
            f'animation.pve3.{name}.{key}':v for key,v in self.clips.items()}})
        path=RP/f'entity/{name}.entity.json';doc=read(path);d=doc['minecraft:client_entity']['description']
        d['geometry']['default']=f'geometry.pve3.{name}.rpg'
        d['textures']['default']=f'textures/entity/pve3/{name}_rpg_v1'
        # Dedicated poses supersede the generic arms, while all shared bindings remain available.
        d['scripts']['animate']=[a for a in d['scripts']['animate'] if a not in ['attack_controller','rpg_idle','rpg_attack'] and not (isinstance(a,dict) and 'rpg_attack' in a)]
        for key in self.clips: d['animations']['rpg_'+key]=f'animation.pve3.{name}.{key}'
        d['scripts']['animate']+=['rpg_idle',{'rpg_attack':"q.property('pve_v3:swing') > 0"}]
        write(path,doc)
        print(name,len(self.bones),'bones',sum(len(b.get('cubes',[])) for b in self.bones.values()),'cubes')


def flyer():
    r=Rig('flyer',True)
    hair=r.bone('flight_hair','head',[0,29,3])
    r.cube(hair,[-4.25,31.6,-4.25],[8.5,.75,8.5],1)
    r.cube(hair,[-4.2,24,3.9],[8.4,8,.6],1)
    for side,s in [('left',1),('right',-1)]:
        strand=r.bone('flight_hair_'+side,'head',[s*4,28,2])
        r.cube(strand,[3.85 if s==1 else -4.6,20,2.8],[.75,9,1.6],1)
        r.cube(hair,[3.8 if s==1 else -4.5,24,-3.8],[.7,7.5,1.2],1)
        r.cube(hair,[s*3.5-.6,29.2,-4.6],[1.2,.7,.4],13)
        skirt=r.bone('flight_skirt_'+side,side+'Leg',[s*1.9,12,0])
        c=r.cube(skirt,[0 if s==1 else -4.25,7,-2.4],[4.25,5.5,4.8],9,7,8)
        c['uv']['north']=patch(7,(16 if s==1 else 0,0,16,32))
        c['uv']['south']=patch(8,(0 if s==1 else 16,0,16,32))
        wing=r.bone('flight_wing_'+side,'body',[s*3,22,3])
        tip=r.bone('flight_tip_'+side,wing,[s*13,25,3.5])
        def feather(b,x,y,w,h):
            r.cube(b,[x if s==1 else -x-w,y,3.6],[w,h,1.1],11)
            r.cube(b,[x+.3 if s==1 else -x-w+.3,y-1,3.7],[max(.5,w-.6),1.2,.9],12)
        # Solid overlapping feathers create a tapered wing, with no alpha planes.
        for x,y,w,h in [(3,21,4,3),(6,22,4,3),(9,23,4.5,3),(5,14,2.8,9),(7.6,13.5,2.8,11),(10.2,14,2.8,11.5)]:
            feather(wing,x,y,w,h)
        for x,y,w,h in [(12.5,15,2.8,11),(15,16.5,2.8,10),(17.5,18.5,2.6,8.5),(19.8,21,2.3,6),(21.8,23.5,1.8,4)]:
            feather(tip,x,y,w,h)
    idle={'waist':r.pose('waist',[8,0,0]),'body':r.pose('body',[0,0,0]),'leftArm':r.pose('leftArm',[12,0,-12]),
          'rightArm':r.pose('rightArm',[12,0,12]),'leftLeg':r.pose('leftLeg',[16,0,-3]),'rightLeg':r.pose('rightLeg',[10,0,3])}
    for side,s in [('left',1),('right',-1)]:
        idle['flight_wing_'+side]={'rotation':{'0':[0,s*14,-s*22],'0.25':[0,-s*14,s*28],'0.6':[0,s*14,-s*22],'1':[0,s*14,-s*22]}}
        idle['flight_tip_'+side]={'rotation':{'0':[0,s*12,-s*8],'0.3':[0,-s*20,s*18],'0.65':[0,s*12,-s*8],'1':[0,s*12,-s*8]}}
        idle['flight_hair_'+side]={'rotation':{'0':[-5,0,0],'.5':[5,0,s*3],'1':[-5,0,0]}}
        idle['flight_skirt_'+side]={'rotation':{'0':[-3,0,0],'.5':[3,0,0],'1':[-3,0,0]}}
    r.clips['idle']={'loop':True,'animation_length':1,'bones':idle}
    r.clips['attack']={'loop':False,'animation_length':.5,
        'anim_time_update':"math.clamp((10 - q.property('pve_v3:swing')) / 20, 0, 0.5)",
        'bones':{'rightArm':r.keys('rightArm',{0:[-90,0,12],.1:[-55,-12,8],.3:[-20,0,12],.5:[12,0,12]})}}
    r.save()


def crit():
    r=Rig('crit')
    armor=r.bone('oni_armor','body',[0,22,0])
    r.cube(armor,[-4.5,13,-2.6],[9,10.8,5.2],6,2,3)
    hair=r.bone('oni_hair','head',[0,30,0])
    r.cube(hair,[-4.3,31.6,-4.2],[8.6,1.1,8.4],1)
    r.cube(hair,[-4.2,26,3.9],[8.4,6,.6],1)
    for side,s in [('left',1),('right',-1)]:
        horn=r.bone('oni_horn_'+side,'head',[s*2.6,31,0])
        for dx,y,w,h in [(0,31.6,1.8,1.4),(.2,33,1.35,1.3),(.45,34.3,.8,1),(.65,35.3,.4,.7)]:
            r.cube(horn,[s*(2.6+dx)-w/2,y,-.6],[w,h,1.3 if w>1 else .8],12)
        shoulder=r.bone('oni_shoulder_'+side,side+'Arm',[s*5,22,0])
        r.cube(shoulder,[3.7 if s==1 else -9,20,-2.7],[5.3,4.1,5.4],6)
        r.cube(shoulder,[3.6 if s==1 else -9.1,20,-2.8],[5.5,.6,5.6],13)
        glove=r.bone('oni_glove_'+side,side+'Arm',[s*5,22,0])
        r.cube(glove,[3.8 if s==1 else -8.2,11.7,-2.2],[4.4,3.6,4.4],6)
        boot=r.bone('oni_boot_'+side,side+'Leg',[s*1.9,12,0])
        r.cube(boot,[-.1 if s==1 else -4.1,0,-2.5],[4.2,4,4.7],6)
        cloth=r.bone('oni_cloth_'+side,side+'Leg',[s*1.9,12,0])
        c=r.cube(cloth,[0 if s==1 else -4.1,7,-2.8],[4.1,5.5,.5],9,7,8)
        c['uv']['north']=patch(7,(16 if s==1 else 0,0,16,32))
    club=r.bone('oni_club','rightArm',[-6,13,-.5])
    r.cube(club,[-6.65,12.35,-12],[1.3,1.3,13],14)
    r.cube(club,[-8,11,-21],[4,4,11],11)
    r.cube(club,[-8.5,10.5,-19.5],[5,5,7.5],11)
    r.cube(club,[-7.5,11.5,-22],[3,3,1.5],11)
    for z in [-18.5,-13]:
        r.cube(club,[-8.6,10.4,z],[5.2,5.2,.75],6)
        for x in [-8.9,-3.9]:r.cube(club,[x,12.5,z-.2],[.8,1,1.1],6)
    # Carry beside the face; club axis extends forward from the fist.
    idle={'rightArm':r.pose('rightArm',[-48,0,8]),'leftArm':r.pose('leftArm',[-10,0,-8])}
    r.clips['idle']={'loop':True,'animation_length':1,'bones':idle}
    r.clips['attack']={'loop':False,'animation_length':.5,
        'anim_time_update':"math.clamp((10 - q.property('pve_v3:swing')) / 20, 0, 0.5)",
        'bones':{'rightArm':r.keys('rightArm',{0:[-78,0,8],.12:[12,-15,8],.25:[8,-12,8],.5:[-48,0,8]}),
                 'waist':r.keys('waist',{0:[-6,10,0],.12:[12,-12,0],.25:[10,-10,0],.5:[0,0,0]})}}
    r.save()


if __name__=='__main__':
    flyer();crit()
