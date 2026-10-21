import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {fetchMDBOwnLists,fetchMDBList,parseMDBListURL,previewBuilderSource}
 from '../src/aggregator/catalog-builder.js';
const mock=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
const sample=(id,type='show')=>({imdb_id:id,title:'Item',mediatype:type,release_year:2024});
describe('MDBList pessoal: diagnóstico e importação sem perda de dados',()=>{
 it('lista dados da conta sem devolver a chave e aceita slugs Unicode seguros',async()=>{
  const calls=[];
  const x=await fetchMDBOwnLists({key:'mock-personal-key',fetchImpl:async url=>{
   calls.push(url);
   return mock([{id:15,user_name:'user',slug:'séries',name:'Minhas Séries',
    mediatype:'show',items:142,private:true},
    {id:16,user_name:'user',slug:'filmes',name:'Meus Filmes',mediatype:'movie',items:3},
    {id:17,user_name:'user',slug:'../privado',name:'Não permitido'}]);
  }});
  assert.equal(x.lists.length,2);
  assert.equal(x.lists[0].type,'series');
  assert.equal(x.lists[0].private,true);
  assert.equal(x.lists[0].url,'https://mdblist.com/lists/user/s%C3%A9ries');
  assert.equal(parseMDBListURL(x.lists[0].url).apiPath,'user/s%C3%A9ries');
  assert.ok(calls[0].includes('apikey=mock-personal-key'));
  assert.ok(!JSON.stringify(x).includes('mock-personal-key'));
 });
 it('consulta pelo ID pessoal sem acessar o feed público e pagina quando necessário',async()=>{
  const urls=[];
  const one=Array.from({length:1000},(_,i)=>sample('tt'+String(1_000_000+i)));
  const out=await fetchMDBList('https://mdblist.com/lists/user/privado','series',{
   listId:1234,key:'personal-key',fetchImpl:async url=>{
    urls.push(url);
    return mock(url.includes('offset=1000')?{shows:[sample('tt9876543')]}:{shows:one});
   }
  });
  assert.equal(out.method,'api');assert.equal(out.listId,1234);
  assert.equal(out.metas.length,1001);
  assert.equal(urls.length,2);
  assert.ok(urls[0].startsWith('https://api.mdblist.com/lists/1234/items?'));
  assert.ok(!JSON.stringify(out).includes('personal-key'));
 });
 it('continua para a segunda página quando a primeira só contém outro tipo',async()=>{
  const urls=[];
  const one=Array.from({length:1000},(_,i)=>sample('tt'+String(1_000_000+i),'movie'));
  const out=await fetchMDBList('https://mdblist.com/lists/user/lista','series',{
   listId:2,key:'personal-key',fetchImpl:async url=>{
    urls.push(url);
    return mock(url.includes('offset=1000')?{shows:[sample('tt9876543')]}:{movies:one});
   }
  });
  assert.deepEqual(out.metas.map(x=>x.id),['tt9876543']);
  assert.equal(urls.length,2);
 });
 it('explica divergência filmes/séries e sugere tipo correto em vez de acusar chave',async()=>{
  const call=async url=>mock(url.includes('/json')?[sample('tt1234567')]:
   {movies:[],shows:[sample('tt1234567')]});
  await assert.rejects(fetchMDBList('https://mdblist.com/lists/user/tv','movie',{
   key:'personal-key',fetchImpl:call
  }),e=>e.suggestedType==='series'&&/Séries/.test(e.message)&&
   !/chave/.test(e.message.toLowerCase()));
 });
 it('mostra autenticação negada sem retornar chave pessoal ou URLs sensíveis',async()=>{
  const fail=async()=>({ok:false,status:401,headers:{get:()=>null}});
  await assert.rejects(fetchMDBList('https://mdblist.com/lists/user/test','series',{
   listId:20,key:'very-private-key',fetchImpl:fail
  }),e=>/HTTP 401/.test(e.message)&&!e.message.includes('very-private-key'));
 });
 it('valida o ID da lista antes de realizar qualquer chamada',async()=>{
  await assert.rejects(previewBuilderSource({
   source:'mdblist',type:'series',url:'https://mdblist.com/lists/user/lista',
   listId:'../../local',filters:{}
  },{keys:{mdblist:'test-secret'},fetchImpl:async()=>{throw Error('Não deve consultar a API');}}),
  /Identificador/);
 });
});
