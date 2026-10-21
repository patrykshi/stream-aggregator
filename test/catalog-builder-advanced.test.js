import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {fetchTVMazeCatalog,previewBuilderSource,normalizeBuilderFilters,
 applyBuilderFilters,fetchTMDBCatalog,getBuilderCapabilities}
 from '../src/aggregator/catalog-builder.js';

const ok=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
const show=(name,id,other={})=>({
 name,externals:{imdb:id},premiered:'2023-03-10',
 genres:['Drama'],language:'English',rating:{average:8.1},
 image:{medium:'https://static.tvmaze.com/uploads/images/medium_portrait/1/2.jpg'},
 summary:'<p>Descrição <b>em destaque</b></p>',...other
});
describe('Studio avançado: TVmaze e filtros precisos',()=>{
 it('oferece TVmaze sem credencial e conserva integrações existentes',()=>{
  const c=getBuilderCapabilities();
  assert.equal(c.sources.find(x=>x.id==='tvmaze')?.requiresKey,false);
  assert.ok(c.sources.some(x=>x.id==='mdblist'));
 });
 it('faz busca por nome e usa somente IDs IMDb jogáveis, deduplicados',async()=>{
  let requested='';
  const result=await fetchTVMazeCatalog('series','search','Severance',{limit:20},{
   fetchImpl:async uri=>{
    requested=uri;
    return ok([
     {show:show('Severance','tt11280740')},
     {show:show('Severance duplicada','tt11280740')},
     {show:show('Sem IMDb','')},
     {show:show('Outras vidas','tt0987654',
      {image:{medium:'https://evil.example/track.jpg'}})}
    ]);
   }
  });
  assert.ok(requested.startsWith('https://api.tvmaze.com/search/shows?q=Severance'));
  assert.deepEqual(result.metas.map(x=>x.id),['tt11280740','tt0987654']);
  assert.equal(result.metas[0].year,2023);
  assert.equal(result.metas[0].poster.includes('static.tvmaze.com'),true);
  assert.equal(result.metas[1].poster,undefined);
  assert.equal(result.metas[0].description,'Descrição  em destaque');
 });
 it('normaliza programação web com show embutido e região controlada',async()=>{
  let endpoint;
  const result=await previewBuilderSource({
   source:'tvmaze',type:'series',mode:'web',filters:{region:'BR',minRating:7}
  },{fetchImpl:async uri=>{
   endpoint=uri;
   return ok([
    {_embedded:{show:show('Programa A','tt1234567')}},
    {_embedded:{show:show('Programa B','tt7654321',{rating:{average:5.2}})}}
   ]);
  }});
  assert.equal(endpoint,'https://api.tvmaze.com/schedule/web?country=BR');
  assert.deepEqual(result.metas.map(x=>x.id),['tt1234567']);
  assert.equal(result.count,1);
 });
 it('rejeita tipo de filme, busca vazia e modos inválidos antes da requisição',async()=>{
  await assert.rejects(fetchTVMazeCatalog('movie','search','Severance'),/Séries/);
  await assert.rejects(fetchTVMazeCatalog('series','search','x'),/dois caracteres/);
  await assert.rejects(fetchTVMazeCatalog('series','unsupported','anything'),/Modo TVmaze/);
 });
 it('aplica mínimos de votos, idioma e exclusão de gêneros com dados conhecidos',()=>{
  const metas=[
   {id:'a',name:'A',genres:['28'],originalLanguage:'en',voteCount:500,rating:8.5},
   {id:'b',name:'B',genres:['27'],originalLanguage:'en',voteCount:400,rating:9},
   {id:'c',name:'C',genres:['28'],originalLanguage:'pt',voteCount:600,rating:9.5},
   {id:'d',name:'D',genres:['28'],originalLanguage:'en',voteCount:2,rating:9.8}
  ];
  assert.deepEqual(applyBuilderFilters(metas,{
   minVotes:100,excludeGenre:'27',originalLanguage:'en',sort:'rating-desc'
  }).map(x=>x.id),['a']);
  for(const filters of [{minVotes:-1},{minVotes:0.5},{minVotes:1000001},
   {originalLanguage:'english'},{minVotes:'abc'}])
   assert.throws(()=>normalizeBuilderFilters(filters));
 });
 it('envia filtros discover à API TMDB sem expor credencial no resultado',async()=>{
  let requested;
  const result=await fetchTMDBCatalog('series','discover',{
   limit:5,excludeGenre:'27',minVotes:250,originalLanguage:'th'
  },{apiKey:'test-key',fetchImpl:async uri=>{
   requested=uri;
   return ok({results:[{id:20,name:'Drama',genre_ids:[18],original_language:'th',
    vote_count:340,first_air_date:'2025-02-02',vote_average:8}]});
  }});
  assert.ok(requested.includes('without_genres=27'));
  assert.ok(requested.includes('vote_count.gte=250'));
  assert.ok(requested.includes('with_original_language=th'));
  assert.equal(result.metas.length,1);
  assert.ok(!JSON.stringify(result).includes('test-key'));
 });
 it('não finge aplicar filtro de streaming a modelos TMDB incompatíveis',async()=>{
  await assert.rejects(fetchTMDBCatalog('movie','popular',{
   watchProvider:'8'
  },{apiKey:'dummy'}),/Descoberta personalizada/);
 });
});