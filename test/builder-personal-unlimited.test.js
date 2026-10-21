import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 normalizeBuilderFilters,applyBuilderFilters,fetchMDBList,listTraktUserLists,
 listTMDBAccountLists,fetchTMDBList,fetchTVMazeFollowed,previewBuilderSource
} from '../src/aggregator/catalog-builder.js';
const mock=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
const film=(i,type='movie')=>({imdb_id:'tt'+String(1000000+i),
 title:'Filme '+i,mediatype:type,year:2024});
describe('Fontes pessoais e listas sem corte artificial',()=>{
 it('interpreta todos como sem limite e mantém quantidade personalizada',()=>{
  assert.equal(normalizeBuilderFilters({limit:'all'}).limit,null);
  assert.equal(normalizeBuilderFilters({limit:0}).limit,null);
  assert.equal(normalizeBuilderFilters({}).limit,null);
  assert.equal(normalizeBuilderFilters({limit:14000}).limit,14000);
  assert.throws(()=>normalizeBuilderFilters({limit:20001}),/limite/);
  const items=Array.from({length:1400},(_,i)=>({name:'Filme '+i,id:'tt'+i,type:'movie'}));
  assert.equal(applyBuilderFilters(items,{limit:'all'}).length,1400);
  assert.equal(applyBuilderFilters(items,{limit:100}).length,100);
 });
 it('busca listas públicas do usuário Trakt sem token OAuth e oculta Client ID',async()=>{
  const endpoints=[];
  const r=await listTraktUserLists('meu.usuario',{clientId:'fake-client-id',fetchImpl:async(u,o)=>{
   endpoints.push({u,header:o.headers['trakt-api-key']});
   return mock([{name:'Minha lista',ids:{slug:'minha-lista'},item_count:1500,privacy:'public'}]);
  }});
  assert.equal(r.lists.length,1);
  assert.equal(r.lists[0].url,'https://trakt.tv/users/meu.usuario/lists/minha-lista');
  assert.equal(endpoints.length,1);
  assert.equal(endpoints[0].header,'fake-client-id');
  assert.ok(!JSON.stringify(r).includes('fake-client-id'));
 });
 it('listas da conta TMDB usam ID e sessão autorizada, sem retornar a sessão',async()=>{
  let call='',auth='';
  const r=await listTMDBAccountLists(42,{sessionId:'private-session-1234',apiKey:'fake-app-key',
   fetchImpl:async (url,opts)=>{call=url;auth=opts.headers.Authorization||'';return mock({
    results:[{id:321,name:'Minha lista TMDB',list_type:'movie',item_count:750}],
    total_pages:1
   });}});
  assert.equal(r.lists[0].id,'321');
  assert.equal(r.lists[0].version,'v3');
  assert.ok(call.includes('session_id=private-session-1234'));
  assert.ok(call.includes('api_key=fake-app-key'));
  assert.equal(auth,'');
  assert.ok(!JSON.stringify(r).includes('private-session-1234'));
 });
 it('lista TMDB v4 percorre páginas e mantém filmes e séries distintos',async()=>{
  let count=0;
  const r=await fetchTMDBList('123','both',{apiKey:'fake-app-key',fetchImpl:async(u)=>{
   count++;
   const page=new URL(u).searchParams.get('page');
   return mock(page==='1'?{results:[
    {id:10,media_type:'movie',title:'Filme',poster_path:'/x.jpg'},
    {id:11,media_type:'tv',name:'Série',poster_path:'/y.jpg'}],total_pages:2}:
    {results:[{id:12,media_type:'movie',title:'Outra'}],total_pages:2});
  }});
  assert.equal(r.metas.length,3);
  assert.deepEqual(r.metas.map(x=>x.type),['movie','series','movie']);
  assert.equal(r.metas[1].poster,'https://image.tmdb.org/t/p/w500/y.jpg');
  assert.equal(count,2);
 });
 it('TVmaze Premium usa Basic Auth apenas no servidor e normaliza séries seguidas',async()=>{
  let authorization='';
  const r=await fetchTVMazeFollowed({username:'usuario',apiKey:'super-secret-api-key',
   fetchImpl:async(url,opts)=>{
    authorization=opts.headers.Authorization;
    assert.equal(url,'https://api.tvmaze.com/v1/user/follows/shows?embed=show');
    return mock([{show_id:1,_embedded:{show:{
     name:'Drama',externals:{imdb:'tt1234567'},image:{medium:'https://static.tvmaze.com/a.jpg'},
     rating:{average:7.8}}}}]);
   }});
  assert.ok(authorization.startsWith('Basic '));
  assert.equal(r.metas.length,1);
  assert.equal(r.metas[0].type,'series');
  assert.ok(!JSON.stringify(r).includes('super-secret-api-key'));
 });
 it('MDBList importa mais de mil itens quando sem limite',async()=>{
  const many=Array.from({length:1000},(_,i)=>film(i));
  let calls=0;
  const r=await previewBuilderSource({source:'mdblist',type:'movie',url:'https://mdblist.com/lists/user/list',
   listId:123,filters:{limit:'all'}},{keys:{mdblist:'fake-key'},fetchImpl:async url=>{
    calls++;
    return mock(url.includes('offset=1000')?{movies:[film(1000)]}:{movies:many});
   }});
  assert.equal(r.count,1001);
  assert.equal(calls,2);
  assert.equal(r.filters.limit,null);
 });
});
