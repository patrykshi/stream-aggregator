// Conversão conservadora de listas externas para catálogos manuais do Studio.
// IMDb: CSV exportado pelo usuário / IDs inseridos. Trakt: API oficial, Client ID próprio.
const MAX_ITEMS=20000;
const imdbId=/^tt[0-9]{6,11}$/;
function text(value,max=200){return String(value??'').trim().slice(0,max);}
function validateListURL(source,raw){
  let url;
  try{url=new URL(String(raw||'').trim());}catch{throw Error('Informe uma URL válida da lista.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('A lista precisa ser HTTPS sem credenciais.');
  if(source==='trakt'){
    if(!['trakt.tv','app.trakt.tv','www.trakt.tv'].includes(url.hostname))throw Error('Use uma URL pública do Trakt.');
    const match=url.pathname.match(/^\/users\/([^/]+)\/lists\/([^/]+)\/?$/);
    if(!match)throw Error('Use https://trakt.tv/users/usuario/lists/nome-da-lista');
    return {url:'https://trakt.tv/users/'+encodeURIComponent(decodeURIComponent(match[1]))+
      '/lists/'+encodeURIComponent(decodeURIComponent(match[2])),
      user:decodeURIComponent(match[1]),slug:decodeURIComponent(match[2])};
  }
  if(source==='imdb'){
    if(!['imdb.com','www.imdb.com'].includes(url.hostname))throw Error('Use uma URL do IMDb.');
    if(!/^\/list\/ls\d+\/?$/.test(url.pathname))throw Error('Endereço de lista IMDb inválido.');
    return {url:'https://www.imdb.com'+url.pathname.replace(/\/?$/,'/')};
  }
  throw Error('Fonte de lista desconhecida.');
}
export {validateListURL};

function rowsFromCSV(input){
 const rows=[],line=[];let field='',quoted=false;
 const src=String(input||'').replace(/^\uFEFF/,'');
 if(src.length>3_000_000)throw Error('Arquivo CSV excede 3 MB.');
 for(let i=0;i<src.length;i++){
  const ch=src[i];
  if(quoted){
   if(ch==='"'&&src[i+1]==='"'){field+='"';i++;}
   else if(ch==='"')quoted=false;
   else field+=ch;
  }else if(ch==='"')quoted=true;
  else if(ch===','||ch==='\t'){line.push(field);field='';}
  else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&src[i+1]==='\n')i++;
   line.push(field);field='';
   if(line.some(c=>c.trim()))rows.push(line.splice(0));
   else line.length=0;
  }else field+=ch;
 }
 if(quoted)throw Error('CSV inválido: aspas não fechadas.');
 line.push(field);
 if(line.some(c=>c.trim()))rows.push(line);
 return rows;
}
function imdbTitleType(raw){
 const value=String(raw||'').toLowerCase().replace(/[\s_-]/g,'');
 if(/tvseries|tvminiseries|tvshort|tvepisode|series|show/.test(value))return 'series';
 return 'movie';
}
export function parseImdbList(input,requestedType='movie'){
 const str=String(input||'').trim();
 if(!str)throw Error('Cole os IDs IMDb ou selecione um CSV exportado do IMDb.');
 if(str.length>3_000_000)throw Error('A lista excede 3 MB.');
 let result=[];
 if(/^[\[{]/.test(str)){
  let data;
  try{data=JSON.parse(str);}catch{throw Error('JSON inválido.');}
  const rows=Array.isArray(data)?data:data?.items||data?.metas||[];
  if(!Array.isArray(rows))throw Error('O JSON precisa ser uma lista de títulos.');
  result=rows.map(row=>{
   if(typeof row==='string')return {id:row,name:row,type:requestedType};
   const id=row.id||row.Const||row.const||row.imdb||row.imdb_id||'';
   const title=row.name||row.Title||row.title||id;
   return {id:String(id),name:text(title),type:row.type||imdbTitleType(row['Title Type']||requestedType),
    year:Number(row.Year||row.year)||undefined};
  });
 }else if(/(^|[\r\n])(?:position|const|title|imdb id|id)(?:,|\t)/i.test(str)){
  const rows=rowsFromCSV(str);
  const header=rows.shift()?.map(s=>s.trim().toLowerCase())||[];
  const col=(...options)=>header.findIndex(x=>options.includes(x));
  const idCol=col('const','imdb id','imdb_id','id','url');
  const titleCol=col('title','name','original title');
  const typeCol=col('title type','type');
  const yearCol=col('year','release year');
  if(idCol<0)throw Error('CSV sem coluna Const, IMDb ID ou URL.');
  result=rows.map(row=>{
   const rawId=row[idCol]||'';
   const id=(rawId.match(/tt\d{6,11}/)||[])[0]||rawId;
   return {id,name:text(row[titleCol]||id),type:typeCol>=0?imdbTitleType(row[typeCol]):requestedType,
    year:yearCol>=0?Number(row[yearCol])||undefined:undefined};
  });
 }else{
  result=str.split(/[\r\n,;]+/).map(raw=>{
   const row=raw.trim();
   const match=row.match(/tt\d{6,11}/);
   const id=match?.[0];
   const name=id?text(row.replace(/https?:\/\/\S+/,'').replace(id,'').replace(/^[\s|:-]+/,'').trim())||id:row;
   return {id,name,type:requestedType};
  });
 }
 const ids=new Set(),filtered=[];
 for(const item of result){
  const id=(String(item.id||'').match(/tt\d{6,11}/)||[])[0];
  if(!id||!imdbId.test(id))continue;
  const type=item.type==='series'?'series':'movie';
  if(requestedType!=='both'&&type!==requestedType||ids.has(type+'::'+id))continue;
  ids.add(type+'::'+id);
  filtered.push({id,name:text(item.name)||id,type,year:item.year||undefined});
  if(filtered.length>MAX_ITEMS)throw Error('Importe até '+MAX_ITEMS+' títulos por catálogo.');
 }
 if(!filtered.length)throw Error('Nenhum ID IMDb válido deste tipo foi encontrado.');
 return filtered;
}
export function normalizeTraktItems(rows,requestedType){
 if(!Array.isArray(rows))throw Error('O Trakt retornou uma lista inválida.');
 const seen=new Set(),output=[];
 for(const row of rows){
  const media=row?.movie||row?.show;
  const type=row?.movie?'movie':row?.show?'series':null;
  if(!media||(requestedType!=='both'&&type!==requestedType))continue;
  const id=String(media.ids?.imdb||'');
  if(!imdbId.test(id)||seen.has(id))continue;
  seen.add(id);
  output.push({id,type,name:text(media.title)||id,year:media.year||undefined});
  if(output.length>=MAX_ITEMS)break;
 }
 return output;
}
export async function fetchTraktList(rawUrl,type,{clientId=process.env.TRAKT_CLIENT_ID,
  fetchImpl=globalThis.fetch}={}){
 if(!['movie','series','both'].includes(type))throw Error('Selecione Filmes, Séries ou Ambos.');
 const {url,user,slug}=validateListURL('trakt',rawUrl);
 if(!clientId||!String(clientId).trim())
  throw Error('Para importar Trakt, configure TRAKT_CLIENT_ID no servidor. Nenhuma chave foi adicionada automaticamente.');
 const metas=[],seen=new Set();let pages=0;
 for(let page=1;page<=Math.ceil(MAX_ITEMS/100);page++){
  const endpoint='https://api.trakt.tv/users/'+encodeURIComponent(user)+'/lists/'+
    encodeURIComponent(slug)+'/items?extended=full&page='+page+'&limit=100';
  const response=await fetchImpl(endpoint,{
   signal:AbortSignal.timeout(10000),
   headers:{'trakt-api-version':'2','trakt-api-key':String(clientId).trim(),
    'Accept':'application/json'},redirect:'error'
  });
  if(!response.ok)throw Error('Trakt retornou HTTP '+response.status+'. Confira se a lista é pública e o Client ID está correto.');
  const part=await response.json();
  if(!Array.isArray(part))throw Error('Resposta do Trakt não contém itens válidos.');
  for(const media of normalizeTraktItems(part,type)){
   if(!seen.has(media.id)){seen.add(media.id);metas.push(media);}
  }
  pages++;
  if(part.length<100||metas.length>=MAX_ITEMS)break;
 }
 return {source:'trakt',url,metas,refreshedAt:new Date().toISOString(),pages};
}
