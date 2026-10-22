import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import '../public/preview-layout.js';
const data=globalThis.NuvioPreviewLayout;
describe('Modos de layout de TV',()=>{
 it('só aceita layouts conhecidos',()=>{
  assert.equal(data.normalized('modern'),'modern');
  assert.equal(data.normalized('classic'),'classic');
  assert.equal(data.normalized('grid'),'grid');
  assert.equal(data.normalized('custom-injected'),'modern');
 });
 it('renderiza uma seleção acessível, exatamente três modos',()=>{
  const html=data.buttons('grid');
  assert.equal((html.match(/data-pv-action="layout"/g)||[]).length,3);
  assert.match(html,/aria-pressed="true"/);
  assert.match(html,/Moderno/);
  assert.match(html,/Clássico/);
  assert.match(html,/Grade/);
 });
});
