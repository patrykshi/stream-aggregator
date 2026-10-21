// Busca controlada de páginas Stremio sem confundir tamanho de página com total.
// Aceita provedores com skip em blocos de 20, 100 ou outros valores observáveis.
export const MAX_CATALOG_ITEMS=5000; // teto operacional por resposta, NÃO limite total do catálogo
export const MAX_CATALOG_PAGES=100;

export function distinctCatalogMetas(rows){
 const seen=new Set(),out=[];
 for(const m of rows||[]){
  if(!m||typeof m!=='object')continue;
  const k=m.id?String(m.type||'')+'::'+String(m.id):null;
  if(k&&seen.has(k))continue;
  if(k)seen.add(k);
  out.push(m);
 }
 return out;
}

export async function collectCatalogPages(first,{
 fetchPage,hasSkip=true,maxItems=MAX_CATALOG_ITEMS,maxPages=MAX_CATALOG_PAGES,
 budgetMs=14000,now=()=>Date.now()
}={}){
 const items=distinctCatalogMetas(first);
 if(!hasSkip||!items.length||typeof fetchPage!=='function')return items;
 const seen=new Set(items.filter(x=>x.id).map(x=>String(x.type||'')+'::'+String(x.id)));
 const firstSize=first.length;
 let stride=firstSize,skip=stride,attempts=0,triedWide=false;
 const started=now();
 while(items.length<maxItems&&attempts<maxPages&&now()-started<budgetMs){
  attempts++;
  let page;
  try{page=await fetchPage(skip);}catch{break;}
  if(!Array.isArray(page)||!page.length)break;
  const novel=[];
  for(const item of page){
   if(!item||typeof item!=='object')continue;
   const key=item.id?String(item.type||'')+'::'+String(item.id):null;
   if(key&&seen.has(key))continue;
   if(key)seen.add(key);
   novel.push(item);
  }
  if(!novel.length){
   // Alguns addons ignoram skip=20/40/... mas avançam com skip=100.
   if(!triedWide&&stride<100&&skip<100){
    triedWide=true;stride=100;skip=100;continue;
   }
   break;
  }
  items.push(...novel.slice(0,Math.max(0,maxItems-items.length)));
  skip+=stride;
  // Uma página curta costuma indicar o final da lista nessa origem.
  if(page.length<firstSize&&stride===firstSize)break;
 }
 return items;
}
