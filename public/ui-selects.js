/* Menus suspensos do Nuvio Hub: mesma experiência visual em desktop e mobile.
 * Select nativo permanece como fonte de verdade para formulários e eventos. */
(()=>{
 'use strict';
 let popup=null,owner=null,button=null,active=-1;
 const safe=v=>String(v||'');
 function close(restore=false){
  if(popup){popup.remove();popup=null;}
  if(owner){owner.closest('.nuvio-select-shell')?.querySelector('.nuvio-select-toggle')
   ?.setAttribute('aria-expanded','false');}
  const b=button;owner=null;button=null;active=-1;
  if(restore&&b?.isConnected)b.focus();
 }
 function sync(select){
  const shell=select.closest('.nuvio-select-shell');
  if(!shell)return;
  const toggle=shell.querySelector('.nuvio-select-toggle');
  const selected=select.selectedOptions[0];
  const label=selected?.textContent||'Selecionar...';
  const value=toggle.querySelector('.nuvio-select-value');
  if(value.textContent!==label)value.textContent=label;
  if(toggle.disabled!==select.disabled)toggle.disabled=select.disabled;
  if(toggle.title!==label)toggle.title=label;
 }
 function choose(index){
  if(!owner||index<0||index>=owner.options.length||owner.options[index].disabled)return;
  const option=owner.options[index];
  if(owner.value!==option.value||owner.selectedIndex!==index){
   owner.selectedIndex=index;
   owner.dispatchEvent(new Event('input',{bubbles:true}));
   owner.dispatchEvent(new Event('change',{bubbles:true}));
  }
  sync(owner);close(true);
 }
 function highlight(index){
  if(!popup||!owner)return;
  const entries=[...popup.querySelectorAll('[data-nuvio-index]')];
  if(!entries.length)return;
  active=Math.max(0,Math.min(index,owner.options.length-1));
  if(owner.options[active]?.disabled){
   const found=entries.find(e=>Number(e.dataset.nuvioIndex)>=active&&!e.disabled)||
     entries.find(e=>!e.disabled);
   if(found)active=Number(found.dataset.nuvioIndex);
  }
  entries.forEach(e=>e.classList.toggle('active',Number(e.dataset.nuvioIndex)===active));
  entries.find(e=>Number(e.dataset.nuvioIndex)===active)?.scrollIntoView({block:'nearest'});
 }
 function open(select){
  if(owner===select&&popup){close(true);return;}
  close();
  if(select.disabled)return;
  owner=select;
  button=select.closest('.nuvio-select-shell')?.querySelector('.nuvio-select-toggle');
  if(!button)return;
  sync(select);button.setAttribute('aria-expanded','true');
  const rect=button.getBoundingClientRect();
  const maxHeight=Math.min(330,Math.max(150,window.innerHeight-100));
  const below=window.innerHeight-rect.bottom;
  const above=rect.top;
  const upward=below<Math.min(280,maxHeight)&&above>below;
  const width=Math.min(Math.max(rect.width,210),window.innerWidth-20);
  popup=document.createElement('div');
  popup.className='nuvio-select-popup';
  popup.setAttribute('role','listbox');popup.setAttribute('aria-label',select.getAttribute('aria-label')||
   select.closest('.field')?.querySelector('span')?.textContent||'Opções');
  popup.style.width=width+'px';
  popup.style.maxHeight=Math.min(maxHeight,upward?above-14:below-14)+'px';
  popup.style.left=Math.max(10,Math.min(rect.left,window.innerWidth-width-10))+'px';
  if(upward){popup.style.bottom=(window.innerHeight-rect.top+5)+'px';}
  else{popup.style.top=(rect.bottom+5)+'px';}
  const max=select.options.length;
  for(let i=0;i<max;i++){
   const option=select.options[i];
   const row=document.createElement('button');
   row.type='button';row.className='nuvio-select-item';
   row.setAttribute('role','option');row.dataset.nuvioIndex=String(i);
   row.setAttribute('aria-selected',String(i===select.selectedIndex));
   row.disabled=option.disabled;row.textContent=safe(option.textContent);
   if(i===select.selectedIndex)row.classList.add('selected');
   popup.append(row);
  }
  popup.addEventListener('click',event=>{
   const row=event.target.closest('[data-nuvio-index]');
   if(row&&!row.disabled)choose(Number(row.dataset.nuvioIndex));
  });
  document.body.append(popup);
  active=Math.max(0,select.selectedIndex);
  highlight(active);
 }
 function enhance(){
  for(const select of document.querySelectorAll('select:not([data-nuvio-ready])')){
   if(select.multiple||select.size>1)continue;
   select.dataset.nuvioReady='true';
   const shell=document.createElement('span');shell.className='nuvio-select-shell';
   const toggle=document.createElement('button');toggle.type='button';
   toggle.className='nuvio-select-toggle';
   toggle.setAttribute('aria-haspopup','listbox');toggle.setAttribute('aria-expanded','false');
   const value=document.createElement('span');value.className='nuvio-select-value';
   const caret=document.createElement('span');caret.className='nuvio-select-caret';caret.setAttribute('aria-hidden','true');
   toggle.append(value,caret);
   select.parentNode.insertBefore(shell,select);shell.append(select,toggle);
   select.classList.add('nuvio-select-native');
   const span=select.closest('.field')?.querySelector('span');
   if(span)toggle.setAttribute('aria-label',span.textContent);
   toggle.addEventListener('click',event=>{event.stopPropagation();open(select);});
   toggle.addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp','Enter',' ','Home','End'].includes(event.key)){
     event.preventDefault();event.stopPropagation();
     const wasOpen=!!popup&&owner===select;
     if(!wasOpen)open(select);
     if(!wasOpen&&['Enter',' '].includes(event.key))return;
     if(event.key==='ArrowDown')highlight(active+1);
     if(event.key==='ArrowUp')highlight(active-1);
     if(event.key==='Home')highlight(0);
     if(event.key==='End')highlight(select.options.length-1);
     if(['Enter',' '].includes(event.key)&&popup)choose(active);
    }
    if(event.key==='Escape'){close(true);}
   });
   select.addEventListener('change',()=>sync(select));
   sync(select);
  }
 }
 document.addEventListener('pointerdown',event=>{
  if(popup&&!popup.contains(event.target)&&!button?.contains(event.target))close();
 },true);
 document.addEventListener('keydown',event=>{
  if(!popup)return;
  if(event.key==='Escape'){event.preventDefault();close(true);}
  else if(event.key==='ArrowDown'){event.preventDefault();highlight(active+1);}
  else if(event.key==='ArrowUp'){event.preventDefault();highlight(active-1);}
  else if(event.key==='Enter'&&owner){event.preventDefault();choose(active);}
 });
 window.addEventListener('resize',()=>close());
 window.addEventListener('scroll',event=>{if(popup&&!popup.contains(event.target))close();},true);
 let queued=false;
 const observer=new MutationObserver(()=>{
  if(queued)return;queued=true;
  queueMicrotask(()=>{queued=false;enhance();
   // A origem pode alterar options/selectedIndex sem disparar change.
   // Mantemos visibilidade e seleção coerentes em TODAS as abas.
   document.querySelectorAll('select[data-nuvio-ready]').forEach(sync);
   if(owner&&!owner.isConnected)close();});
 });
 function init(){enhance();observer.observe(document.body,{childList:true,subtree:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
