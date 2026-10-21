import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {parseMDBListURL,normalizeMDBItems,fetchMDBList,normalizeBuilderFilters,
 applyBuilderFilters,fetchTMDBCatalog,previewBuilderSource,getBuilderCapabilities}
 from '../src/aggregator/catalog-builder.js';
const mock=(data,headers={})=>({ok:true,status:200,headers:{get:k=>headers[k]||null},json:async()=>data});
describe('Criador multifornte de catálogos Nuvio',()=>{
 it('valida URLs MDBList e impede endpoints arbitrários',()=>{
  const u=parseMDBListURL('https://www.mdblist.com/lists/garycrawfordgc/horror/');
  assert.equal(u.feed,'https://mdblist.com/lists/garycrawfordgc/horror/json');
  const curated=parseMDBListURL('https://mdblist.com/lists/official/movies/popular-movies');
  assert.equal(curated.feed,'https://mdblist.com/lists/official/movies/popular-movies/json');
  assert.equal(curated.apiPath,'official/popular-movies');
  for(const u of ['http://mdblist.com/lists/user/list','https://fake.mdblist.com/lists/x/y',
   'https://mdblist.com@localhost/lists/x/y','https://mdblist.com/lists/x/y/../../private']){
   assert.throws(()=>parseMDBListURL(u));
  }
 });
 it('importa feed JSON público e preserva nomes, ordem, ano e ID IMDb, filtrando séries',async()=>{
  let endpoint='';
  const feed=[
   {title:'Dune',mediatype:'movie',imdb_id:'tt1160419',release_year:2021,rank:1},
   {title:'Severance',mediatype:'show',imdb_id:'tt11280740',release_year:2022},
   {title:'Dune dup',mediatype:'movie',imdb_id:'tt1160419'},
   {title:'Missing',mediatype:'movie',imdb_id:''}
  ];
  const out=await fetchMDBList('https://mdblist.com/lists/hdlists/fantasy','movie',
   {key:'',fetchImpl:async u=>{endpoint=u;return mock(feed);}});
  assert.equal(endpoint,'https://mdblist.com/lists/hdlists/fantasy/json');
  assert.deepEqual(out.metas.map(x=>x.id),['tt1160419']);
  assert.equal(out.metas[0].year,2021);
  assert.equal(out.method,'feed');
 });
 it('reconhece séries em formato movies/shows e rejeita listas vazias',()=>{
  const rows={movies:[],shows:[{title:'Breaking Bad',mediatype:'show',imdb_id:'tt0903747'}]};
  assert.equal(normalizeMDBItems(rows,'series')[0].id,'tt0903747');
  assert.equal(normalizeMDBItems(rows,'movie').length,0);
 });
 it('usa API MDBList apenas após falha do feed quando há chave',async()=>{
  const urls=[];
  const out=await fetchMDBList('https://mdblist.com/lists/user/top','movie',{key:'only-in-backend',
   fetchImpl:async u=>{
    urls.push(u);
    return urls.length===1?{ok:false,status:404,headers:{get:()=>null}}:mock({movies:[
     {title:'Movie',mediatype:'movie',imdb_id:'tt0133093'}]});
   }});
  assert.equal(out.metas[0].id,'tt0133093');
  assert.equal(out.method,'api');
  assert.ok(urls[1].startsWith('https://api.mdblist.com/lists/user/top/items?'));
  assert.ok(urls[1].includes('apikey=only-in-backend'));
  assert.ok(!JSON.stringify(out).includes('only-in-backend'));
 });
 it('aplica filtros e ordenações, mantendo nomes e metadados',()=>{
  const rows=[{id:'a',name:'A',year:2020,rating:8},{id:'b',name:'B',year:2023,rating:6},
   {id:'c',name:'C',year:2022,rating:9}];
  assert.deepEqual(applyBuilderFilters(rows,{minRating:7,sort:'year-desc',limit:5}).map(x=>x.id),['c','a']);
  assert.throws(()=>normalizeBuilderFilters({minRating:99}));
 });
 it('consulta catálogo TMDB com filtro no servidor sem expor chave no retorno',async()=>{
  let uri='';
  const result=await fetchTMDBCatalog('movie','discover',{limit:15,sort:'rating-desc',
   yearFrom:2020,genre:'28',minRating:7,region:'BR',watchProvider:'8'},{
   apiKey:'test-api-key',fetchImpl:async u=>{uri=u;return mock({results:[
    {id:603,title:'The Matrix',vote_average:8.2,release_date:'2021-12-22',
     poster_path:'/test.jpg',genre_ids:[28],overview:'Descrição'}]});}
  });
  assert.equal(result.metas[0].id,'tmdb:603');
  assert.ok(result.metas[0].poster.startsWith('https://image.tmdb.org/'));
  assert.ok(uri.includes('with_watch_providers=8'));
  assert.ok(uri.includes('with_genres=28'));
  assert.ok(!JSON.stringify(result).includes('test-api-key'));
 });
 it('normaliza Trakt, IMDb e MDBList no mesmo contrato, checa credenciais',async()=>{
  const imdb=await previewBuilderSource({source:'imdb',type:'movie',text:'tt0133093'});
  assert.equal(imdb.count,1);
  await assert.rejects(previewBuilderSource({source:'tmdb',type:'movie',mode:'popular'},
    {keys:{tmdb:''}}),/TMDB_API_KEY/);
  const caps=getBuilderCapabilities();
  assert.ok(caps.sources.some(x=>x.id==='mdblist'));
  assert.ok(caps.sources.some(x=>x.id==='tmdb'));
 });
});
