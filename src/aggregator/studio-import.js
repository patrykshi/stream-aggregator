import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA=process.env.DATA_DIR||path.resolve('data');
const FILE=path.join(DATA,'studio-import.json');
const BACKUPS=path.join(DATA,'studio-import-backups');
const MAX_BYTES=32*1024*1024;
const validId=id=>typeof id==='string'&&id.length>0&&id.length<200&&!/[<>\x00-\x1f]/.test(id);
function read(pathname,defaultValue=null){try{return JSON.parse(fs.readFileSync(pathname,'utf8'));}catch{return defaultValue;}}
function write(file,data){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function normalizedCatalog(raw,allowEmpty=false){
  const value=typeof raw==='string'?JSON.parse(raw):raw;
  const catalogs=Array.isArray(value)?value:value?.catalogs;
  if(!Array.isArray(catalogs)||(!allowEmpty&&catalogs.length===0)||catalogs.length>10000)
    throw Error('O JSON de catálogos precisa conter uma lista catalogs não vazia.');
  const filtered=catalogs.filter(c=>c&&validId(c.id)&&['movie','series','anime','other'].includes(c.type)&&typeof c.name==='string');
  if(filtered.length!==catalogs.length)throw Error('Há catálogos sem ID, tipo ou nome válidos.');
  const unique=new Set(filtered.map(c=>(c.addonId||value?.id||'catalogs.imported')+'::'+c.type+'::'+c.id));
  if(unique.size!==filtered.length)throw Error('O JSON de catálogos contém IDs duplicados.');
  const id=validId(value?.id)?value.id:'catalogs.imported';
  return {id,name:typeof value?.name==='string'?value.name.slice(0,100):'Catálogos importados',catalogs:structuredClone(filtered)};
}
function normalizedCollections(raw,allowEmpty=false){
  const unpack=typeof raw==='string'?JSON.parse(raw):raw;
  const list=Array.isArray(unpack)?unpack:
    (unpack?.collections||unpack?.collections_json||unpack?.nuvioCollections||unpack?.data?.collections);
  if(!Array.isArray(list)||(!allowEmpty&&!list.length)||list.length>300)throw Error('O JSON de coleções deve conter entre 1 e 300 coleções.');
  let folders=0,sources=0;
  const ids=new Set();
  for(const g of list){
    if(!g||!validId(g.id)||typeof g.title!=='string'||!Array.isArray(g.folders))throw Error('Coleção inválida: ID, título ou pastas ausentes.');
    if(ids.has(g.id))throw Error('Há coleções com IDs duplicados.');
    ids.add(g.id);folders+=g.folders.length;
    for(const f of g.folders){
      if(!f||!validId(f.id)||typeof f.title!=='string')throw Error('Pasta inválida: ID ou título ausente.');
      const ss=f.catalogSources||f.sources||[];
      if(!Array.isArray(ss))throw Error('Lista de catálogos da pasta inválida.');
      sources+=ss.length;
    }
  }
  if(folders>6000||sources>30000)throw Error('Arquivo excede o limite de pastas ou fontes.');
  return {collections:structuredClone(list),stats:{groups:list.length,folders,sources}};
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
  const incomingCollections=raw?.collections==null?null:normalizedCollections(raw.collections,true).collections;
  const incomingManifest=raw?.catalogs==null?null:normalizedCatalog(raw.catalogs,true);
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
    if(mode==='replace')mergedManifest=incomingManifest;
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
