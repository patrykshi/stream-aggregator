import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'addon-priority-'));
const {aggregateStreams}=await import('../src/aggregator/engine.js');
const addon=(name,enabled=true)=>({
 url:'https://'+name.toLowerCase().replaceAll(' ','-')+'.example/manifest.json',
 name,enabled,resources:['stream'],idPrefixes:['tt'],timeoutMs:6000
});
describe('Prioridade dos provedores do Agregador',()=>{
 it('inicia prioritário antes, mantém buscas concorrentes e retorna na ordem configurada',async()=>{
  const first=addon('Principal'),second=addon('Rapido');
  const attempts=[],started=Date.now(),orig=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    const hostname=new URL(String(url)).hostname;
    attempts.push({hostname,elapsed:Date.now()-started});
    if(hostname.startsWith('principal'))await new Promise(r=>setTimeout(r,270));
    else await new Promise(r=>setTimeout(r,9));
    return {ok:true,json:async()=>({streams:[{name:hostname,title:'1080p WEB'}]})};
  };
  try{
   const cfg={addons:[first,second],filters:{removeCams:false,resolutions:[],maxTotalStreams:2},deduplicate:false,badgeFormat:'none'};
   const out=await aggregateStreams(cfg,'movie','tt3939391');
   assert.equal(attempts.length,2);
   assert.ok(attempts[1].elapsed>=attempts[0].elapsed+25,JSON.stringify(attempts));
   assert.ok(attempts[1].elapsed<attempts[0].elapsed+230,'Prioridade deve preservar paralelismo');
   assert.deepEqual(out.streams.map(x=>x.name),['principal.example','rapido.example']);
  }finally{globalThis.fetch=orig;}
 });
 it('aplica limite de resultados primeiro ao addon prioritário, ignorando desativados',async()=>{
  const disabled=addon('Pausado',false),top=addon('Mais Prioridade'),later=addon('Depois');
  const calls=[],orig=globalThis.fetch;
  globalThis.fetch=async(url)=>{
   const hostname=new URL(String(url)).hostname;
   calls.push(hostname);
   return {ok:true,json:async()=>({streams:[{name:hostname,title:'1080p'}]})};
  };
  try{
   const config={addons:[disabled,top,later],
     filters:{removeCams:false,resolutions:[],maxTotalStreams:1},
     deduplicate:false,badgeFormat:'none'};
   const r=await aggregateStreams(config,'series','tt3939392:1:1');
   assert.deepEqual(r.streams.map(x=>x.name),['mais-prioridade.example']);
   assert.equal(calls.length,2);assert.ok(!calls.includes('pausado.example'));
  }finally{globalThis.fetch=orig;}
 });
});
