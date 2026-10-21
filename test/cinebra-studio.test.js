import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'cinebra-studio-test-'));
process.env.DATA_DIR=dataDir;
const {
 validateStudioDocument,applyStudioOverlay,saveStudioDocument,getStudioDocument,
 getStudioHistory,restoreStudioRevision,observeStudioUpstream,upstreamChanges,getStudioStatus
}=await import('../src/aggregator/collection-overlay.js');
const manifest={id:'cinebra',catalogs:[{type:'movie',id:'hot',name:'Em alta'}]};
const base=[{id:'streaming',title:'Streaming',backdropImageUrl:'https://upstream.example/hero.jpg',pinToTop:false,
 folders:[
  {id:'netflix',title:'Netflix',coverImageUrl:'https://upstream.example/a.jpg',
   catalogSources:[{addonId:'cinebra',type:'movie',catalogId:'hot',genre:null}]},
  {id:'disney',title:'Disney',coverImageUrl:'https://upstream.example/d.jpg',catalogSources:[]}
 ]}];
describe('Cinebra Studio - espelho com personalizações',()=>{
 it('mantém atualizações da origem em campos não personalizados',()=>{
   const doc=validateStudioDocument({groups:{streaming:{title:'Minha Streaming'}},folders:{netflix:{title:'Netflix pessoal'}}});
   const newer=structuredClone(base);
   newer[0].folders[0].coverImageUrl='https://upstream.example/nova-capa.webp';
   newer[0].folders.push({id:'hbo',title:'HBO',coverImageUrl:'https://upstream.example/hbo.jpg',catalogSources:[]});
   const result=applyStudioOverlay(newer,doc);
   assert.equal(result[0].title,'Minha Streaming');
   assert.equal(result[0].folders[0].title,'Netflix pessoal');
   assert.equal(result[0].folders[0].coverImageUrl,'https://upstream.example/nova-capa.webp');
   assert.equal(result[0].folders.length,3);
 });
 it('respeita capa local e recebe atualização nos outros campos',()=>{
   const doc=validateStudioDocument({folders:{netflix:{coverImageUrl:'https://local.example/minha-capa.webp'}}});
   const newer=structuredClone(base);newer[0].folders[0].heroBackdropUrl='https://upstream.example/hero2.jpg';
   const r=applyStudioOverlay(newer,doc)[0].folders[0];
   assert.equal(r.coverImageUrl,'https://local.example/minha-capa.webp');
   assert.equal(r.heroBackdropUrl,'https://upstream.example/hero2.jpg');
 });
 it('adiciona, oculta e reorganiza sem excluir fontes novas',()=>{
   const id='cinebra::movie::hot::';
   const newSource={addonId:'other',type:'series',catalogId:'drama',genre:null,title:'Dramas'};
   const doc=validateStudioDocument({
     sourceAdds:{netflix:[newSource]},sourceHides:{netflix:[id]},
     addedGroups:[{id:'studio-minha',title:'Minha Coleção'}],
     addedFolders:{'studio-minha':[{id:'studio-f1',title:'Top pessoais',
       catalogSources:[{addonId:'cinebra',type:'movie',catalogId:'hot'}]}]},
     folderOrder:{streaming:['disney','netflix']},groupOrder:['studio-minha','streaming']
   });
   const copy=structuredClone(base);copy[0].folders[0].catalogSources.push({
     addonId:'cinebra',type:'series',catalogId:'new-series',genre:null});
   const result=applyStudioOverlay(copy,doc);
   assert.equal(result[0].title,'Minha Coleção');
   assert.equal(result[0].folders[0].catalogSources[0].catalogId,'hot');
   assert.equal(result[1].folders[0].id,'disney');
   const src=result[1].folders[1].catalogSources;
   assert.deepEqual(src.map(s=>s.catalogId),['new-series','drama']);
   assert.equal(copy[0].folders[0].catalogSources.length,2,'origem imutável');
 });
 it('persiste ordem personalizada por ID sem perder novos catálogos publicados pelo Cinebra',()=>{
   const a={addonId:'cinebra',type:'movie',catalogId:'hot',genre:null};
   const b={addonId:'cinebra',type:'series',catalogId:'dramas',genre:null};
   const c={addonId:'cinebra',type:'movie',catalogId:'novidade',genre:null};
   const input=structuredClone(base);
   input[0].folders[0].catalogSources=[a,b];
   const key=s=>[s.addonId,s.type,s.catalogId,s.genre||''].join('::');
   const doc=validateStudioDocument({sourceOrder:{netflix:[key(b),key(a)]}});
   const first=applyStudioOverlay(input,doc)[0].folders[0].catalogSources;
   assert.deepEqual(first.map(s=>s.catalogId),['dramas','hot']);
   input[0].folders[0].catalogSources.push(c);
   const second=applyStudioOverlay(input,doc)[0].folders[0].catalogSources;
   assert.deepEqual(second.map(s=>s.catalogId),['dramas','hot','novidade']);
   assert.deepEqual(input[0].folders[0].catalogSources.map(s=>s.catalogId),['hot','dramas','novidade']);
 });
 it('mantém vínculo do catálogo do addon instalado como seleção persistente',()=>{
   const url='https://addons.example.com/manifest.json';
   const id='bx123456789abc_0123456789abcdef';
   const doc=validateStudioDocument({catalogAddons:[{url,selected:['movie::trending']}],
     sourceAdds:{netflix:[{provider:'addon',addonId:'community.streamaggregator.unified',
       type:'movie',catalogId:id,genre:null,title:'Addon · Em alta',addonBaseUrl:'https://stream.patrykrocha.com'}]}});
   const out=applyStudioOverlay(base,doc);
   const src=out[0].folders[0].catalogSources.at(-1);
   assert.equal(src.catalogId,id);
   assert.equal(src.addonBaseUrl,'https://stream.patrykrocha.com');
   assert.deepEqual(doc.catalogAddons[0].selected,['movie::trending']);
   assert.throws(()=>validateStudioDocument({catalogAddons:[{url:'http://localhost/private',selected:['movie::test']}]}),/inválida/);
 });
 it('valida entradas perigosas',()=>{
   assert.throws(()=>validateStudioDocument({folders:{netflix:{coverImageUrl:'javascript:alert(1)'}}}),/HTTPS/);
   assert.throws(()=>validateStudioDocument({groups:{streaming:{title:'<script>alert(1)</script>'}}}),/Texto/);
   assert.throws(()=>validateStudioDocument({addedGroups:[{id:'foo',title:'x'}]}),/ID/);
 });
 it('mantém revisões e restaura a anterior sem perda de backup',()=>{
   const saved=saveStudioDocument({groups:{streaming:{title:'Personalizada'}}},0);
   assert.equal(saved.revision,1);
   assert.equal(getStudioDocument().groups.streaming.title,'Personalizada');
   assert.throws(()=>saveStudioDocument({groups:{}},0),/Outro salvamento/);
   const saved2=saveStudioDocument({groups:{}},1);
   assert.equal(saved2.revision,2);
   const history=getStudioHistory();
   assert.ok(history.find(x=>x.revision===1));
   const restored=restoreStudioRevision(1,2);
   assert.equal(restored.groups.streaming.title,'Personalizada');
   assert.equal(restored.revision,3);
 });
 it('identifica alterações do Cinebra: adições, capas, remanejamento e catálogos',()=>{
   const baseline=observeStudioUpstream(base,manifest);
   assert.equal(baseline.changed,true);
   const same=observeStudioUpstream(structuredClone(base),manifest);
   assert.equal(same.changed,false);
   const updated=structuredClone(base);
   updated[0].folders[0].coverImageUrl='https://upstream.example/novo.jpg';
   updated[0].folders.push({id:'prime',title:'Prime Video',catalogSources:[]});
   const newerManifest={...manifest,catalogs:[...manifest.catalogs,{type:'series',id:'prime',name:'Prime'}]};
   const changed=observeStudioUpstream(updated,newerManifest);
   assert.equal(changed.stats.addedFolders,1);
   assert.equal(changed.stats.updatedCovers,1);
   assert.equal(changed.stats.catalogListChanged,true);
   const status=getStudioStatus();
   assert.equal(status.recentUpstreamChanges.length,2);
   assert.equal(status.revision,3);
 });
});
