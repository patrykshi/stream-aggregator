import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'nuvio-mosaic-drafts-'));
process.env.DATA_DIR=sandbox;
const {updateIntegrationSettings}=await import('../src/config/hub-integrations.js');
const {searchMosaicOptions,addCustomMosaicCategory,customMosaicGroups}=await import('../src/aggregator/mosaic-categories.js');
const {decorateStudioBase,composeStudioArtwork}=await import('../src/aggregator/artwork-studio.js');
updateIntegrationSettings({tmdb:{value:'test-tmdb-api-key-not-for-real'}});
const raw=await sharp({create:{width:900,height:450,channels:3,background:'#203754'}}).png().toBuffer();
const baseDataUrl='data:image/png;base64,'+raw.toString('base64');
const factory=payload=>async url=>{
  const parsed=new URL(url);
  assert.equal(parsed.searchParams.get('api_key'),'test-tmdb-api-key-not-for-real');
  return {ok:true,json:async()=>payload};
};
describe('Artwork Studio: rascunhos, textos e categorias extensíveis',()=>{
 it('adiciona streaming real em lista persistida, deduplica e recusa IDs fabricados',async()=>{
  const fetched=()=>searchMosaicOptions({group:'streaming',q:'Pluto'}, {fetchImpl:factory({results:[
   {provider_name:'Pluto TV',provider_id:300},
   {provider_name:'Pluto Cinema',provider_id:301},
   {provider_name:'Outro',provider_id:30}
  ]})});
  const found=await fetched();
  assert.equal(found.items.length,2);
  const result=await addCustomMosaicCategory({group:'streaming',option:found.items[0]}, {search:fetched});
  assert.equal(result.added,true);
  assert.equal(customMosaicGroups().streaming[0].name,'Pluto TV');
  const duplicate=await addCustomMosaicCategory({group:'streaming',option:found.items[0]}, {search:fetched});
  assert.equal(duplicate.added,false);
  await assert.rejects(()=>addCustomMosaicCategory({group:'streaming',option:{name:'Pluto TV',id:'777777',media:'movie',kind:'provider'}}, {search:fetched}),/não está/);
  assert.ok(fs.existsSync(path.join(sandbox,'mosaic-categories.json')));
 });
 it('suporta gêneros de séries, temas/palavras-chave, países e décadas pelo TMDB',async()=>{
  const genre=await searchMosaicOptions({group:'generos',q:'Drama'},
   {fetchImpl:async(url)=>({ok:true,json:async()=>url.includes('/movie/')?{genres:[{name:'Drama',id:18}]}:{genres:[{name:'Drama',id:18}]}})});
  assert.ok(genre.items.some(x=>x.name==='Drama · Séries'&&x.media==='tv'));
  const theme=await searchMosaicOptions({group:'temas',q:'Cyberpunk'}, {fetchImpl:factory({results:[{id:123,name:'Cyberpunk'}]})});
  assert.equal(theme.items[0].kind,'keyword');
  const decade=await searchMosaicOptions({group:'decadas',q:'1990'}, {fetchImpl:factory({})});
  assert.equal(decade.items[0].id,'1990');
  const country=await searchMosaicOptions({group:'mundo',q:'Brasil'},
   {fetchImpl:factory([{iso_3166_1:'BR',native_name:'Brasil'}])});
  assert.equal(country.items[0].id,'BR');
 });
 it('recompõe título e subtítulo longos na mesma imagem-base sem pedir novo mosaico',async()=>{
  const original=await decorateStudioBase({baseDataUrl,shape:'LANDSCAPE',hideTitle:true,save:false});
  const altered=await decorateStudioBase({baseDataUrl,shape:'LANDSCAPE',
   title:'🔭 Descobrir histórias incríveis e documentários surpreendentes',
   subtitle:'Seleção pessoal de lançamentos, recomendações e descobertas',save:false});
  assert.match(altered.dataUrl,/^data:image\/webp;base64,/);
  assert.notEqual(original.dataUrl,altered.dataUrl);
  assert.equal((await sharp(Buffer.from(altered.dataUrl.split(',')[1],'base64')).metadata()).width,1280);
  const poster=await decorateStudioBase({baseDataUrl,shape:'POSTER',title:'Dramas da Semana',subtitle:'Romance e Aventuras'});
  assert.equal(poster.height,900);
  await assert.rejects(()=>decorateStudioBase({baseDataUrl:'http://127.0.0.1/internal'}),/inválida/);
 });
 it('gradiente é independente dos presets e o texto permanece alterável',async()=>{
  const first=await composeStudioArtwork({mode:'preset',presetId:'',primary:'#4062f6',secondary:'#111927',
   accent:'#daecff',title:'Descobrir',subtitle:'Roteiros favoritos',save:false});
  const second=await composeStudioArtwork({mode:'preset',presetId:'',primary:'#4062f6',secondary:'#111927',
   accent:'#daecff',title:'Descobrir ✦',subtitle:'Mais episódios e recomendações',save:false});
  assert.notEqual(first.dataUrl,second.dataUrl);
 });
});
process.on('exit',()=>fs.rmSync(sandbox,{recursive:true,force:true}));
