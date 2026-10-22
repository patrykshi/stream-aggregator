import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import '../public/hub-views.js';
const helpers={pageTitle:(_,title)=>`<h2>${title}</h2>`,makeBtn:(label)=>`<button>${label}</button>`,
 esc:s=>String(s??'').replace(/</g,'&lt;'),editable:true};
describe('Views isoladas do estado do editor',()=>{
 it('mantém diferença explícita entre busca e reprodução',()=>{
  const output=globalThis.NuvioHubViews.renderMonitor({items:[{name:'Provedor <Teste>',resources:['stream'],enabled:true,
   diagnostics:{streamSearch:'results',playback:'unverified'},health:{status:'online',durationMs:110}}]},helpers);
  assert.match(output,/Provedor &lt;Teste>/);
  assert.match(output,/Não verificada na TV/);
  assert.match(output,/Busca de streams/);
 });
 it('publica dois endereços distintos sem modificar o Nuvio',()=>{
  const html=globalThis.NuvioHubViews.renderPublish({...helpers,MANIFEST:'https://example.com/manifest.json',EXPORT:'https://example.com/collections.json'});
  assert.match(html,/manifest.json/);
  assert.match(html,/collections.json/);
  assert.match(html,/Nenhuma publicação automática/);
 });
});
