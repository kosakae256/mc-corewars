"""専用模型と数値キーフレーム。仕様: spec/29-humanoid-designs.md。"""
import copy
import math


MATERIALS = {'cloth': 0, 'dark': 1, 'light': 2, 'accent': 3,
             'metal': 4, 'leather': 5, 'face': 6, 'hair': 7}


def uv(material):
    # 生成原稿から採った8種類の8x8素材。標準スキン領域とは重ならない。
    index = MATERIALS[material]
    return {face: {'uv': [64 + (index % 4)*8, (index//4)*8], 'uv_size': [8, 8]}
            for face in ('north','south','east','west','up','down')}


class Model:
    def __init__(self, base, ident):
        self.data = copy.deepcopy(base)
        self.data['description'].update(identifier=f'geometry.pve3.design.{ident}',
            texture_width=128, texture_height=128, visible_bounds_width=5,
            visible_bounds_height=4, visible_bounds_offset=[0, 1.5, 0])
        self.bones = {b['name']: b for b in self.data['bones']}
        self.clips = {}
        self.ident = ident

    def bone(self, name, parent='body', pivot=(0,24,0), rotation=None):
        b = {'name': name, 'parent': parent, 'pivot': list(pivot)}
        if rotation is not None:
            b['rotation'] = rotation
        self.data['bones'].append(b)
        self.bones[name] = b
        return name

    def cube(self, bone, origin, size, material='cloth', rotation=None, pivot=None):
        c = {'origin': origin, 'size': size, 'uv': uv(material)}
        if rotation is not None:
            c.update(rotation=rotation, pivot=pivot or origin)
        self.bones[bone].setdefault('cubes', []).append(c)
        return c

    def loop(self, name, length, bones):
        self.clips[f'animation.pve3.design.{self.ident}.{name}'] = {
            'loop': True, 'animation_length': length, 'bones': bones}

    def armor(self, heavy=False):
        self.bone('design_chest')
        self.cube('design_chest',[-4.4,15,-3.1],[8.8,8,1.2],'metal')
        self.cube('design_chest',[-4.4,15,2],[8.8,8,1.2],'dark')
        for side, x in [('right',-8.7),('left',3.7)]:
            bone=self.bone(f'design_{side}_pauldron',side+'Arm')
            self.cube(bone,[x,20,-2.8],[5,4.8 if heavy else 3,5.6],'metal')
            self.cube(bone,[x,20,-3],[5,1,0.5],'accent')

    def gloves(self, large=False, one=False, material='metal'):
        for side,x in [('right',-9 if large else -8.3),('left',3.5 if large else 3.8)]:
            if one and side=='left': continue
            b=self.bone('design_'+side+'_fist',side+'Arm')
            self.cube(b,[x,11,-3 if large else -2.4],
                      [5.5 if large else 4.5,5.5 if large else 3.5,6 if large else 4.8],material)
            self.cube(b,[x,14,-3.6 if large else -2.8],[5.5 if large else 4.5,1,0.6],'accent')

    def pack(self, material='leather'):
        b=self.bone('design_pack')
        self.cube(b,[-3.5,14,2],[7,8,3.5],material)
        self.cube(b,[-3.7,20,2],[7.4,1,3.8],'dark')
        return b

    def tails(self, count=3):
        bones={}
        for i in range(count):
            x=(i-(count-1)/2)*2
            name=self.bone('design_tail_'+str(i),'body',(x,13,2),[-25,(i-(count-1)/2)*25,0])
            for j in range(4):
                self.cube(name,[x-1.3,11-j*.7,2+j*3],[2.6,3.2,3.5], 'light' if j==3 else 'accent')
            bones[name]={'rotation':{'0':[0,-8,0], '1':[0,8,0], '2':[0,-8,0]}}
        self.loop('tails',2,bones)

    def gun(self, rifle=False):
        b=self.bone('design_weapon','rightArm',(-6,14,0))
        # 下向きの腕のローカル姿勢で作り、腕を-90度構えて前へ向ける。
        self.cube(b,[-6.7,10,-1.8],[1.4,5,2],'dark')
        self.cube(b,[-6.55,2 if rifle else 6,-1.2],[1.1,10 if rifle else 6,1.1],'metal')
        self.cube(b,[-7,12,-.8],[2,3,2.5],'leather')
        if rifle:
            self.cube(b,[-6.7,4,0.8],[1.4,6,1.2],'accent')
            self.cube(b,[-6.6,13,1.1],[1.2,5,2.3],'dark')
        else:
            self.cube(b,[-7,9,-1.5],[2,2.5,2],'metal')
        self.loop('aim',1,{'rightArm':{'rotation':['-90 - this','0 - this','0 - this']}})


def create(base, ident, kind):
    m=Model(base,ident)
    if kind=='ice':
        m.gloves(material='accent')
        for side,x in [('right',-7),('left',6)]:
            b=m.bone('design_'+side+'_ice',side+'Arm')
            for j in range(3):
                m.cube(b,[x-1+j*.65,23,-1+j*.6],[1.1,2+j,1.1],'light',[0,0,(j-1)*20],[x,23,0])
    elif kind in ('armor','tank','titan','gauntlet'):
        if kind!='gauntlet': m.armor(kind in ('tank','titan'))
        if kind!='armor': m.gloves(kind in ('titan','gauntlet'),kind=='gauntlet')
        if kind=='tank':
            b=m.bone('design_visor','head')
            m.cube(b,[-4.3,27,-4.7],[8.6,1.2,1],'dark')
            m.cube(b,[-4.3,24,-4.5],[8.6,2,1],'metal')
    elif kind=='saw':
        b=m.bone('design_saw_case','rightArm',(-6,14,0))
        m.cube(b,[-7.5,10,-2],[3,5,4],'accent')
        m.cube(b,[-6.6,14,-1],[1.2,3,2.2],'dark')
        blade=m.bone('design_saw_blade',b,(-6,5,0))
        # 歯のある円盤: YZ面を回転。段状の円盤に12枚の歯を付ける。
        for row in range(-4,4):
            half=math.sqrt(4.2**2-(row+.5)**2)
            m.cube(blade,[-6.4,5+row,-half],[.8,1,half*2],'metal')
        for j in range(12):
            angle=j*30
            a=math.radians(angle)
            m.cube(blade,[-6.6,8.4,-.7],
                   [1.2,1.5,1.5],'light',[angle,0,0],[-6,5,0])
        m.cube(blade,[-6.9,4,-1],[1.8,2,2],'accent')
        m.loop('hold',1,{'rightArm':{'rotation':['-70 - this','0 - this','0 - this']}})
        m.loop('spin',.5,{'design_saw_blade':{'rotation':{'0':[0,0,0],'.5':[360,0,0]}}})
    elif kind=='wings':
        anim={}
        for side,sign in [('left',1),('right',-1)]:
            b=m.bone('design_'+side+'_wing','body',(sign*2,22,3))
            m.cube(b,[2 if sign>0 else -14,20,2.7],[12,2,1.8],'light',
                   [0,0,sign*-15],[sign*2,22,3])
            for j in range(6):
                x=sign*(4+j*1.7)
                m.cube(b,[x-1,14-j*.5,3],[2.2,8-j*.4,1.1],
                       'light' if j%2==0 else 'accent',[0,0,-sign*12],[x,22,3])
            anim[b]={'rotation':{'0':[0,sign*-25,0],'.2':[0,sign*30,sign*12],
                                '.4':[0,sign*-25,0],'.6':[0,sign*-40,-sign*8],'.8':[0,sign*-25,0]}}
        m.loop('flap',.8,anim)
    elif kind=='cowboy':
        b=m.bone('design_hat','head')
        m.cube(b,[-6,30,-6],[12,1,12],'leather')
        m.cube(b,[-4,31,-4],[8,3,8],'leather')
        m.cube(b,[-4.1,31,-4.1],[8.2,.8,8.2],'dark')
        m.gun()
        b=m.bone('design_holster','rightLeg')
        m.cube(b,[-5,6,-1],[1.8,4,2.4],'leather')
    elif kind=='rifle': m.gun(True)
    elif kind=='ranger':
        b=m.bone('design_ranger_cape','body',(0,23,2.5))
        m.cube(b,[-4.3,16,2.3],[8.6,7,.8],'cloth')
        pouch=m.bone('design_shell_pouches')
        for x in (-3,2): m.cube(pouch,[x,13,-3.1],[1.6,2.6,1.2],'leather')
    elif kind=='samurai':
        b=m.bone('design_sash')
        for x in (-4.5,2.5): m.cube(b,[x,9,-2.8],[2,5,5.6],'cloth')
        b=m.bone('design_headband','head')
        m.cube(b,[-4.1,29,-4.1],[8.2,.7,8.2],'light')
        m.cube(b,[1,27,4],[1,3,4],'light',[20,0,0],[1,29,4])
    elif kind in ('bomb','grenadier'):
        if kind=='grenadier': m.pack()
        b=m.bone('design_bombs')
        for x,y,z,s in ([(0,17,-5,5)] if kind=='bomb' else [(-4,14,-1,2.5),(4,14,-1,2.5)]):
            m.cube(b,[x-s/2,y-s/2,z-s/2],[s,s,s],'dark')
            m.cube(b,[x-s*.4,y-s*.6,z-s*.4],[s*.8,s*1.2,s*.8],'dark')
            m.cube(b,[x-.3,y+s*.6,z-.3],[.6,1.6,.6],'leather')
            m.cube(b,[x-.4,y+s*.6+1,z-.4],[.8,.8,.8],'accent')
    elif kind=='medic':
        m.pack('light')
        b=m.bone('design_medicine')
        for x in (-4,3):
            m.cube(b,[x,13,-3],[1.5,2.5,1.5],'accent')
            m.cube(b,[x+.3,15.5,-2.7],[.9,.7,.9],'leather')
    elif kind=='banner':
        b=m.bone('design_standard_pole')
        m.cube(b,[-.4,14,3.2],[.8,23,.8],'leather')
        flag=m.bone('design_standard_flag',b,(0,34,3.6))
        m.cube(flag,[0,26,3.3],[8,8,.6],'accent')
        m.cube(flag,[.2,26,3.2],[.7,8,.8],'metal')
        m.cube(flag,[0,33.3,3.2],[8,.7,.8],'metal')
        m.loop('flag',2,{flag:{'rotation':{'0':[0,-12,0],'1':[0,12,0],'2':[0,-12,0]}}})
    elif kind=='phase':
        b=m.bone('design_phase_crystal')
        for x in (-5,4): m.cube(b,[x,23,1],[1.8,3,1.8],'accent',[0,0,35],[x,24,1])
    elif kind=='hazmat':
        b=m.pack('accent')
        for x in (-2.5,1): m.cube(b,[x,15,4.5],[2,7,2.5],'accent')
        b=m.bone('design_respirator','head')
        m.cube(b,[-2,24.5,-5.4],[4,2.5,1.6],'dark')
        for x in (-3.5,2): m.cube(b,[x,25,-5],[1.5,2,1.8],'metal')
    elif kind=='tesla':
        b=m.pack('dark')
        for x in (-3,2):
            m.cube(b,[x,20,4],[1,7,1],'metal')
            for y in range(21,27,2): m.cube(b,[x-.7,y,3.3],[2.4,.6,2.4],'accent')
            m.cube(b,[x-.5,27,3.5],[2,2,2],'light')
    elif kind=='fox':
        b=m.bone('design_ears','head')
        for sign in (-1,1):
            x=sign*2.8
            m.cube(b,[x-1.4,31,-1],[2.8,3,2],'light',[0,0,sign*-12],[x,31,0])
            m.cube(b,[x-.8,34,-.7],[1.6,1.5,1.4],'light')
            m.cube(b,[x-.6,31.7,-1.1],[1.2,2,.3],'accent')
        m.tails()
    elif kind in ('ghost','orbit'):
        # 股下を布の子ボーンで覆う。既存の脚と歩行は残す。
        b=m.bone('design_shroud','body',(0,13,0))
        for j in range(4):
            m.cube(b,[-4.2+j*2.1,1+(j%2)*2,-2.3],[2.2,12-(j%2)*2,4.6],'cloth')
        m.loop('cloth',2,{b:{'rotation':{'0':[3,0,-2],'1':[-3,0,2],'2':[3,0,-2]}}})
        if kind=='orbit':
            ring=m.bone('design_orbit','body',(0,23,0))
            for i in range(8):
                a=math.radians(i*45)
                m.cube(ring,[10*math.cos(a)-.8,22.2,10*math.sin(a)-.8],[1.6,1.6,1.6],'accent')
            m.loop('orbit',4,{ring:{'rotation':{'0':[0,0,0],'4':[0,360,0]}}})
    elif kind=='blades':
        for side,x in [('right',-6.2),('left',5.3)]:
            b=m.bone('design_'+side+'_blade',side+'Arm')
            m.cube(b,[x,8,-3],[.9,7,1],'metal')
            m.cube(b,[x+.2,6,-2.8],[.5,2,.6],'light')
            m.cube(b,[x-.5,14,-3.3],[1.9,1,1.6],'dark')
    else: raise ValueError(kind)
    if kind=='bomb':
        # 爆弾は服の模様ではなく、本当に隙間のある骨格へ置き換える。
        for name in ('body','jacket','hat','leftSleeve','rightSleeve','leftPants','rightPants'):
            m.bones[name]['cubes']=[]
        m.cube('body',[-.65,12,.3],[1.3,12,1.3],'light')
        for y in (16,19,22):
            m.cube('body',[-3,y,-1.5],[6,.9,.9],'light')
            for x in (-3,2.1): m.cube('body',[x,y,-1.5],[.9,.9,3],'light')
        m.cube('body',[-3,12,-1],[6,1.5,2.5],'light')
        for side in ('left','right'):
            arm=m.bones[side+'Arm'];x=5.1 if side=='left' else -6.9
            arm['cubes']=[]
            m.cube(side+'Arm',[x,12,-.9],[1.8,12,1.8],'light')
            m.cube(side+'Arm',[x-.3,16.8,-1.2],[2.4,1.6,2.4],'light')
            leg=m.bones[side+'Leg'];x=1 if side=='left' else -2.8
            leg['cubes']=[]
            m.cube(side+'Leg',[x,0,-.9],[1.8,12,1.8],'light')
            m.cube(side+'Leg',[x-.3,5,-1.2],[2.4,1.6,2.4],'light')
            m.cube(side+'Leg',[x-.3,0,-2],[2.4,1,3],'light')
        m.loop('carry',1,{'rightArm':{'rotation':['-45 - this','-15 - this','0 - this']},
                          'leftArm':{'rotation':['-45 - this','15 - this','0 - this']}})
        for bone in m.data['bones']:
            bone['pivot']=[round(v*.8,4) for v in bone.get('pivot',[0,0,0])]
            for cube in bone.get('cubes',[]):
                for key in ('origin','size','pivot'):
                    if key in cube: cube[key]=[round(v*.8,4) for v in cube[key]]
                if 'inflate' in cube: cube['inflate']*=.8
    return m.data,m.clips
