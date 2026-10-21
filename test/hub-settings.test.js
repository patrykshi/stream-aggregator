import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nuvio-integrations-test-'));
const previous=process.env.DATA_DIR;
process.env.DATA_DIR=dir;
const {getIntegrationKey,integrationStatuses,updateIntegrationSettings}=
 await import('../src/config/hub-integrations.js?isolated=20261019');
describe('Configurações locais do Nuvio Hub',()=>{
 it('não cria arquivo de segredos por apenas consultar estado',()=>{
  const s=integrationStatuses();
  assert.equal(s.tmdb.configured,Boolean(process.env.TMDB_API_KEY));
  assert.ok(!fs.existsSync(path.join(dir,'hub-integrations.json')));
  assert.ok(!JSON.stringify(s).includes('API_KEY'));
 });
 it('salva com atomicidade e permissões restritas sem retornar o valor',()=>{
  const secret='test-secret-not-production-key';
  const result=updateIntegrationSettings({tmdb:{value:secret}});
  assert.equal(result.tmdb.configured,true);
  assert.equal(result.tmdb.origin,'local');
  assert.equal(getIntegrationKey('tmdb'),secret);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(fs.statSync(path.join(dir,'hub-integrations.json')).mode&0o777,0o600);
 });
 it('mantém outras integrações, rejeita valores e remoção remove apenas a selecionada',()=>{
  updateIntegrationSettings({trakt:{value:'client-test-only'}});
  for(const candidate of [null,{tmdb:{value:''}},{tmdb:{value:'abc'}},
   {unknown:{value:'abcdefghi'}},{tmdb:{clear:true,value:'do-not-write'}},
   {trakt:{value:'bad password'}}])
   assert.throws(()=>updateIntegrationSettings(candidate));
  assert.equal(getIntegrationKey('tmdb'),'test-secret-not-production-key');
  const res=updateIntegrationSettings({tmdb:{clear:true}});
  assert.equal(res.tmdb.origin,process.env.TMDB_API_KEY?'ambiente':'ausente');
  assert.equal(res.trakt.configured,true);
 });
});
process.env.DATA_DIR=previous;
fs.rmSync(dir,{recursive:true,force:true});
