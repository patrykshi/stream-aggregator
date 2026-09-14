import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listProfiles, getProfile, getProfileConfig, saveProfile, deleteProfile } from '../src/config/profiles.js';

describe('Profiles Module', () => {
  it('deve listar perfis e conter o perfil main por padrão', () => {
    const profiles = listProfiles();
    assert.ok(Array.isArray(profiles));
    assert.ok(profiles.some(p => p.id === 'main'));
  });

  it('deve obter a configuração do perfil main', () => {
    const config = getProfileConfig('main');
    assert.ok(config);
    assert.ok(Array.isArray(config.addons));
    assert.ok(Array.isArray(config.nuvioCollections));
  });

  it('deve salvar e carregar um perfil customizado (ex: quarto)', () => {
    const customConfig = {
      addons: [
        { name: 'Torrentio', url: 'https://torrentio.strem.fun/manifest.json', enabled: true }
      ],
      filters: {
        resolutions: ['1080p'],
        removeCams: true
      },
      nuvioCollections: []
    };

    const saved = saveProfile('quarto', { name: 'Quarto do Casal', config: customConfig });
    assert.equal(saved.id, 'quarto');
    assert.equal(saved.name, 'Quarto do Casal');

    const loaded = getProfile('quarto');
    assert.ok(loaded);
    assert.equal(loaded.name, 'Quarto do Casal');
    assert.equal(loaded.config.addons.length, 1);
    assert.equal(loaded.config.addons[0].name, 'Torrentio');
  });

  it('não deve permitir excluir o perfil principal main', () => {
    const result = deleteProfile('main');
    assert.equal(result.success, false);
  });

  it('deve permitir excluir perfis customizados', () => {
    const result = deleteProfile('quarto');
    assert.equal(result.success, true);
    assert.equal(getProfile('quarto'), null);
  });
});

