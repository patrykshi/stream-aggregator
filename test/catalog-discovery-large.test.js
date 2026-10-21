import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {previewExternalAddon,catalogKey} from '../src/aggregator/catalog-service.js';

describe('Descoberta completa de catálogos de addons',()=>{
 it('lê 856 catálogos de um manifesto sem corte de 150',async()=>{
  const url='https://cinema-example.org/manifest.json';
  const mockCatalogs=Array.from({length:856},(_,i)=>({
   id:'catalog_'+i,type:i<565?'movie':'series',name:'Catálogo '+i,
   extra:[{name:'skip',isRequired:false}]
  }));
  const before=globalThis.fetch;
  globalThis.fetch=async request=>{
   assert.equal(String(request),url);
   return {ok:true,status:200,headers:{get:()=>null},
    body:(async function*(){yield Buffer.from(JSON.stringify({
     id:'cinema.example',name:'Fonte com muitos catálogos',
     resources:['catalog','meta'],catalogs:mockCatalogs
    }))})()};
  };
  try{
   const result=await previewExternalAddon(url);
   assert.equal(result.catalogs.length,856);
   assert.equal(result.catalogs.filter(c=>c.type==='movie').length,565);
   assert.equal(result.catalogs.filter(c=>c.type==='series').length,291);
   assert.equal(result.catalogs[855].id,'catalog_855');
   assert.equal(result.catalogs[855].key,catalogKey(url,'series','catalog_855'));
  }finally{globalThis.fetch=before;}
 });
});
