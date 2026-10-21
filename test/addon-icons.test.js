import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'addon-visuals-test-'));
const {manifestArtwork,checkAddons,getMonitorReport}=await import('../src/aggregator/monitor.js');
const addon={name:'Addon com ícone',url:'https://imagery.example/manifest.json',
  enabled:true,resources:['stream']};

describe('Imagens dos addons a partir do manifesto',()=>{
 it('usa logo prioritariamente e aceita ícone relativo',()=>{
  assert.equal(manifestArtwork({logo:'https://cdn.example/logo.png',icon:'https://cdn.example/icon.png'},addon.url),
    'https://cdn.example/logo.png');
  assert.equal(manifestArtwork({icon:'/icons/cover.webp'},addon.url),'https://imagery.example/icons/cover.webp');
  assert.equal(manifestArtwork({logo:'javascript:alert(1)',icon:'http://localhost/favicon.ico'},addon.url),null);
  assert.equal(manifestArtwork({logo:'data:image/svg+xml;base64,AAAA'},addon.url),null);
 });
 it('guarda logo quando a origem responde e o conserva durante uma falha',async()=>{
  const prev=globalThis.fetch;
  try{
   globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({
    id:'addon.images',resources:['stream'],logo:'https://cdn.example/brand.png'
   })});
   await checkAddons(()=>({addons:[addon]}),{force:true});
   const ok=getMonitorReport({addons:[addon]}).items[0];
   assert.equal(ok.artworkUrl,'https://cdn.example/brand.png');
   assert.equal(ok.effectiveEnabled,true);
   globalThis.fetch=async()=>({ok:false,status:503});
   await checkAddons(()=>({addons:[addon]}),{force:true});
   const down=getMonitorReport({addons:[addon]}).items[0];
   assert.equal(down.health.status,'http_error');
   assert.equal(down.artworkUrl,'https://cdn.example/brand.png');
   assert.equal(down.effectiveEnabled,false);
   const file=path.join(process.env.DATA_DIR,'addon-visuals.json');
   assert.deepEqual(Object.values(JSON.parse(fs.readFileSync(file,'utf8'))),['https://cdn.example/brand.png']);
  }finally{globalThis.fetch=prev;}
 });
 it('mantém iniciais quando o manifesto não fornece imagem',async()=>{
  const without={...addon,url:'https://no-logo.example/manifest.json',name:'Emby (Patryk)'};
  const prev=globalThis.fetch;
  try{
   globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({id:'meta.provider',resources:['stream']})});
   await checkAddons(()=>({addons:[without]}),{force:true});
   assert.equal(getMonitorReport({addons:[without]}).items[0].artworkUrl,null);
  }finally{globalThis.fetch=prev;}
 });
});
