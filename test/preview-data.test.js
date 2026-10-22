import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import '../public/preview-data.js';
const build=globalThis.NuvioPreviewData.heroSlidesFromCatalogs;
const safeUrl=x=>typeof x==='string'&&x.startsWith('https://')?x:null;
describe('Dados do simulador de TV desacoplados do DOM',()=>{
 it('usa apenas cartazes reais e não inventa títulos ou anos',()=>{
  const data=[{name:'Origem',type:'movie',metas:[
   {id:'a',name:'Sem capa'},{id:'b',name:'Com capa',poster:'https://img.example/a.jpg'},
   {id:'b',name:'Duplicado',poster:'https://img.example/b.jpg'},
   {id:'c',name:'Inseguro',poster:'javascript:bad()'}]}];
  assert.deepEqual(build(data,safeUrl).map(x=>x.name),['Com capa']);
  assert.equal(build(data,safeUrl)[0].year,null);
  assert.deepEqual(build([],safeUrl),[]);
 });
 it('respeita a ordem e o teto de destaques',()=>{
  const items=Array.from({length:10},(_,i)=>({id:'id'+i,name:'Filme '+i,poster:'https://img.example/'+i+'.jpg'}));
  const slides=build([{type:'movie',name:'QA',metas:items}],safeUrl,3);
  assert.equal(slides.length,3);
  assert.equal(slides[0].name,'Filme 0');
 });
});
