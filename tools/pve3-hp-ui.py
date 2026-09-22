"""Build the code-drawn hunting HUD and preview the exact shipped textures (spec/39)."""
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RP = ROOT / 'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3'
OUT = ROOT / 'out/hp-ui'
TEXTURES = RP / 'textures/ui/pve3_hp'
W, H = 120, 14
FILL = (18, 3, 96, 8)


def assets():
    TEXTURES.mkdir(parents=True, exist_ok=True)
    frame = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(frame)
    # A thin bevel and pointed end. Everything outside the silhouette stays transparent.
    d.polygon([(12, 0), (113, 0), (119, 6), (119, 7), (113, 13), (12, 13)], fill='#15191c')
    d.polygon([(14, 1), (112, 1), (117, 6), (117, 7), (112, 12), (14, 12)], fill='#8d8163')
    d.line([(15, 1), (112, 1), (115, 4)], fill='#e1d2a3')
    d.line([(15, 12), (112, 12), (115, 9)], fill='#534935')
    d.rectangle((17, 2, 114, 11), fill='#2b2023')
    d.rectangle((18, 3, 113, 10), fill=(0, 0, 0, 0))
    # Small notches, placed outside the numeric field.
    for x in (39, 63, 87):
        d.point((x, 1), fill='#544d3e')
        d.point((x, 12), fill='#d1bd87')
    d.polygon([(8, 0), (16, 5), (16, 8), (8, 13), (0, 8), (0, 5)], fill='#15191c')
    d.polygon([(8, 1), (15, 5), (15, 8), (8, 12), (1, 8), (1, 5)], fill='#ae9c71')
    d.polygon([(8, 2), (13, 5), (13, 8), (8, 11), (3, 8), (3, 5)], fill='#413339')
    d.polygon([(5, 4), (7, 4), (8, 5), (9, 4), (11, 4), (12, 5), (12, 7), (8, 10), (4, 7), (4, 5)], fill='#df4248')
    d.line([(5, 5), (6, 5)], fill='#ffada0')
    frame.save(TEXTURES / 'frame.png')
    for name, rows in {
        'fill': ['#f28271', '#e75652', '#dc4448', '#d23b41', '#c7323a', '#c02c35', '#b32833', '#a82330', '#97222d', '#781e29'],
        'empty': ['#1c171d', '#231c23', '#281e26', '#2e222a', '#32232b', '#32232b', '#302129', '#2a1d25', '#251b22', '#1c171d'],
    }.items():
        rows = [rows[i] for i in (0, 1, 2, 4, 5, 6, 8, 9)]
        img = Image.new('RGBA', (96, 8))
        pen = ImageDraw.Draw(img)
        for y, color in enumerate(rows):
            pen.line((0, y, 95, y), fill=color)
        img.save(TEXTURES / f'{name}.png')
        if name == 'fill':
            frames = TEXTURES / 'frames'
            frames.mkdir(exist_ok=True)
            for width in range(97):
                variant = Image.new('RGBA', img.size)
                if width:
                    variant.paste(img.crop((0, 0, width, 8)), (0, 0))
                variant.save(frames / f'f{width:02d}.png')
                loaded = Image.open(frames / f'f{width:02d}.png')
                assert loaded.getchannel('A').getbbox() == ((0, 0, width, 8) if width else None)


def binding(expression, target):
    return {'binding_type': 'view', 'source_property_name': expression, 'target_property_name': target}


