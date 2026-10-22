import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { saveDataUrlArtwork, getStudioShapeSpec, applyUploadedMark } from './artwork-studio.js';

const PYTHON_BRIDGE = process.env.PYTHON_COVER_BRIDGE || '/app/python-cover/bridge.py';

export function pythonCoverStatus() {
  return { configured: process.env.PYTHON_COVER_ENABLED === '1',
    engine: 'Criador de Capas Python · TMDB (Pillow)',
    note: 'Utiliza o render.py instalado no PC; a imagem é gravada no Artwork Studio.' };
}

export function runPythonCover(payload, {spawnImpl=spawn, timeoutMs=16000}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawnImpl('python3',[PYTHON_BRIDGE],{
      stdio:['pipe','pipe','pipe'],
      env:{PYTHON_COVER_SOURCE:process.env.PYTHON_COVER_SOURCE || '/app/python-legacy',
        PATH:process.env.PATH || '/usr/bin:/bin'}
    });
    let stdout='',stderr='',settled=false;
    const fail=e=>{if(!settled){settled=true;clearTimeout(timer);reject(e);}};
    const timer=setTimeout(()=>{child.kill('SIGKILL');fail(Error('O criador Python excedeu o tempo de renderização.'));},timeoutMs);
    child.on('error',e=>fail(Error('Criador Python indisponível: '+e.message)));
    child.stdout.on('data',bytes=>{stdout+=bytes.toString('utf8');if(stdout.length>12_000_000){child.kill('SIGKILL');fail(Error('Resposta Python grande demais.'));}});
    child.stderr.on('data',bytes=>{stderr+=bytes.toString('utf8').slice(0,2500)});
    child.on('close',code=>{
      if(settled)return;
      clearTimeout(timer);
      if(code!==0)return fail(Error('Criador Python não conseguiu renderizar a capa. Verifique a instalação do render.py.'));
      try{const bytes=Buffer.from(JSON.parse(stdout).data,'base64');settled=true;resolve(bytes)}
      catch{fail(Error('Resposta inválida do criador Python.'));}
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function composePythonArtwork(input,{getBackground,runner=runPythonCover}={}) {
  if(!pythonCoverStatus().configured)throw Object.assign(Error('Motor Python não configurado neste ambiente.'),{status:503});
  const spec=getStudioShapeSpec(input?.shape);
  const backgroundUrl=Array.isArray(input?.images) ? input.images[0] : undefined;
  const bg=backgroundUrl && getBackground ? await getBackground(backgroundUrl) : null;
  const result=await runner({shape:spec.key,title:input?.hideTitle?'':String(input?.title||'').slice(0,75),
    titleColor:input?.titleColor||'#d4ab54',fontSize:input?.fontSize||95,
    letterSpacing:input?.letterSpacing||12,showDivider:input?.showDivider!==false,
    background:bg?.toString('base64') || ''});
  if(!Buffer.isBuffer(result)||result.length<100)throw Error('A saída Python não contém uma imagem válida.');
  let normalized=await sharp(result,{limitInputPixels:45_000_000})
   .resize(spec.width,spec.height,{fit:'cover'}).webp({quality:87}).toBuffer();
  normalized=await applyUploadedMark(normalized,input?.logoDataUrl,spec.width,spec.height);
  const dataUrl='data:image/webp;base64,'+normalized.toString('base64');
  if(input?.save===false)return {ok:true,provider:'python-local',shape:spec.key,tileShape:spec.tileShape,
    width:spec.width,height:spec.height,dataUrl};
  return {ok:true,provider:'python-local',...(await saveDataUrlArtwork(dataUrl,
    {shape:spec.key,title:input?.title||'',mode:'python-local'})),dataUrl};
}
