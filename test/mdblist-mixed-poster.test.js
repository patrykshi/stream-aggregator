import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMDBItems,previewBuilderSource,fetchMDBList}
 from '../src/aggregator/catalog-builder.js';
const response=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
const m=(id,title,mediatype,poster='https://image.tmdb.org/t/p/w200/test.jpg')=>({
 imdb_id:id,title,mediatype,release_year:2025,poster,
 description:'Sample title',genres:['Drama']});
describe('MDBList listas mistas, capas e exportação',()=>{
 it('aceita filmes e séries juntos, identifica tipo e imagem recebida pela API',()=>{
  const a=normalizeMDBItems({movies:[m('tt1234567','Filme','movie')],
   shows:[m('tt7654321','Série','show')]},'both');
  assert.deepEqual(a.map(x=>x.type),['movie','series']);
  assert.equal(a[0].poster,'https://image.tmdb.org/t/p/w200/test.jpg');
  assert.equal(a[1].id,'tt7654321');
  assert.equal(a.filter(x=>x.type==='movie').length,1);
 });
 it('respeita filtro exclusivo de filmes ou séries na mesma fonte',()=>{
  const rows=[m('tt1234567','Filme','movie'),m('tt7654321','Série','show')];
  assert.deepEqual(normalizeMDBItems(rows,'movie').map(x=>x.id),['tt1234567']);
  assert.deepEqual(normalizeMDBItems(rows,'series').map(x=>x.id),['tt7654321']);
 });
 it('recusa imagens inseguras, aproveita caminho TMDB e preserva fallback',()=>{
  const rows=[m('tt1234567','Um','movie','http://invalid.example/p.jpg'),
   m('tt7654321','Dois','show','/abc123.jpg')];
  const a=normalizeMDBItems(rows,'both');
  assert.equal(a[0].poster,undefined);
  assert.equal(a[1].poster,'https://image.tmdb.org/t/p/w342/abc123.jpg');
 });
 it('pede posters, gêneros, descrição e avaliações no endpoint de listas próprias',async()=>{
  let called='';
  const result=await fetchMDBList('https://mdblist.com/lists/user/private','both',
   {key:'fake-key-not-personal',listId:12,fetchImpl:async url=>{
    called=url;return response({movies:[m('tt1234567','Filme','movie')],
     shows:[m('tt7654321','Série','show')]});
   }});
  assert.ok(called.includes('append_to_response=genres%2Cposter%2Cdescription%2Cratings'));
  assert.equal(result.metas.length,2);
  assert.deepEqual(result.metas.map(x=>x.type),['movie','series']);
  assert.ok(!JSON.stringify(result).includes('fake-key-not-personal'));
 });
 it('para URL pública enriquece posters quando tem chave; preserva feed em falha de API',async()=>{
  let calls=0;
  const result=await fetchMDBList('https://mdblist.com/lists/user/public','both',{
   key:'fake-key-not-personal',fetchImpl:async url=>{
    calls++;
    if(url.includes('/json'))return response([m('tt1234567','Filme','movie',undefined),
      m('tt7654321','Série','show',undefined)].map(x=>({...x,poster:undefined})));
    return response({movies:[m('tt1234567','Filme','movie')],
      shows:[m('tt7654321','Série','show')]});
   }});
  assert.equal(calls,2);assert.equal(result.method,'api');
  assert.equal(result.metas.length,2);
  const fallback=await fetchMDBList('https://mdblist.com/lists/user/public','both',{
   key:'fake-key-not-personal',fetchImpl:async url=>
    url.includes('/json')?response([m('tt1234567','Filme','movie',undefined)].map(x=>({...x,poster:undefined}))):
    ({ok:false,status:429,headers:{get:()=>null}})
  });
  assert.equal(fallback.method,'feed');
  assert.equal(fallback.metas.length,1);
 });
 it('prévia retorna totais por tipo e rejeita ambos para serviços não MDBList',async()=>{
  const result=await previewBuilderSource({
   source:'mdblist',type:'both',url:'https://mdblist.com/lists/user/list',
   listId:1,filters:{limit:100}
  },{keys:{mdblist:'test-key'},fetchImpl:async()=>response({
   movies:[m('tt1234567','Filme','movie')],shows:[m('tt7654321','Série','show')]
  })});
  assert.equal(result.count,2);
  assert.deepEqual(result.counts,{movie:1,series:1});
  await assert.rejects(previewBuilderSource({
   source:'tmdb',type:'both'
  }),/MDBList/);
 });
});