def ui():
    dest = RP / 'ui/hud_screen.json'
    doc = json.loads(dest.read_text(encoding='utf-8'))
    title = {'binding_name': '#hud_title_text_string', 'binding_type': 'global'}
    payload = "(#hud_title_text_string - 'pve3:hp:')"
    subtitle = {'binding_name': '#hud_subtitle_text_string', 'binding_type': 'global'}
    money = "(#hud_subtitle_text_string - 'pve3:money:')"

    def sprite(name, layer, size, offset):
        return {'type': 'image', 'texture': f'textures/ui/pve3_hp/{name}', 'size': size,
                'offset': offset, 'layer': layer, 'anchor_from': 'top_left', 'anchor_to': 'top_left'}

    empty = sprite('empty', 0, [96, 8], [18, 3])
    fill = sprite('fill', 1, [96, 8], [18, 3])
    texture = "('textures/ui/pve3_hp/frames/' + ('%.3s' * " + money + "))"
    fill.update({'texture': '#texture', 'bindings': [subtitle, binding(texture, '#texture')]})
    number = {'type': 'label', 'layer': 3, 'text': '#text', 'text_alignment': 'center',
              'color': [1, 0.97, 0.91], 'shadow': True, 'localize': False,
              'font_size': 'normal', 'font_scale_factor': 1.0,
              'size': [96, 'default'], 'offset': [6, 0], 'anchor_from': 'center', 'anchor_to': 'center',
              'bindings': [title, binding(payload, '#text')]}
    doc['pve3_hp_label'] = {'type': 'panel', 'size': [W, H], 'layer': 20,
                          'bindings': [title, binding("(not ((#hud_title_text_string - 'pve3:hp:') = #hud_title_text_string))", '#visible')],
                          'controls': [{'empty': empty}, {'fill': fill},
                                       {'frame': sprite('frame', 2, [W, H], [0, 0])}, {'number': number}]}
    for parent in ('centered_gui_elements_at_bottom_middle', 'centered_gui_elements_at_bottom_middle_touch'):
        controls = doc[parent]['modifications'][0]['value']
        controls[0]['pve3_hp@hud.pve3_hp_label']['offset'] = [-1, -40]
        controls[1]['pve3_money@hud.pve3_money']['offset'] = [1, -40]
    doc['pve3_money']['size'] = [58, 14]
    doc['pve3_money']['controls'][1]['space']['size'] = [2, 14]
    money_display = f"({money} - ('%.12s' * {money}))"
    labels = []
    for tag, limit, scale in [('K', 7, 1.0), ('L', 10, 0.71875), ('M', 14, 0.5), ('N', 21, 0.34375)]:
        visible = f"(not ((#hud_subtitle_text_string - '{tag}') = #hud_subtitle_text_string))"
        labels.append({f'digits_{limit}': {
            'type': 'label', 'size': [44, 'default'], 'text': '#text', 'text_alignment': 'right',
            'anchor_from': 'right_middle', 'anchor_to': 'right_middle',
            'localize': False, 'shadow': True, 'color': [0.33, 1, 0.33],
            'font_size': 'normal', 'font_scale_factor': scale,
            'bindings': [subtitle, binding(money_display, '#text'), binding(visible, '#visible')],
        }})
    doc['pve3_money']['controls'][2] = {'amount': {'type': 'panel', 'size': [44, 14], 'controls': labels}}
    dest.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


# Small deterministic bitmap digits for the offline preview. Game uses its own font.
DIGITS = {
    '0': ['01110','11001','10101','10011','10001','10001','01110'],
    '1': ['00100','01100','00100','00100','00100','00100','01110'],
    '2': ['01110','10001','00001','00010','00100','01000','11111'],
    '3': ['11110','00001','00001','01110','00001','00001','11110'],
    '4': ['00010','00110','01010','10010','11111','00010','00010'],
    '5': ['11111','10000','10000','11110','00001','00001','11110'],
    '6': ['01110','10000','10000','11110','10001','10001','01110'],
    '7': ['11111','00001','00010','00100','01000','01000','01000'],
    '8': ['01110','10001','10001','01110','10001','10001','01110'],
    '9': ['01110','10001','10001','01111','00001','00001','01110'],
    '/': ['00001','00001','00010','00100','01000','10000','10000'],
    ',': ['00','00','00','00','00','01','10'],
}


def evaluate(expression, values):
    """Evaluate the binding subset used here, including clip subtraction and %.Ns."""
    s = expression.strip()
    if s.startswith('(') and s.endswith(')'):
        depth, quoted, closes = 0, False, -1
        for i, c in enumerate(s):
            if c == "'": quoted = not quoted
            if quoted: continue
            if c == '(': depth += 1
            if c == ')':
                depth -= 1
                if depth == 0:
                    closes = i
                    break
        if closes == len(s) - 1:
            return evaluate(s[1:-1], values)
    if s.startswith('not '): return not evaluate(s[4:], values)
    for operators in ('=', '+-', '*/'):
        depth, quoted = 0, False
        for i in range(len(s) - 1, -1, -1):
            c = s[i]
            if c == "'": quoted = not quoted
            if quoted: continue
            if c == ')': depth += 1
            elif c == '(': depth -= 1
            elif depth == 0 and c in operators:
                a, b = evaluate(s[:i], values), evaluate(s[i + 1:], values)
                if c == '=': return a == b
                if c == '-' and isinstance(a, str) and isinstance(b, str): return a.replace(b, '')
                if c == '*' and isinstance(a, str) and re.fullmatch(r'%\.\d+s', a):
                    return b.encode()[:int(a[2:-1])].decode()
                if c == '-': return float(a) - float(b)
                if c == '/': return float(a) / float(b)
                if c == '*': return float(a) * float(b)
                return a + b if isinstance(a, str) and isinstance(b, str) else float(a) + float(b)
    if s.startswith("'"): return s[1:-1]
    if s.startswith('#'): return values[s]
    return float(s)


