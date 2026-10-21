import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveDataDir, readJsonFile, writeAtomicJsonFile } from '../config/json-store.js';

const DATA=resolveDataDir();
const FILE=path.join(DATA,'studio-import.json');
const BACKUPS=path.join(DATA,'studio-import-backups');
const MAX_BYTES=32*1024*1024;
const validId=id=>typeof id==='string'&&id.length>0&&id.length<200&&!/[<>\x00-\x1f]/.test(id);
const read=(pathname,defaultValue=null)=>readJsonFile(pathname,defaultValue);
const write=(file,data)=>writeAtomicJsonFile(file,data);
function parseJsonInput(raw){
  if(typeof raw!=='string')return raw;
  return JSON.parse(raw.replace(/^\uFEFF/,'').trim());
}
function slugId(prefix,text,index=0){
  const base=String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48);
  return (base||prefix)+'-'+(index+1);
}
function isCatalogSourceEntry(item){
  return Boolean(item&&typeof item==='object'&&!Array.isArray(item)&&
    (item.catalogId||item.catalog_id||(item.addonId&&item.type)));
}
function isMediaMetaEntry(item){
  if(!item||typeof item!=='object'||Array.isArray(item))return false;
  if(Array.isArray(item.folders)||Array.isArray(item.items)||
     Array.isArray(item.catalogSources)||Array.isArray(item.sources))return false;
  if(isCatalogSourceEntry(item))return false;
  const rawId=item.id??item.imdb_id??item.tmdbId;
  const rawName=item.name??item.title;
  return Boolean(rawId!==undefined&&rawId!==null&&String(rawId).trim()&&
    typeof rawName==='string'&&rawName.trim());
}
function looksLikeCollectionObject(item){
  if(!item||typeof item!=='object'||Array.isArray(item))return false;
  const hasTitle=typeof item.title==='string'||typeof item.name==='string'||validId(item.id);
  return hasTitle&&(Array.isArray(item.folders)||Array.isArray(item.items));
}
function looksLikeCollectionList(val){
  if(Array.isArray(val))return val.length>0&&val.every(looksLikeCollectionObject);
  if(!val||typeof val!=='object')return false;
  if(Array.isArray(val.collections)||Array.isArray(val.collections_json)||
     Array.isArray(val.nuvioCollections)||Array.isArray(val.data?.collections)||
     Array.isArray(val.groups)||Array.isArray(val.data?.groups))return true;
  if(Array.isArray(val.items)&&!(typeof val.name==='string'||typeof val.title==='string')&&
     val.items.length>0&&val.items.every(looksLikeCollectionObject))return true;
  return looksLikeCollectionObject(val);
}
function looksLikeCatalogManifest(val){
  if(Array.isArray(val))return val.length>0&&val.every(item=>item&&typeof item==='object'&&!Array.isArray(item.folders)&&!Array.isArray(item.items)&&(typeof item.type==='string'||typeof item.name==='string'));
  if(!val||typeof val!=='object')return false;
  return Array.isArray(val.catalogs)||Array.isArray(val.manifest?.catalogs);
}
export function validateCollectionImportStructure(raw,kind='collections'){
  let data;
  try{data=parseJsonInput(raw);}
  catch{return {valid:false,error:'JSON inválido: erro de sintaxe ao ler o conteúdo.'};}
  if(!data||typeof data!=='object'){
    return {valid:false,error:'Estrutura de JSON inválida: esperado um objeto ou lista com as chaves obrigatórias ("name" e "items"/"folders").'};
  }
  if(kind==='catalogs'&&looksLikeCatalogManifest(data)&&!looksLikeCollectionList(data)){
    const manifestObj=data?.manifest&&typeof data.manifest==='object'?data.manifest:data;
    const catalogs=Array.isArray(data)?data:manifestObj?.catalogs;
    if(!Array.isArray(catalogs)||catalogs.length===0){
      return {valid:false,error:'Estrutura de JSON inválida: a chave obrigatória "catalogs" deve conter ao menos um catálogo.'};
    }
    for(let i=0;i<catalogs.length;i++){
      const c=catalogs[i];
      if(!c||typeof c!=='object'||!(c.id||typeof c.id==='number')||!['movie','series','anime','other'].includes(c.type)||typeof (c.name||c.title)!=='string'){
        return {valid:false,error:`Estrutura de JSON inválida no catálogo #${i+1}: chaves obrigatórias "id", "type" e "name" ausentes ou inválidas.`};
      }
    }
    return {valid:true};
  }
  if(!looksLikeCollectionList(data)&&looksLikeCatalogManifest(data)){
    return validateCollectionImportStructure(data,'catalogs');
  }
  const list=extractCollectionsArray(data);
  if(!Array.isArray(list)||list.length===0){
    const missing=[];
    if(!Array.isArray(data)){
      if(typeof data.name!=='string'&&typeof data.title!=='string')missing.push('"name" (ou "title")');
      if(!Array.isArray(data.items)&&!Array.isArray(data.folders)&&!Array.isArray(data.collections))missing.push('"items" (ou "folders")');
    }
    return {
      valid:false,
      error:missing.length
        ?`Estrutura de JSON inválida para coleções: chaves obrigatórias ausentes (${missing.join(' e ')}).`
        :'Estrutura de JSON inválida: informe entre 1 e 300 coleções contendo as chaves "name" e "items" (ou "folders").'
    };
  }
  for(let i=0;i<list.length;i++){
    const col=list[i];
    if(!col||typeof col!=='object'||Array.isArray(col)){
      return {valid:false,error:`Estrutura de JSON inválida: a coleção #${i+1} deve ser um objeto.`};
    }
    const colName=typeof col.name==='string'?col.name.trim():(typeof col.title==='string'?col.title.trim():'');
    const hasItems=Array.isArray(col.items)||Array.isArray(col.folders);
    if(!colName&&!hasItems){
      return {valid:false,error:`Estrutura de JSON inválida na coleção #${i+1}: chaves obrigatórias "name" e "items" (ou "folders") ausentes.`};
    }
    if(!colName){
      return {valid:false,error:`Estrutura de JSON inválida na coleção #${i+1}: chave obrigatória "name" (ou "title") ausente ou vazia.`};
    }
    if(!hasItems){
      return {valid:false,error:`Estrutura de JSON inválida na coleção "${colName}": chave obrigatória "items" (ou "folders") ausente ou não é uma lista.`};
    }
  }
  return {valid:true};
}
function normalizedCatalog(raw,allowEmpty=false){
  const value=parseJsonInput(raw);
  const manifestObj=value?.manifest&&typeof value.manifest==='object'?value.manifest:value;
  const catalogs=Array.isArray(value)?value:manifestObj?.catalogs;
  if(!Array.isArray(catalogs)||(!allowEmpty&&catalogs.length===0)||catalogs.length>10000)
    throw Error('O JSON de catálogos precisa conter uma lista catalogs não vazia.');
  const filtered=catalogs.filter(c=>c&&validId(typeof c.id==='number'?String(c.id):c.id)&&['movie','series','anime','other'].includes(c.type)&&typeof (c.name||c.title)==='string')
    .map(c=>({...c,id:typeof c.id==='number'?String(c.id):c.id,name:typeof c.name==='string'?c.name:c.title}));
  if(filtered.length!==catalogs.length)throw Error('Há catálogos sem ID, tipo ou nome válidos.');
  const baseId=validId(manifestObj?.id)?manifestObj.id:'catalogs.imported';
  const unique=new Set(filtered.map(c=>(c.addonId||baseId)+'::'+c.type+'::'+c.id));
  if(unique.size!==filtered.length)throw Error('O JSON de catálogos contém IDs duplicados.');
  return {id:baseId,name:typeof manifestObj?.name==='string'?manifestObj.name.slice(0,100):'Catálogos importados',catalogs:structuredClone(filtered)};
}
function extractCollectionsArray(unpack){
  if(Array.isArray(unpack))return unpack;
  if(!unpack||typeof unpack!=='object')return null;
  const candidate=unpack.collections||unpack.collections_json||unpack.nuvioCollections||
    unpack.data?.collections||unpack.groups||unpack.data?.groups;
  if(Array.isArray(candidate))return candidate;
  if(Array.isArray(unpack.items)&&!(typeof unpack.name==='string'||typeof unpack.title==='string')&&
     unpack.items.length>0&&unpack.items.every(looksLikeCollectionObject))return unpack.items;
  if((Array.isArray(unpack.folders)||Array.isArray(unpack.items))&&
     (typeof unpack.title==='string'||typeof unpack.name==='string'||validId(unpack.id)))
    return [unpack];
  return null;
}
function normalizedCollections(raw,allowEmpty=false){
  const unpack=parseJsonInput(raw);
  const rawList=extractCollectionsArray(unpack);
  if(!Array.isArray(rawList)||(!allowEmpty&&!rawList.length)||rawList.length>300)
    throw Error('O JSON de coleções deve conter entre 1 e 300 coleções.');
  let folders=0,sources=0;
  const ids=new Set();
  const list=[];
  const generatedCatalogs=[];
  for(let gi=0;gi<rawList.length;gi++){
    const rawGroup=rawList[gi];
    if(!rawGroup||typeof rawGroup!=='object'||(!Array.isArray(rawGroup.folders)&&!Array.isArray(rawGroup.items)))
      throw Error('Coleção inválida: ID, título ou pastas ausentes.');
    const g=structuredClone(rawGroup);
    if(typeof g.title!=='string'&&typeof g.name==='string')g.title=g.name;
    if(typeof g.id==='number')g.id=String(g.id);
    else if((g.id===undefined||g.id===null||g.id==='')&&typeof g.title==='string'&&g.title.trim())
      g.id=slugId('collection',g.title,gi);
    if(!validId(g.id)||typeof g.title!=='string'||!g.title.trim())
      throw Error('Coleção inválida: ID, título ou pastas ausentes.');
    if(ids.has(g.id))throw Error('Há coleções com IDs duplicados.');
    ids.add(g.id);
    if(!Array.isArray(g.folders)&&Array.isArray(g.items)){
      const rawItems=g.items;
      delete g.items;
      if(rawItems.length>0&&rawItems.every(isCatalogSourceEntry)){
        g.folders=[{id:slugId('folder',g.title,0),title:g.title,catalogSources:rawItems}];
      }else if(rawItems.length>0&&rawItems.every(isMediaMetaEntry)){
        const inferredType=rawItems.some(m=>m.type==='series')&&!rawItems.some(m=>m.type==='movie')?'series':'movie';
        const catId=('studio_'+g.id).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
        const metas=rawItems.map(m=>({
          id:String(m.id??m.imdb_id??m.tmdbId).trim(),
          name:String(m.name??m.title).trim(),
          type:m.type==='series'?'series':'movie',
          ...(typeof m.poster==='string'&&m.poster.startsWith('https://')?{poster:m.poster}:{}),
          ...(typeof m.description==='string'?{description:m.description}:{})
        }));
        generatedCatalogs.push({
          id:catId,
          type:inferredType,
          name:g.title,
          addonId:'community.streamaggregator.unified',
          manual:true,
          metas
        });
        g.folders=[{
          id:slugId('folder',g.title,0),
          title:g.title,
          catalogSources:[{
            provider:'addon',
            addonId:'community.streamaggregator.unified',
            type:inferredType,
            catalogId:catId,
            title:g.title,
            genre:null
          }]
        }];
      }else{
        g.folders=rawItems;
      }
    }
    folders+=g.folders.length;
    const normalizedFolders=[];
    for(let fi=0;fi<g.folders.length;fi++){
      const rawFolder=g.folders[fi];
      if(!rawFolder||typeof rawFolder!=='object')
        throw Error('Pasta inválida: ID ou título ausente.');
      const f=structuredClone(rawFolder);
      if(typeof f.title!=='string'&&typeof f.name==='string')f.title=f.name;
      if(typeof f.id==='number')f.id=String(f.id);
      else if((f.id===undefined||f.id===null||f.id==='')&&typeof f.title==='string'&&f.title.trim())
        f.id=slugId('folder',f.title,fi);
      if(!validId(f.id)||typeof f.title!=='string'||!f.title.trim())
        throw Error('Pasta inválida: ID ou título ausente.');
      const ss=f.catalogSources!==undefined?f.catalogSources:
        (f.sources!==undefined?f.sources:(f.items!==undefined?f.items:[]));
      if(!Array.isArray(ss))throw Error('Lista de catálogos da pasta inválida.');
      f.catalogSources=ss.map(s=>{
        if(!s||typeof s!=='object')return s;
        const copy={...s};
        if(!copy.catalogId&&copy.catalog_id)copy.catalogId=String(copy.catalog_id);
        if(!copy.addonId&&copy.addon_id)copy.addonId=String(copy.addon_id);
        return copy;
      });
      if(f.sources!==undefined)delete f.sources;
      if(f.items!==undefined)delete f.items;
      sources+=f.catalogSources.length;
      normalizedFolders.push(f);
    }
    g.folders=normalizedFolders;
    list.push(g);
  }
  if(folders>6000||sources>30000)throw Error('Arquivo excede o limite de pastas ou fontes.');
  return {collections:list,generatedCatalogs,stats:{groups:list.length,folders,sources}};
}
export function validateStudioImport(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Importação inválida.');
  if(Buffer.byteLength(JSON.stringify(input),'utf8')>MAX_BYTES)throw Error('Os JSONs excedem 32 MB.');
  const allowEmpty=input.allowEmpty===true;
  const manifest=normalizedCatalog(input.catalogs,allowEmpty);
  const parsed=normalizedCollections(input.collections,allowEmpty);
  return {manifest,collections:parsed.collections,stats:parsed.stats};
}
export function loadStudioImport(){return read(FILE,null);}
export function getStudioImportStatus(){
  const saved=loadStudioImport();
  return saved?{
    ready:true,revision:saved.revision,importedAt:saved.importedAt,
    catalogName:saved.manifest?.name,stats:saved.stats,
    source:'Arquivos JSON importados manualmente (sem sincronização)'
  }:{ready:false,revision:0,importedAt:null,source:'Aguardando importação manual'};
}
export function saveStudioImport(input,expectedRevision){
  const valid=validateStudioImport(input);
  const current=loadStudioImport();
  if(expectedRevision !== (current?.revision||0)){
    const err=Error('Outra importação foi realizada. Atualize a página antes de substituir os arquivos.');
    err.status=409;throw err;
  }
  const next={...valid,revision:(current?.revision||0)+1,
    importedAt:new Date().toISOString()};
  if(current){
    fs.mkdirSync(BACKUPS,{recursive:true});
    const backupFile=path.join(BACKUPS,Date.now()+'-'+crypto.randomBytes(3).toString('hex')+'.json');
    write(backupFile,current);
    const files=fs.readdirSync(BACKUPS).filter(f=>f.endsWith('.json')).sort();
    for(const file of files.slice(0,-12))fs.unlinkSync(path.join(BACKUPS,file));
  }
  write(FILE,next);
  return getStudioImportStatus();
}

