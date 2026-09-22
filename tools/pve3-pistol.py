"""カウボーイの拳銃模型。spec/30-cowboy-pistol.md。構えは既存アニメを参照。"""
import importlib.util
from pathlib import Path

path=Path(__file__).with_name('pve3-gunrig.py')
spec=importlib.util.spec_from_file_location('gunrig',path)
gunrig=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gunrig)

if __name__=='__main__':
    gunrig.geometry(texture_path='textures/items/pve3_pistol.png',
                    output='models/entity/pve3_pistol.geo.json',identifier='geometry.pve3.pistol',
                    grip=(53,38),pixel=.14,pixel_rotation=0)
    gunrig.pistol_pose()