def preview():
    OUT.mkdir(parents=True, exist_ok=True)
    doc = json.loads((RP / 'ui/hud_screen.json').read_text(encoding='utf-8'))
    controls = {k: v for entry in doc['pve3_hp_label']['controls'] for k, v in entry.items()}
    sheet = Image.new('RGB', (720, 820), '#11171b')
    pen = ImageDraw.Draw(sheet)
    font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 15)
    pen.text((42, 25), 'PVE  /  HUNTER HEALTH', font=font, fill='#d9c898')
    for row, (hp, cap, label) in enumerate([(200, 200, 'FULL'), (100, 200, 'HALF'), (15, 200, 'LOW'), (0, 200, 'DOWN'), (1750, 2100, '4 DIGITS')]):
        filled = max(1, int(96 * hp / cap + 0.5)) if hp > 0 else 0
        values = {'#hud_title_text_string': f'pve3:hp:§f{hp}/{cap}',
                  '#hud_subtitle_text_string': f'pve3:money:f{filled:02d}_______K:§a8'}
        canvas = Image.new('RGBA', (W, H))
        for key in ('empty', 'fill', 'frame'):
            c = controls[key]
            texture = evaluate(c['bindings'][1]['source_property_name'], values) if key == 'fill' else c['texture']
            img = Image.open(RP / (texture + '.png')).convert('RGBA')
            if key == 'fill':
                assert img.getchannel('A').getbbox() == ((0, 0, filled, 8) if filled else None)
            canvas.alpha_composite(img, tuple(c['offset']))
        text = evaluate(controls['number']['bindings'][1]['source_property_name'], values)
        assert text.startswith('§f')
        text = text.removeprefix('§f')
        assert text == f'{hp}/{cap}'
        layer = Image.new('RGBA', (len(text) * 6, 8))
        p = ImageDraw.Draw(layer)
        for i, char in enumerate(text):
            for y, bits in enumerate(DIGITS[char]):
                for x, bit in enumerate(bits):
                    if bit == '1':
                        p.point((i * 6 + x + 1, y + 1), fill='#35171c')
        for i, char in enumerate(text):
            for y, bits in enumerate(DIGITS[char]):
                for x, bit in enumerate(bits):
                    if bit == '1':
                        p.point((i * 6 + x, y), fill='#fff7e8')
        canvas.alpha_composite(layer, (18 + (96 - layer.width) // 2, 3))
        canvas.save(OUT / f'hp-{hp}-{cap}.png')
        y = 70 + row * 138
        pen.text((42, y + 23), label, font=font, fill='#8d9a9b')
        whole = Image.new('RGBA', (182, 40))
        whole.alpha_composite(canvas)
        emerald = Image.open(ROOT / 'bedrock-samples/resource_pack/textures/items/emerald.png').convert('RGBA').resize((12, 12), Image.Resampling.NEAREST)
        whole.alpha_composite(emerald, (124, 1))
        p = ImageDraw.Draw(whole)
        for dy, bits in enumerate(DIGITS['8']):
            for dx, bit in enumerate(bits):
                if bit == '1': p.point((176 + dx, 3 + dy), fill='#55ff55')
        # Layout guide for the vanilla hotbar: aligned outer edges and a 4px gap.
        p.rectangle((0, 18, 181, 39), fill='#292d2e', outline='#999d99')
        for x in range(1, 180, 20): p.rectangle((x, 19, x + 19, 38), outline='#555a57')
        big = whole.resize((546, 120), Image.Resampling.NEAREST)
        # Space the five rows more generously when showing the hotbar guide.
        y = 70 + row * 138
        sheet.paste(big, (150, y), big)
    pen.text((42, 790), '3x / shipped textures + binding / approximate font & hotbar', font=font, fill='#788589')
    sheet.save(OUT / 'preview.png')
    print(OUT / 'preview.png')
    money_sheet = Image.new('RGB', (720, 660), '#11171b')
    pen = ImageDraw.Draw(money_sheet)
    pen.text((35, 18), 'CURRENCY / fixed right edge / no HP overlap', font=font, fill='#d9c898')
    tiers = [next(iter(c.items())) for c in doc['pve3_money']['controls'][2]['amount']['controls']]
    for row, amount in enumerate([8, 1000, 999999, 1234567, 9999999999, 9007199254740991]):
        text = f'{amount:,}'
        label = next(c for name, c in tiers if len(text) <= int(name.split('_')[1]))
        glyph = Image.new('RGBA', (len(text) * 6, 8))
        draw = ImageDraw.Draw(glyph)
        for i, char in enumerate(text):
            for y, bits in enumerate(DIGITS[char]):
                for x, bit in enumerate(bits):
                    if bit == '1': draw.point((i * 6 + x, y), fill='#55ff55')
        factor = label['font_scale_factor']
        glyph = glyph.resize((round(glyph.width * factor * 3), max(1, round(8 * factor * 3))), Image.Resampling.NEAREST)
        assert glyph.width <= 44 * 3
        line = Image.new('RGBA', (182, 18))
        line.alpha_composite(Image.open(OUT / 'hp-200-200.png'))
        line.alpha_composite(emerald, (124, 1))
        y = 60 + row * 96
        pen.text((35, y), text, font=font, fill='#819291')
        enlarged = line.resize((546, 54), Image.Resampling.NEAREST)
        enlarged.alpha_composite(glyph, (546 - glyph.width, (42 - glyph.height) // 2))
        money_sheet.paste(enlarged, (150, y + 23), enlarged)
    money_sheet.save(OUT / 'currency-preview.png')


if __name__ == '__main__':
    assets()
    ui()
    preview()