/**
 * Editor universal: bibliotecas e coleções independentes.
 * A importação é opcional, e catálogos e coleções podem ser trazidos
 * separadamente, de qualquer fornecedor com JSON compatível.
 */
export function previewWorkspaceChange(raw){
  const current=loadStudioImport();
  const mode=raw?.mode||'append';
  if(!['append','replace','new'].includes(mode))throw Error('Modo inválido');
  let rawCollections=raw?.collections==null?null:parseJsonInput(raw.collections);
  let rawCatalogs=raw?.catalogs==null?null:parseJsonInput(raw.catalogs);
  if(rawCollections!=null&&rawCatalogs==null){
    if(!looksLikeCollectionList(rawCollections)&&looksLikeCatalogManifest(rawCollections)){
      rawCatalogs=rawCollections;
      rawCollections=null;
    }else if(looksLikeCollectionList(rawCollections)&&looksLikeCatalogManifest(rawCollections)){
      rawCatalogs=rawCollections.manifest||rawCollections;
    }
  }else if(rawCatalogs!=null&&rawCollections==null){
    if(!looksLikeCatalogManifest(rawCatalogs)&&looksLikeCollectionList(rawCatalogs)){
      rawCollections=rawCatalogs;
      rawCatalogs=null;
    }else if(looksLikeCatalogManifest(rawCatalogs)&&looksLikeCollectionList(rawCatalogs)){
      rawCollections=rawCatalogs;
    }
  }
  if(rawCollections!=null&&mode!=='new'){
    const structCheck=validateCollectionImportStructure(rawCollections,'collections');
    if(!structCheck.valid)throw Error(structCheck.error);
  }
  if(rawCatalogs!=null&&rawCollections==null&&mode!=='new'){
    const structCheck=validateCollectionImportStructure(rawCatalogs,'catalogs');
    if(!structCheck.valid)throw Error(structCheck.error);
  }
  const hasBoth=rawCollections!=null&&rawCatalogs!=null;
  const parsedCollections=rawCollections==null?null:normalizedCollections(rawCollections,mode==='new'||hasBoth);
  const incomingCollections=parsedCollections?.collections||null;
  let incomingManifest=rawCatalogs==null?null:normalizedCatalog(rawCatalogs,mode==='new'||hasBoth);
  if(parsedCollections?.generatedCatalogs?.length){
    const genCats=parsedCollections.generatedCatalogs;
    incomingManifest=incomingManifest
      ?{...incomingManifest,catalogs:[...incomingManifest.catalogs,...genCats]}
      :{id:'nuvio.studio',name:'Catálogos importados',catalogs:genCats};
  }
  if(!incomingManifest&&!incomingCollections&&mode!=='new')throw Error('Escolha um JSON de coleções ou de catálogos.');
  const base=mode==='new'?{
    manifest:{id:'studio.local',name:'Catálogos do meu Studio',catalogs:[]},collections:[]
  }:(current||{
    manifest:{id:'studio.local',name:'Catálogos do meu Studio',catalogs:[]},collections:[]
  });
  const nextCollections=mode==='new'?[]:structuredClone(base.collections);
  let renamed=0,added=0;
  if(incomingCollections){
    if(mode==='replace')nextCollections.splice(0,nextCollections.length,...incomingCollections);
    else {
      const groupIDs=new Set(nextCollections.map(g=>g.id));
      const folderIDs=new Set(nextCollections.flatMap(g=>(g.folders||[]).map(f=>f.id)));
      for(const original of incomingCollections){
        const g=structuredClone(original);
        if(groupIDs.has(g.id)){
          g.id='studio-import-'+crypto.randomBytes(7).toString('hex');renamed++;
        }
        groupIDs.add(g.id);
        for(const f of g.folders||[]){
          if(folderIDs.has(f.id)){
            f.id='studio-import-'+crypto.randomBytes(7).toString('hex');renamed++;
          }
          folderIDs.add(f.id);
        }
        nextCollections.push(g);added++;
      }
    }
  }
  let mergedManifest=structuredClone(base.manifest);
  if(incomingManifest){
    if(mode==='replace'&&rawCatalogs!=null)mergedManifest=incomingManifest;
    else{
      const byKey=new Map(mergedManifest.catalogs.map(c=>[(c.addonId||mergedManifest.id)+'::'+c.type+'::'+c.id,c]));
      for(const c of incomingManifest.catalogs){
        const entry={...c,addonId:c.addonId||incomingManifest.id};
        byKey.set(entry.addonId+'::'+entry.type+'::'+entry.id,entry);
      }
      mergedManifest={...mergedManifest,catalogs:[...byKey.values()]};
    }
  }
  const payload={catalogs:mergedManifest,collections:nextCollections,allowEmpty:true};
  const checked=validateStudioImport(payload);
  return {payload,stats:{...checked.stats,catalogs:checked.manifest.catalogs.length,
    newCollections:added,renamedIds:renamed},expectedRevision:current?.revision||0,mode};
}
export function applyWorkspaceChange(payload,expectedRevision){
  return saveStudioImport({...payload,allowEmpty:true},expectedRevision);
}
