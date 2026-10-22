#!/usr/bin/env python3
"""Call the *existing* read-only gerar_mosaicos.py from the user's PC.
This is only an adapter: selection/discovery and diagonal mosaic renderer are original.
"""
from __future__ import annotations
import base64
import importlib.util
import json
import os
from pathlib import Path
import random
import sys
import tempfile

SOURCE = Path(os.environ.get('PYTHON_MOSAIC_SOURCE', '/app/python-mosaic-source'))


def original():
    script = SOURCE / 'gerar_mosaicos.py'
    if not script.is_file():
        raise FileNotFoundError('O gerador original de mosaicos do PC não foi encontrado.')
    spec = importlib.util.spec_from_file_location('nuvio_original_tmdb_mosaics', script)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def categories(module):
    return {group: [{'name': cat.name, 'media': cat.media} for cat in values]
            for group, values in module.GROUPS.items()}


def make(module, body):
    category_group = str(body.get('group') or 'generos')
    if category_group not in module.GROUPS:
        raise ValueError('Grupo não cadastrado no criador TMDB original.')
    category_name = str(body.get('category') or '')
    matching = [c for c in module.GROUPS[category_group] if c.name == category_name]
    if len(matching) != 1:
        raise ValueError('Categoria não cadastrada no criador TMDB original.')
    category = matching[0]
    key = str(body.get('tmdbKey') or '')
    if not key or len(key) > 512:
        raise ValueError('A chave TMDB precisa estar cadastrada em Configurações.')
    count = int(body.get('cards') or 16)
    if count not in (12, 16, 20, 28):
        raise ValueError('Quantidade de cartões inválida.')
    client = module.TMDB(key, 'pt-BR', 'BR')
    rng = random.Random(20260920 + sum(map(ord, category_name)))
    entries = module.choose(client.discover(category, 3, 150), count, set(), rng)
    if len(entries) < 8:
        raise RuntimeError('O TMDB encontrou menos de oito fundos nessa categoria.')
    config = {'width': 1920, 'height': 1080, 'jpeg_quality': 88,
              'add_category_title': False}
    with tempfile.TemporaryDirectory(prefix='nuvio-mosaico-') as directory:
        root = Path(directory)
        pictures = []
        for item in entries:
            try:
                image_path = item['backdrop_path']
                if not isinstance(image_path, str) or not image_path.startswith('/'):
                    continue
                target = root / f"backdrop-{int(item['id'])}.jpg"
                client.download(image_path, 'w780', target)
                if 200 < target.stat().st_size <= 10 * 1024 * 1024:
                    pictures.append(target)
            except Exception:
                # A imagem isolada pode falhar sem comprometer as demais.
                continue
        if len(pictures) < 8:
            raise RuntimeError('Não foi possível carregar oito backdrops do TMDB.')
        rendered = root / 'mosaico.jpg'
        module.make_mosaic(pictures, category, config, rendered, rng)
        jpeg = rendered.read_bytes()
        if not 1000 < len(jpeg) <= 9_000_000:
            raise RuntimeError('Tamanho de mosaico inválido.')
        return {'data': base64.b64encode(jpeg).decode('ascii'),
                'category': category_name, 'cards': len(pictures),
                'source': 'tmdb-original-python'}


def main():
    body = json.load(sys.stdin)
    module = original()
    if body.get('operation') == 'list':
        result = {'groups': categories(module), 'source': 'tmdb-original-python'}
    else:
        result = make(module, body)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Deliberately never echo raw requests URLs or API key into server logs.
        sys.stderr.write(f'Mosaico TMDB: {type(exc).__name__}\n')
        raise SystemExit(1)
