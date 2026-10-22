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
    custom = body.get('customCategory')
    matching = [c for c in module.GROUPS[category_group] if c.name == category_name]
    if isinstance(custom, dict):
        name = str(custom.get('name') or '')
        if name != category_name or len(name) > 100:
            raise ValueError('Definição de categoria inválida.')
        kind = str(custom.get('kind') or '')
        value = str(custom.get('id') or '')
        media = str(custom.get('media') or '')
        if media not in ('movie', 'tv') or len(value) > 20:
            raise ValueError('Categoria TMDB inválida.')
        if kind in ('genre', 'keyword', 'provider', 'company') and not (value.isascii() and value.isdigit() and 0 < int(value) < 999999999):
            raise ValueError('ID TMDB inválido.')
        if kind == 'genre' and category_group == 'generos':
            extra, genre_id = {}, int(value)
        elif kind == 'keyword' and category_group in ('temas', 'generos'):
            extra, genre_id = {'with_keywords': value}, None
        elif kind == 'provider' and category_group == 'streaming':
            extra, genre_id = {'with_watch_providers': value, 'watch_region': 'BR', 'with_watch_monetization_types': 'flatrate'}, None
        elif kind == 'company' and category_group == 'estudios':
            extra, genre_id = {'with_companies': value}, None
        elif kind == 'country' and category_group == 'mundo' and len(value) == 2 and value.isascii() and value.isalpha():
            extra, genre_id = {'with_origin_country': value.upper()}, None
        elif kind == 'decade' and category_group == 'decadas' and value.isdigit() and 1880 <= int(value) <= 2090 and int(value) % 10 == 0:
            extra, genre_id = {'primary_release_date.gte': f'{value}-01-01',
                               'primary_release_date.lte': f'{int(value)+9}-12-31'}, None
        else:
            raise ValueError('Tipo de categoria incompatível.')
        category = module.Category(name, media, genre_id, (52, 117, 162), extra)
    else:
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
    entries = module.choose(client.discover(category, 5 if custom else 3, 5 if custom else 150), count, set(), rng)
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
