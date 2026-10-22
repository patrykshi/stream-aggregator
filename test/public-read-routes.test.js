import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicReadRoute } from '../src/config/public-read-routes.js';

describe('Ingress público isolado da edição local', () => {
  it('permite recursos de reprodução e coleções necessárias ao Nuvio', () => {
    for (const path of ['/health','/manifest.json','/collections.json',
      '/stream/movie/tt1234567.json','/catalog/movie/trending/skip=100.json',
      '/subtitles/series/tt1234567:1:1.json','/meta/movie/tt1234567.json',
      '/p/main/manifest.json','/p/main/collections.json','/p/main/catalog/movie/id.json',
      '/api/hub/collections.json','/api/catalog-bridge/collections.json',
      '/api/hub/artwork/poster/hash.webp','/api/hub/artwork/studio/art.webp',
      '/artwork/erdb/poster/movie/tt1234567/signature.jpg']) {
      assert.equal(isPublicReadRoute('GET',path),true,path);
    }
  });
  it('nunca expõe endpoints administrativos por qualquer método', () => {
    for (const path of ['/', '/configure','/api/profiles/main','/api/hub/workspace',
      '/api/hub/settings','/api/hub/access','/api/hub/addons','/api/nuvio-studio/providers',
      '/api/hub/preview/catalog-items','/api/hub/artwork/save']) {
      assert.equal(isPublicReadRoute('GET',path),false,path);
    }
    for (const path of ['/manifest.json','/stream/movie/tt1234567.json','/api/hub/workspace']) {
      assert.equal(isPublicReadRoute('POST',path),false,path);
      assert.equal(isPublicReadRoute('PUT',path),false,path);
      assert.equal(isPublicReadRoute('DELETE',path),false,path);
    }
  });
});
