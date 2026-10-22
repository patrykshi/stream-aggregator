import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'nuvio-arts-tests-'));
process.env.DATA_DIR=sandbox;
const {getIntegrationKey,updateIntegrationSettings,integrationStatuses}=await import('../src/config/hub-integrations.js');
const {composeStudioArtwork,generateAiStudioArtwork,applyUploadedMark}=await import('../src/aggregator/artwork-studio.js');
const {composeOriginalMosaic,originalMosaicStatus,getOriginalMosaicCategories}=await import('../src/aggregator/tmdb-mosaic.js');
const image=await sharp({create:{width:350,height:530,channels:4,background:'#ffeedd'}}).png().toBuffer();
describe('Estúdio de capas: quatro correções',()=>{
 it('não gera logos de streaming falsos ao aplicar tema; aceita nenhum ícone',async()=>{
  const without=await composeStudioArtwork({mode:'preset',presetId:'netflix',title:'',subtitle:'',badge:'',hideTitle:true,save:false});
  const withBadge=await composeStudioArtwork({mode:'preset',presetId:'netflix',title:'',subtitle:'',badge:'N',hideTitle:true,save:false});
  assert.notEqual(without.dataUrl,withBadge.dataUrl);
  assert.match(without.dataUrl,/^data:image\/webp;base64,/);
 });
 it('importa o símbolo desenhado pelo usuário, não importa SVG/HTML arbitrário',async()=>{
  const base=await sharp({create:{width:600,height:900,channels:4,background:'#112233'}}).webp().toBuffer();
  const overlaid=await applyUploadedMark(base,'data:image/png;base64,'+image.toString('base64'),600,900);
  assert.equal((await sharp(overlaid).metadata()).format,'webp');
  assert.notDeepEqual(overlaid,base);
  await assert.rejects(()=>applyUploadedMark(base,'data:image/svg+xml;base64,abc',600,900),/PNG\/WebP\/JPEG/);
 });
 it('substitui o criador dourado pelo mosaico diagonal TMDB e respeita proporção e marca',async()=>{
  assert.equal(originalMosaicStatus().configured,false);
  await assert.rejects(()=>composeOriginalMosaic({group:'generos',category:'Ação'}),/não configurados/);
  process.env.PYTHON_MOSAIC_ENABLED='1';
  const rendered=await sharp({create:{width:1920,height:1080,channels:3,background:'#124567'}}).jpeg().toBuffer();
  updateIntegrationSettings({tmdb:{value:'mock-api-key-not-sent-to-browser'}});
  try{
   const categories=await getOriginalMosaicCategories({runner:async()=>({groups:{generos:[{name:'Ação',media:'movie'}]}})});
   assert.equal(categories.groups.generos[0].name,'Ação');
   assert.equal(categories.tmdbConfigured,true);
   const result=await composeOriginalMosaic({group:'generos',category:'Ação',cards:12,shape:'POSTER',
    hideTitle:true,title:'Meu acervo',badge:'',save:false},
    {runner:async input=>{
      assert.equal(input.group,'generos');assert.equal(input.category,'Ação');
      assert.equal(input.tmdbKey,'mock-api-key-not-sent-to-browser');
      return {data:rendered.toString('base64'),cards:12};
    }});
   assert.equal(result.provider,'tmdb-original-python');
   assert.equal(result.width,600);assert.equal(result.height,900);
   assert.match(result.dataUrl,/^data:image\/webp;base64,/);
   await assert.rejects(()=>composeOriginalMosaic({group:'generos',category:'Ação',cards:11}),/Quantidade/);
  }finally{delete process.env.PYTHON_MOSAIC_ENABLED;}
 });
 it('Gemini exige chave real, nunca faz fallback procedural ou vaza a chave na URL',async()=>{
  assert.equal(integrationStatuses().gemini.configured,false);
  await assert.rejects(()=>generateAiStudioArtwork({prompt:'Floresta futurista',save:false}),/Gemini não configurado/);
  updateIntegrationSettings({gemini:{value:'fictional-test-gemini-key'}});
  assert.equal(getIntegrationKey('gemini'),'fictional-test-gemini-key');
  const rendered=await generateAiStudioArtwork({prompt:'Arte cinematográfica',shape:'SQUARE',save:false,
    fetchImpl:async()=>{throw Error('no network');}}).catch(e=>e);
  assert.match(rendered.message,/Gemini não respondeu/);
  assert.equal(integrationStatuses().gemini.configured,true);
 });
});
process.on('exit',()=>fs.rmSync(sandbox,{recursive:true,force:true}));
