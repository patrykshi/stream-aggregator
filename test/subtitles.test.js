import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLang } from '../src/aggregator/subtitles.js';

describe('Subtitles Module', () => {
  it('deve normalizar variações de idiomas corretamente', () => {
    assert.equal(normalizeLang('pob'), 'pob');
    assert.equal(normalizeLang('pt-br'), 'pob');
    assert.equal(normalizeLang('Portuguese (Brazil)'), 'pob');
    assert.equal(normalizeLang('Brazilian'), 'pob');
    assert.equal(normalizeLang('pt'), 'por');
    assert.equal(normalizeLang('por'), 'por');
    assert.equal(normalizeLang('en'), 'eng');
    assert.equal(normalizeLang('eng'), 'eng');
    assert.equal(normalizeLang('spa'), 'spa');
    assert.equal(normalizeLang('es'), 'spa');
    assert.equal(normalizeLang('unknown_lang'), 'unknown_lang');
  });
});

