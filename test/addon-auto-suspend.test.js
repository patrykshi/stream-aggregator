import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {checkAddons,effectiveAddonState,effectiveConfig,getMonitorReport} from '../src/aggregator/monitor.js';
import {aggregateStreams} from '../src/aggregator/engine.js';
const origin='https://auto-suspend-example.test/manifest.json';
const a={name:'Teste',url:origin,enabled:true,resources:['stream']};
const b={...a,url:'https://second-test.example/manifest.json',name:'Outro'};
describe('Suspensão automática operacional',()=>{
 it('falha de manifesto suspende imediatamente sem gravar enabled:false e bloqueia streams',async()=>{
  const before=globalThis.fetch;
  let requests=0;
  globalThis.fetch=async()=>{requests++;return {ok:false,status:503};};
  try{
   await checkAddons(()=>({addons:[a]}),{force:true});
   assert.equal(effectiveAddonState(a).autoSuspended,true);
   assert.equal(effectiveAddonState(a).effectiveEnabled,false);
   assert.equal(a.enabled,true);
   const cfg=effectiveConfig({addons:[a]});
   assert.equal(cfg.addons[0].enabled,false);
   const result=await aggregateStreams(cfg,'movie','tt9990011');
   assert.deepEqual(result.streams,[]);
   assert.equal(requests,1,'Suspenso não pode gerar requisição adicional de streams');
   const item=getMonitorReport({addons:[a]}).items[0];
   assert.equal(item.enabled,true);
   assert.equal(item.effectiveEnabled,false);
   assert.equal(item.health.status,'http_error');
  }finally{globalThis.fetch=before;}
 });
 it('recupera automaticamente quando o manifesto responde novamente',async()=>{
  const before=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({id:'provider',resources:['stream']})});
  try{
   await checkAddons(()=>({addons:[a]}),{force:true});
   assert.equal(effectiveAddonState(a).effectiveEnabled,true);
   assert.equal(effectiveAddonState(a).autoSuspended,false);
  }finally{globalThis.fetch=before;}
 });
 it('desativação manual permanece desativada mesmo se a origem estiver saudável',()=>{
  const disabled={...a,enabled:false};
  assert.equal(effectiveAddonState(disabled).effectiveEnabled,false);
  assert.equal(effectiveAddonState(disabled).autoSuspended,false);
 });
 it('outro addon não fica suspenso por falha de um vizinho',()=>{
  assert.equal(effectiveAddonState(b).autoSuspended,false);
  assert.equal(effectiveConfig({addons:[a,b]}).addons[1].enabled,true);
 });
});
