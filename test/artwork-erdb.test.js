import {describe,it,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nuvio-erdb-test-'));
const prior=process.env.DATA_DIR;
process.env.DATA_DIR=dir;
const {saveErdbSettings,erdbStatus,erdbConfig}=
 await import('../src/config/hub-artwork-erdb.js?isolated=erdbtest');
const {decorateCatalogResponse,decorateMetaResponse,makeErdbImage}=
 await import('../src/aggregator/artwork-erdb.js');
const TOKEN='Tk-test-1234567890123456';
const OFF={enabled:false,token:TOKEN,baseUrl:'https://easyratingsdb.com',poster:true,
 backdrop:true,logo:true,thumbnail:true};
const ON={...OFF,enabled:true};
describe('Capas ERDB opcionais sem alterar os catálogos do Nuvio',()=>{
 it('padrão desligado e GET sem token',()=>{
  assert.equal(erdbStatus().configured,false);
  assert.equal(erdbStatus().enabled,false);
  assert.ok(!JSON.stringify(erdbStatus()).includes(TOKEN));
  assert.equal(decorateCatalogResponse({metas:[{id:'tt0133093',name:'Original',type:'movie',poster:'https://example.com/p.jpg'}]},'movie',OFF).metas[0].poster,'https://example.com/p.jpg');
 });
 it('valida token, URL, tipo, e grava localmente com permissão 0600',()=>{
  assert.throws(()=>saveErdbSettings({enabled:true}),/token/);
  assert.throws(()=>saveErdbSettings({token:'bad',enabled:true}),/Tk-/);
  assert.throws(()=>saveErdbSettings({baseUrl:'http://127.0.0.1:3000'}),/HTTPS/);
  assert.throws(()=>saveErdbSettings({baseUrl:'https://erdb.example/?evil=1'}),/HTTPS/);
  const status=saveErdbSettings({enabled:true,token:TOKEN,
   baseUrl:'https://easyratingsdb.com/',poster:true,backdrop:false,logo:false,thumbnail:false});
  assert.equal(status.enabled,true);
  assert.equal(status.configured,true);
  assert.ok(!JSON.stringify(status).includes(TOKEN));
  const filename=path.join(dir,'hub-artwork-erdb.json');
  assert.equal(fs.statSync(filename).mode&0o777,0o600);
  assert.equal(erdbConfig().token,TOKEN);
  assert.equal(status.baseUrl,'https://easyratingsdb.com');
 });
 it('monta URL canônica IMDb e TMDB sem reescrever os IDs',()=>{
  assert.equal(makeErdbImage(ON,'poster','movie','tt0133093'),
   'https://easyratingsdb.com/'+TOKEN+'/poster/movie/tt0133093.jpg');
  assert.equal(makeErdbImage(ON,'backdrop','series','tmdb:1399'),
   'https://easyratingsdb.com/'+TOKEN+'/backdrop/series/tmdb%3A1399.jpg');
  assert.equal(makeErdbImage(ON,'poster','movie','tmdb:603','landscape'),
   'https://easyratingsdb.com/'+TOKEN+'/poster/movie/tmdb%3A603.jpg?shape=landscape');
 });
 it('prefere IMDb no catálogo e mantém outras propriedades e conteúdo original',()=>{
  const original={metas:[{id:'external_custom',imdb_id:'tt0133093',
    type:'movie',name:'Teste',poster:'https://source/poster.jpg',background:'https://source/backdrop.jpg',
    logo:'https://source/logo.png',customValue:'retained'}],cursor:'skip=100'};
  const snapshot=structuredClone(original);
  const result=decorateCatalogResponse(original,'movie',ON);
  assert.ok(result.metas[0].poster.includes('/poster/movie/tt0133093/'));
  assert.ok(result.metas[0].background.includes('/backdrop/movie/tt0133093/'));
  assert.ok(result.metas[0].logo.includes('/logo/movie/tt0133093/'));
  assert.equal(result.metas[0].id,'external_custom');
  assert.equal(result.cursor,'skip=100');
  assert.equal(result.metas[0].customValue,'retained');
  assert.deepEqual(original,snapshot);
 });
 it('URLs publicadas apontam ao proxy assinado e nunca incluem o token',()=>{
  const r=decorateCatalogResponse({metas:[{id:'tt0133093',type:'movie',
   poster:'https://original.example/img.jpg'}]},'movie',ON);
  assert.ok(r.metas[0].poster.startsWith('https://stream.patrykrocha.com/artwork/erdb/poster/movie/'));
  assert.ok(!r.metas[0].poster.includes(TOKEN));
 });
 it('títulos sem ID compatível mantêm a capa original, incluindo fontes sem tipo interno',()=>{
  const original={metas:[
   {id:'source_specific_001',name:'Sem ID',poster:'https://orig.jpg'},
   {id:'tmdb:99',name:'TMDB',poster:'https://poster.jpg'}
  ]};
  const result=decorateCatalogResponse(original,'series',ON);
  assert.equal(result.metas[0].poster,'https://orig.jpg');
  assert.ok(result.metas[1].poster.includes('/poster/series/tmdb%3A99/'));
  assert.equal(decorateCatalogResponse(original,'series',OFF),original);
 });
 it('respeita toggles e mantém metadados originais intactos',()=>{
  const config={...ON,backdrop:false,logo:false};
  const x={meta:{id:'tt0944947',type:'series',poster:'https://img/p.jpg',
   background:'https://img/b.jpg',logo:'https://img/logo.png'}};
  const out=decorateMetaResponse(x,'series',config);
  assert.ok(out.meta.poster.includes('/poster/series/tt0944947/'));
  assert.equal(out.meta.background,'https://img/b.jpg');
  assert.equal(out.meta.logo,'https://img/logo.png');
  assert.equal(x.meta.poster,'https://img/p.jpg');
 });
 it('miniaturas somente para episódios com temporada/número válidos',()=>{
  const orig={meta:{id:'tt0944947',type:'series',videos:[
   {season:1,episode:2,thumbnail:'https://img/thumb.jpg'},
   {id:'yt_abc',thumbnail:'https://img/unrelated.jpg'}]}};
  const changed=decorateMetaResponse(orig,'series',ON);
  assert.ok(changed.meta.videos[0].thumbnail.includes('tt0944947%3A1%3A2/'));
  assert.equal(changed.meta.videos[1].thumbnail,'https://img/unrelated.jpg');
 });
 it('token em branco mantém o salvo; desativar ou remover restaura a origem',()=>{
  saveErdbSettings({enabled:false,token:''});
  assert.equal(erdbStatus().configured,true);
  assert.equal(erdbStatus().enabled,false);
  saveErdbSettings({clearToken:true});
  assert.equal(erdbStatus().configured,false);
  assert.equal(erdbStatus().enabled,false);
 });
});
after(()=>{
 if(prior===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prior;
 fs.rmSync(dir,{recursive:true,force:true});
});
