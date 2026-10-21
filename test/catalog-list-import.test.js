import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {parseImdbList,validateListURL,normalizeTraktItems,fetchTraktList} from '../src/aggregator/list-import.js';
describe('Listas IMDb e Trakt como catálogos Nuvio',()=>{
 it('CSV IMDb com títulos separados por aspas, filtro de filmes e ordem preservada',()=>{
  const csv='Position,Const,Title,Title Type,Year\n1,tt0133093,"The Matrix, Reloaded",Movie,1999\n2,tt0944947,"Game of Thrones",TV Series,2011\n3,tt0111161,"The Shawshank Redemption",Movie,1994';
  const movies=parseImdbList(csv,'movie');
  assert.deepEqual(movies.map(x=>x.id),['tt0133093','tt0111161']);
  assert.equal(movies[0].name,'The Matrix, Reloaded');
  const series=parseImdbList(csv,'series');
  assert.deepEqual(series.map(x=>x.id),['tt0944947']);
 });
 it('Aceita listas com IDs IMDb, URLs e JSON, eliminando duplicados',()=>{
  assert.deepEqual(parseImdbList('tt0133093\ntt0133093\nhttps://www.imdb.com/title/tt0111161/','movie')
   .map(m=>m.id),['tt0133093','tt0111161']);
  assert.equal(parseImdbList(JSON.stringify([{id:'tt0133093',name:'Matrix'}]),'movie')[0].name,'Matrix');
 });
 it('não confunde URLs com conteúdo de lista, nem aceita URLs arbitrárias',()=>{
  assert.match(validateListURL('imdb','https://www.imdb.com/list/ls012345678/').url,/ls012345678/);
  assert.throws(()=>validateListURL('trakt','https://fake-trakt.com/users/x/lists/y'));
  assert.throws(()=>parseImdbList('https://www.imdb.com/list/ls012345678/'),/Nenhum ID IMDb/);
 });
 it('Trakt normaliza filmes e séries com IMDb ID e ignora itens inválidos',()=>{
  const rows=[{type:'movie',movie:{title:'Matrix',ids:{imdb:'tt0133093'},year:1999}},
    {type:'show',show:{title:'Dark',ids:{imdb:'tt5753856'},year:2017}},
    {movie:{title:'Outro',ids:{}}}];
  assert.deepEqual(normalizeTraktItems(rows,'movie').map(x=>x.id),['tt0133093']);
  assert.deepEqual(normalizeTraktItems(rows,'series').map(x=>x.id),['tt5753856']);
 });
 it('Trakt retorna aviso explícito sem credencial; com Client ID usa API paginada',async()=>{
  await assert.rejects(fetchTraktList('https://trakt.tv/users/example/lists/sci-fi','movie',{clientId:''}),/TRAKT_CLIENT_ID/);
  let requested;
  const result=await fetchTraktList('https://trakt.tv/users/example/lists/sci-fi','movie',
   {clientId:'testing-id',fetchImpl:async(uri,options)=>{
     requested={uri,headers:options.headers};
     return {ok:true,json:async()=>[{movie:{title:'Matrix',ids:{imdb:'tt0133093'},year:1999}}]};
   }});
  assert.equal(result.metas.length,1);
  assert.match(requested.uri,/api.trakt.tv\/users\/example\/lists\/sci-fi\/items\?extended=full&page=1&limit=100/);
  assert.equal(requested.headers['trakt-api-key'],'testing-id');
 });
});
