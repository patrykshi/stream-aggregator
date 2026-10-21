import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import '../public/collection-links.js';
const {reorder}=globalThis.NuvioCollectionLinks;
describe('Arrastar Coleções, Pastas e Catálogos sem alterar vínculos',()=>{
 it('move coleção para baixo, preservando seu objeto e as pastas',()=>{
  const g=[{id:'A',folders:[{id:'p',catalogSources:[{catalogId:'x'}]}]},{id:'B',folders:[]},{id:'C',folders:[]}];
  const original=g[0],sources=g[0].folders[0].catalogSources;
  assert.equal(reorder(g,0,2,true),true);
  assert.deepEqual(g.map(x=>x.id),['B','C','A']);
  assert.strictEqual(g[2],original);
  assert.strictEqual(g[2].folders[0].catalogSources,sources);
 });
 it('move pasta acima de outra mantendo catálogos e coleções externas',()=>{
  const first={id:'p1',catalogSources:[{catalogId:'a',type:'movie'}]};
  const folders=[first,{id:'p2',catalogSources:[{catalogId:'b'}]},{id:'p3',catalogSources:[]}];
  const imported=structuredClone(first.catalogSources);
  assert.equal(reorder(folders,2,0,false),true);
  assert.deepEqual(folders.map(x=>x.id),['p3','p1','p2']);
  assert.deepEqual(first.catalogSources,imported);
 });
 it('move catálogos mantendo tipos, addonId e filtros genre',()=>{
  const rows=[
   {type:'movie',catalogId:'A',addonId:'cinebra',genre:'Comedy'},
   {type:'series',catalogId:'B',addonId:'cinebra',genre:null},
   {type:'movie',catalogId:'C',addonId:'cinebra',genre:'Action'},
  ];
  const before=rows.map(x=>structuredClone(x));
  assert.equal(reorder(rows,0,2,true),true);
  assert.deepEqual(rows,[before[1],before[2],before[0]]);
 });
 it('sem destino válido, nunca altera a lista',()=>{
  const input=[{id:'one'},{id:'two'}],same=JSON.stringify(input);
  for(const args of [[-1,0,false],[0,-1,false],[2,1,true],[0,2,true],[1,1,false],[0,1,false]]){
   assert.equal(reorder(input,...args),false);
   assert.equal(JSON.stringify(input),same);
  }
 });
 it('não troca elementos adjacentes ao soltar na metade da origem',()=>{
  const a=[1,2,3];
  assert.equal(reorder(a,1,1,true),false);
  assert.equal(reorder(a,1,2,false),false);
  assert.deepEqual(a,[1,2,3]);
 });
 it('suporta 426 pastas e 857 referências sem excluir ou duplicar nenhum vínculo',()=>{
  const folders=Array.from({length:426},(_,i)=>({id:'f'+i,catalogSources:[
   {type:'movie',addonId:'cinebra',catalogId:'c'+i}
  ]}));
  const before=folders.flatMap(x=>x.catalogSources).map(x=>x.catalogId).sort();
  assert.equal(reorder(folders,425,0,false),true);
  assert.equal(reorder(folders,0,425,true),true);
  assert.deepEqual(folders.map(x=>x.id),Array.from({length:426},(_,i)=>'f'+i));
  assert.deepEqual(folders.flatMap(x=>x.catalogSources).map(x=>x.catalogId).sort(),before);
 });
});
