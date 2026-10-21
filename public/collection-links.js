/* Resolução de catálogos em coleções importadas.
 * Usa identidades originais do manifesto, sem modificar as coleções. */
((root)=>{
 'use strict';
 const BRIDGE='community.streamaggregator.unified';
 const key=(addonId,type,id)=>[addonId||'',type||'',id||''].join('::');
 const good=p=>p?.enabled!==false&&p?.status==='ok'&&
  Array.isArray(p.catalogs)&&!!p.url;
 function createResolver({catalogs=[],addons=[],loaded=false}={}){
  const local=new Map(),original=new Map(),providerById=new Map(),providerByUrl=new Map(),
    advertised=new Map();
  for(const p of addons){
   if(p?.addonId)providerById.set(p.addonId,p);
   if(p?.url)providerByUrl.set(p.url,p);
   for(const c of p.catalogs||[]){
    if(!['movie','series'].includes(c.type)||!c.id)continue;
    advertised.set(key(p.addonId,c.type,c.id),{catalog:c,provider:p});
   }
  }
  for(const c of catalogs){
   if(!c?.id||!['movie','series'].includes(c.type))continue;
   local.set(key(c.addonId||'nuvio.studio',c.type,c.id),c);
   if(c.sourceAddonId&&c.sourceId)
    original.set(key(c.sourceAddonId,c.type,c.sourceId),c);
  }
  function resolve(source){
   const id=source?.catalogId||source?.catalog_id||'';
   const type=source?.type;
   if(!['movie','series'].includes(type)||!id)
    return {status:'missing',label:String(id||'Catálogo sem identificação'),reason:'Fonte sem ID ou tipo válido.'};
   const identity=key(source.addonId,type,id);
   const direct=local.get(identity),fromOrigin=original.get(identity);
   const localMatch=direct||fromOrigin;
   const origin=advertised.get(identity);
   if(direct?.manual===true||direct&&!direct.sourceUrl&&!direct.sourceAddonId&&direct.metas)
    return {status:'ready',source:'created',label:direct.name||id,catalog:direct,
     reason:'Catálogo próprio disponível na biblioteca do Hub.'};
   const p=origin?.provider||
     (localMatch?.sourceUrl&&providerByUrl.get(localMatch.sourceUrl))||
     providerById.get(source.addonId);
   const rawCatalog=origin?.catalog||
     (p&&localMatch?.sourceId?(p.catalogs||[]).find(c=>c.type===type&&c.id===localMatch.sourceId):null);
   if(p&&good(p)&&rawCatalog){
    return {status:'ready',source:localMatch?'hub-and-addon':'addon',
      label:localMatch?.name||rawCatalog.name||id,
      provider:p.name||p.addonId||'Addon',catalog:localMatch||null,
      rawId:rawCatalog.id,reason:'Catálogo anunciado no manifesto do addon ativo.'};
   }
   if(!loaded){
    return {status:'pending',label:source.title||source.catalogName||localMatch?.name||id,
     reason:'Aguardando a consulta do inventário de addons.'};
   }
   if(p&&!good(p)){
    return {status:'missing',label:source.title||source.catalogName||localMatch?.name||id,
     reason:'O addon de origem está desativado ou seu manifesto está indisponível.'};
   }
   if(p&&!rawCatalog){
    return {status:'missing',label:source.title||source.catalogName||localMatch?.name||id,
     reason:'O catálogo não aparece mais no manifesto do addon original.'};
   }
   if(direct&&!direct.sourceUrl&&!direct.sourceAddonId){
    return {status:'ready',source:'created',label:direct.name||id,catalog:direct,
     reason:'Catálogo disponível na biblioteca do Hub.'};
   }
   return {status:'missing',label:source?.title||source?.catalogName||id,
    reason:'Nenhum catálogo correspondente foi encontrado na biblioteca ou nos addons ativos.'};
  }
  function candidates(type){
   const options=[],seen=new Set();
   for(const c of catalogs){
    if(c.type!==type)continue;
    const result=resolve({addonId:c.addonId||'nuvio.studio',type,catalogId:c.id});
    if(result.status!=='ready')continue;
    const k=key(c.addonId||'nuvio.studio',type,c.id);if(seen.has(k))continue;
    seen.add(k);
    options.push({key:k,type,name:c.name||c.id,provider:result.provider||'Criado no Hub',
      from:'hub',catalog:c});
   }
   for(const p of addons){
    if(!good(p))continue;
    for(const c of p.catalogs){
     if(c.type!==type)continue;
     const k=key(p.addonId,type,c.id);
     if(seen.has(k))continue;seen.add(k);
     options.push({key:k,type,name:c.name||c.id,provider:p.name||p.addonId,
      from:'addon',addon:p,catalog:c});
    }
   }
   return options;
  }
  function summary(collections){
   const result={total:0,ready:0,missing:0,pending:0,folders:0,affectedFolders:0,byGroup:{}};
   for(const g of collections||[]){
    const stats={total:0,ready:0,missing:0,pending:0,folders:0,affectedFolders:0};
    for(const f of g.folders||[]){
     stats.folders++;result.folders++;
     let affected=false;
     for(const src of f.catalogSources||f.sources||[]){
      const status=resolve(src).status;
      stats.total++;result.total++;stats[status]++;result[status]++;
      if(status==='missing')affected=true;
     }
     if(affected){stats.affectedFolders++;result.affectedFolders++;}
    }
    result.byGroup[g.id]=stats;
   }
   return result;
  }
  return {resolve,candidates,summary};
 }
 // Reordena apenas irmãos, mantendo os objetos e vínculos originais intactos.
 // O destino indica a metade superior (antes) ou inferior (depois) do slot.
 function reorder(array,from,to,after=false){
  if(!Array.isArray(array)||!Number.isInteger(from)||!Number.isInteger(to)||
     from<0||to<0||from>=array.length||to>=array.length)return false;
  let insertion=to+(after?1:0);
  if(from<insertion)insertion--;
  if(from===insertion)return false;
  const [entry]=array.splice(from,1);
  array.splice(insertion,0,entry);
  return true;
 }
 root.NuvioCollectionLinks=Object.freeze({createResolver,reorder});
})(globalThis);
