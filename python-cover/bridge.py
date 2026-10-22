#!/usr/bin/env python3
"""Adaptador mínimo do renderizador Python já instalado (não altera o projeto original).
Recebe JSON por stdin e devolve apenas PNG/JPEG em base64; sem URLs, rede ou shell.
"""
import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(os.environ.get('PYTHON_COVER_SOURCE', '/app/python-legacy'))
SCRIPT = ROOT / 'render.py'


def create(payload):
    if not SCRIPT.is_file():
        raise RuntimeError('Criador de capas Python não localizado. Configure PYTHON_COVER_PATH.')
    shape = payload.get('shape', 'POSTER')
    sizes = {'POSTER': (600, 900), 'PORTRAIT': (750, 1000), 'SQUARE': (800, 800),
             'LANDSCAPE': (1280, 720), 'BACKDROP': (1920, 1080)}
    width, height = sizes.get(shape, sizes['POSTER'])
    background_data = payload.get('background', '')
    if background_data:
        raw = base64.b64decode(background_data, validate=True)
        if len(raw) > 10 * 1024 * 1024:
            raise ValueError('Imagem de fundo excede 10 MB')
        image = Image.open(io.BytesIO(raw))
        image.load()
    else:
        image = Image.new('RGB', (width, height), (19, 25, 39))
    if image.width * image.height > 45_000_000:
        raise ValueError('Resolução de entrada inválida')
    spec = importlib.util.spec_from_file_location('nuvio_existing_python_cover', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    title = str(payload.get('title') or '')[:75]
    color = str(payload.get('titleColor') or '#d4ab54')
    if not (len(color) == 7 and color.startswith('#') and all(c in '0123456789abcdefABCDEF' for c in color[1:])):
        color = '#d4ab54'
    config = {'width':width,'height':height,'title_color':color,
              'title_font_size':int(payload.get('fontSize') or 95),
              'title_letter_spacing':int(payload.get('letterSpacing') or 12),
              'show_divider':bool(payload.get('showDivider',True)),
              'show_icon':False, 'dark_gradient_height':0.53,
              'dark_gradient_opacity':0.88}
    config['title_font_size'] = max(24, min(180, config['title_font_size']))
    config['title_letter_spacing'] = max(0, min(24, config['title_letter_spacing']))
    output = module.render_poster(image, title, config)
    buffer = io.BytesIO()
    output.save(buffer, 'JPEG', quality=89)
    return base64.b64encode(buffer.getvalue()).decode('ascii')


if __name__ == '__main__':
    try:
        payload = json.load(sys.stdin)
        result = create(payload)
        sys.stdout.write(json.dumps({'data': result}))
    except Exception as exc:
        sys.stderr.write(f'Python cover bridge failed: {type(exc).__name__}: {exc}\n')
        raise SystemExit(1)
