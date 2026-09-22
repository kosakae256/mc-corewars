"""Build three low-resolution RPG enemy rigs. See spec/33-saw-and-bomb-models.md.

Only geometry/animation/JSON generation here; the atlas is generated artwork.
Run pve3-saw-bomb-texture.ps1 to convert that artwork to 32x32 first.
Coordinates are Bedrock model units (16 = one block), front is negative Z.
"""
import copy
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RP = ROOT / 'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3'
FACES = ('north', 'south', 'east', 'west', 'up', 'down')


def write(path, value):
    (RP / path).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def patch(tile, width=8, height=8):
    return {'uv': [tile % 4 * 8, tile // 4 * 8], 'uv_size': [width, height]}


class Rig:
    """Retain the vanilla animation skeleton while replacing all visible cubes."""
    def __init__(self, name):
        self.name = name
        self.model = copy.deepcopy(json.loads((RP / 'models/entity/pve3_humanoid.geo.json').read_text())['minecraft:geometry'][0])
        self.model['description'].update(identifier=f'geometry.pve3.{name}.rpg_v1',
            texture_width=32, texture_height=32, visible_bounds_width=3.5,
            visible_bounds_height=3, visible_bounds_offset=[0, 1, -.25])
        self.bones = {b['name']: b for b in self.model['bones']}
        for b in self.bones.values():
            b.pop('cubes', None)
            b.pop('mirror', None)

    def bone(self, name, parent, pivot):
        self.bones[name] = {'name': name, 'parent': parent, 'pivot': list(pivot)}
        self.model['bones'].append(self.bones[name])
        return name

    def cube(self, bone, origin, size, tile, front=None, turn=None, pivot=None):
        # Material patches keep roughly one texel per model unit. Faces use all 8x8.
        w, h, d = size
        uv = {f: patch(tile, min(8, max(1, round(a))), min(8, max(1, round(b))))
              for f, a, b in [('north',w,h),('south',w,h),('east',d,h),
                              ('west',d,h),('up',w,d),('down',w,d)]}
        if front is not None:
            uv['north'] = patch(front)
        c = {'origin': list(origin), 'size': list(size), 'uv': uv}
        if turn is not None:
            c.update(rotation=turn, pivot=pivot or [0, 0, 0])
        self.bones[bone].setdefault('cubes', []).append(c)
        return c

    def bomb(self, name, parent, center, radius):
        """Stepped cubic sphere: five stacked tiers, cap, bent fuse and ember."""
        x, y, z = center
        self.bone(name, parent, center)
        for lo, hi, width in [(-1,-.6,.6),(-.6,-.3,.85),(-.3,.3,1),(.3,.6,.85),(.6,1,.6)]:
            self.cube(name, [x-radius*width,y+radius*lo,z-radius*width],
                      [radius*width*2,radius*(hi-lo),radius*width*2], 10)
        self.cube(name,[x-radius*.23,y+radius,z-radius*.23],[radius*.46,radius*.22,radius*.46],12)
        self.cube(name,[x-.3,y+radius*1.2,z-.3],[.6,radius*.45,.6],14)
        self.cube(name,[x-.3,y+radius*1.6,z-.3],[radius*.4,.6,.6],14)
        self.cube(name,[x+radius*.3,y+radius*1.55,z-.38],[.7,.7,.76],15)
        # A broad warm rivet makes the otherwise dark bomb readable from the front.
        self.cube(name,[x-.45,y-.45,z-radius-.035],[.9,.9,.12],12)

    def save(self):
        write(f'models/entity/pve3_{self.name}_rpg_v1.geo.json',
              {'format_version':'1.21.0','minecraft:geometry':[self.model]})


def arms(rig, width=4, tile=3):
    for side, sign in [('right',-1),('left',1)]:
        center = sign * (4 + width/2)
        rig.cube(side+'Arm',[center-width/2,12,-2],[width,12,4],tile)


def legs(rig, cloth=8):
    for side, x in [('right',-4),('left',0)]:
        rig.cube(side+'Leg',[x,0,-2],[4,12,4],cloth)
        rig.cube(side+'Leg',[x-.1,0,-2.6],[4.2,4,4.7],13)
        rig.cube(side+'Leg',[x-.15,3.5,-2.25],[4.3,.8,4.5],9)


def sawman():
    r = Rig('sawman')
    r.cube('head',[-4,24,-4],[8,8,8],3,front=0)
    r.cube('head',[-4.15,30.6,-4.1],[8.3,1.65,8.3],4)
    r.cube('head',[-4.15,25,3.5],[8.3,6,.75],4)
    for x in [-4.2,3.4]:
        r.cube('head',[x,27,-3],[.8,4,6.7],4)
    r.cube('body',[-4,12,-2],[8,12,4],8)
    # Leather apron, separate straps, belt and buckle create a readable silhouette.
    r.cube('body',[-3.5,13,-2.25],[7,8,.5],9)
    for x in [-3,2]:
        r.cube('body',[x,20,-2.3],[1,4,.55],9)
        r.cube('body',[x,22.8,-2.3],[1,.7,.7],12)
    r.cube('body',[-4.15,12.5,-2.2],[8.3,1.1,4.4],13)
    r.cube('body',[-.8,12.4,-2.5],[1.6,1.3,.5],12)
    arms(r)
    legs(r)
    for side, x in [('right',-8),('left',4)]:
        r.cube(side+'Arm',[x-.1,20,-2.1],[4.2,4.1,4.2],8)
        r.cube(side+'Arm',[x-.12,11.85,-2.12],[4.24,3.65,4.24],13)
        r.cube(side+'Arm',[x-.15,15,-2.15],[4.3,.7,4.3],9)
    frame = r.bone('saw_frame','body',[0,17,-10])
    r.cube(frame,[-3,14,-13.7],[5.3,4.1,5],7)
    r.cube(frame,[-3.3,13.5,-14],[5.9,.7,5.7],10)
    r.cube(frame,[-3.2,15.1,-14],[5.7,1.5,.6],12)
    # Two separate grips end inside the posed gloves, with space between the hands.
    r.cube(frame,[-4.6,16.7,-8.6],[1.2,1.7,2.5],13)
    r.cube(frame,[-4.5,16.8,-11],[1,1,3],11)
    r.cube(frame,[1.2,17.4,-8.5],[1.2,1.6,2.3],13)
    r.cube(frame,[1.25,17,-11.7],[1.1,1.1,3.8],11)
    for z in [-13,-12,-11]:
        r.cube(frame,[-3.36,14.6,z],[.12,2,.3],10)
    blade = r.bone('saw_blade',frame,[.8,16,-16])
    # The disc lies in YZ; non-overlapping strips prevent coplanar surface flicker.
    for j in range(-4,5):
        half = math.sqrt(4.6**2-(abs(j)+.5)**2)
        r.cube(blade,[.35,16-half,-16+j-.5],[.9,2*half,1],11)
    for i in range(12):
        r.cube(blade,[.2,20.1,-16.55],[1.2,1.4,1.4],11,
               turn=[i*30,0,0],pivot=[.8,16,-16])
    for x in [.14,1.26]:
        r.cube(blade,[x,15,-17],[.2,2,2],12)
        # One offset brass mark per face makes rotation visible despite symmetric teeth.
        r.cube(blade,[x,18.3,-14.2],[.2,1.1,.8],12)
        for angle in [0,120,240]:
            r.cube(blade,[x,17,-16.35],[.2,1.9,.7],10,
                   turn=[angle,0,0],pivot=[.8,16,-16])
    # Axle is fixed; only saw_blade rotates.
    r.cube(frame,[-2,15.45,-16.55],[3.8,1.1,1.1],12)
    return r


def bomblet():
    r = Rig('bomblet')
    r.cube('head',[-3.75,24,-3.75],[7.5,7.5,7.5],5,front=1)
    r.cube('body',[-.65,11,-.2],[1.3,13,1.3],5)
    r.cube('body',[-3.2,11,-1.5],[6.4,1.5,3],5)
    for y in [17,19.5,22]:
        r.cube('body',[-3.1,y,-1.7],[6.2,.8,.8],5)
        r.cube('body',[-3.1,y,1],[6.2,.8,.8],5)
        for x in [-3.1,2.3]:
            r.cube('body',[x,y,-1.7],[.8,.8,3.5],5)
    # Red neckerchief, with two little ends on the back.
    r.cube('body',[-2.1,23,-2.1],[4.2,1,4.2],7)
    r.cube('body',[.6,19,1.8],[1.4,4,.5],7)
    for side, sign in [('right',-1),('left',1)]:
        arm = side+'Arm'
        r.cube(arm,[sign*5-1,12,-1],[2,11,2],5)
        r.cube(arm,[sign*5-1.2,11.85,-1.2],[2.4,2.35,2.4],5)
        leg = side+'Leg'
        center = sign*2
        r.cube(leg,[center-.8,1,-.8],[1.6,11,1.6],5)
        r.cube(leg,[center-1.1,5,-1.1],[2.2,1.6,2.2],5)
        r.cube(leg,[center-1.2,0,-2.4],[2.4,1.5,3.5],5)
    r.bomb('carried_bomb','body',[0,15,-6.7],4.5)
    return r


def bomber():
    r = Rig('bomber')
    # Shorten only the upper torso/head: feet and leg pivots still match walking.
    r.bones['head']['pivot'] = [0,22,0]
    r.cube('head',[-4,22,-4],[8,8,8],6,front=2)
    r.cube('head',[-4.4,29.3,-4.2],[8.8,1.6,8.8],8)
    r.cube('head',[-4.4,22,3.7],[8.8,7.5,.8],8)
    for x in [-4.4,3.8]:
        r.cube('head',[x,25,-3.5],[.6,4.8,7.5],8)
    for sign in [-1,1]:
        # Pointed goblin ears outside the hood, visible on both sides.
        r.cube('head',[sign*4.8-1,24.6,-.7],[2,2,1.2],6)
        r.cube('head',[sign*6.1-.4,25.6,-.55],[.8,1.2,.9],6)
    # Goggles on the forehead leave both eyes on the face texture visible.
    r.cube('head',[-4.45,28.5,-4.35],[8.9,.7,.45],13)
    for x in [-3,1]:
        r.cube('head',[x,28,-4.6],[2,1.5,.7],12)
        r.cube('head',[x+.3,28.25,-4.8],[1.4,1,.3],10)
    r.cube('body',[-3.5,12,-2],[7,10,4],8)
    r.cube('body',[-3.7,20.5,-2.2],[7.4,1.5,4.4],7)
    r.cube('body',[-3.6,12,-2.15],[7.2,1.3,4.3],13)
    r.cube('body',[-.7,12,-2.4],[1.4,1.3,.4],12)
    # Diagonal bandolier in discrete blocks, rather than a high-res drawn costume.
    for j in range(5):
        r.cube('body',[-3+j,19.7-j*1.4,-2.25],[1.5,1.8,.5],9)
    legs(r,13)
    arms(r,3,6)
    for side, x in [('right',-7),('left',4)]:
        r.cube(side+'Arm',[x-.1,18,-2.1],[3.2,5,4.2],8)
        r.cube(side+'Arm',[x-.12,11.85,-2.12],[3.24,2.75,4.24],9)
    bag = r.bone('bomb_satchel','body',[0,17,4])
    r.cube(bag,[-4.2,13,2.1],[8.4,7.5,4.8],9)
    r.cube(bag,[-4.4,17.8,2.1],[8.8,3,5.1],13)
    r.cube(bag,[-.8,15.3,6.8],[1.6,3.2,.6],12)
    for x in [-2.5,1.5]:
        r.cube('body',[x,13,2],[1,9,.7],9)
    r.bomb('spare_bomb_back',bag,[0,21.2,5],2.6)
    r.bomb('spare_bomb_hip','body',[4.4,13,1.8],2)
    # Child of the throwing arm, so the held item follows every throwing keyframe.
    r.bomb('throw_bomb','rightArm',[-5.5,10.3,-3],2.3)
    return r


def absolute(rotation):
    return [f'{v} - this' for v in rotation]


def hold(right, left):
    return {'loop':True,'bones':{
        'rightArm':{'rotation':absolute(right),'position':absolute([-5,-2,0])},
        'leftArm':{'rotation':absolute(left),'position':absolute([5,-2,0])},
        'body':{'rotation':absolute([0,0,0]),'position':absolute([0,12,0])}}}


def build():
    clips = {
        'animation.pve3.sawman.hold':hold([-60,-15,0],[-65,30,0]),
        'animation.pve3.bomblet.hold':hold([-45,-12,0],[-45,12,0]),
        'animation.pve3.bomber.hold':hold([-55,0,-8],[-10,0,5]),
        'animation.pve3.sawman.spin':{'loop':True,'animation_length':.5,
            'bones':{'saw_blade':{'rotation':{'0.0':[0,0,0],'0.5':[360,0,0]}}}},
        'animation.pve3.bomber.throw':{'animation_length':.5,'loop':True,
            'anim_time_update':"(10 - q.property('pve_v3:swing')) * 0.05",'bones':{
            'rightArm':{'rotation':{'0.0':absolute([-105,0,-8]),
                '0.12':absolute([-35,0,-8]),'0.28':absolute([-15,0,-8]),
                '0.5':absolute([-55,0,-8])}},
            'throw_bomb':{'scale':{'0.0':[0,0,0],
                '0.32':{'pre':[0,0,0],'post':[1,1,1]},'0.5':[1,1,1]}}}}
    }
    write('animations/pve3_saw_bomb.animation.json',{'format_version':'1.8.0','animations':clips})
    write('animation_controllers/pve3_bomber.ac.json',{'format_version':'1.10.0',
        'animation_controllers':{'controller.animation.pve3.bomber_throw':{
            'initial_state':'ready','states':{
                'ready':{'transitions':[{'throwing':"q.property('pve_v3:swing') > 0"}]},
                'throwing':{'animations':['rpg_throw'],'transitions':[
                    {'ready':"q.property('pve_v3:swing') <= 0"}]}
            }}}})
    for r in [sawman(),bomblet(),bomber()]:
        r.save()
        path = f'entity/{r.name}.entity.json'
        doc = json.loads((RP/path).read_text())
        desc = doc['minecraft:client_entity']['description']
        desc['geometry']['default'] = r.model['description']['identifier']
        desc['textures']['default'] = 'textures/entity/pve3/saw_bomb_rpg_v1'
        desc['animations']['rpg_hold'] = f'animation.pve3.{r.name}.hold'
        extra = ['rpg_hold']
        if r.name == 'sawman':
            desc['animations']['rpg_spin'] = 'animation.pve3.sawman.spin'
            extra.append('rpg_spin')
        if r.name == 'bomber':
            desc['animations']['rpg_throw'] = 'animation.pve3.bomber.throw'
            desc['animations']['rpg_throw_controller'] = 'controller.animation.pve3.bomber_throw'
            extra.append('rpg_throw_controller')
        # Apply after vanilla arm/body movement: the held weapons stay in the grip.
        animate = desc['scripts']['animate']
        desc['scripts']['animate'] = [a for a in animate if a not in extra] + extra
        write(path,doc)
        print(r.name, len(r.model['bones']), 'bones,',
              sum(len(b.get('cubes',[])) for b in r.model['bones']), 'cubes')


if __name__ == '__main__':
    build()
