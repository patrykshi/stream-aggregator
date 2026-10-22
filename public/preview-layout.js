/* Configuração pura dos modos de visualização da TV. */
(() => {
 'use strict';
 const MODES = Object.freeze({
   modern: {label: 'Moderno', description: 'Carrossel e trilhos panorâmicos'},
   classic: {label: 'Clássico', description: 'Pastas e destaques compactos'},
   grid: {label: 'Grade', description: 'Todos os cartões em mosaico'}
 });
 const normalized = value => Object.hasOwn(MODES, value) ? value : 'modern';
 const buttons = (value, esc = x => String(x)) => Object.entries(MODES).map(([key, entry]) =>
   '<button type="button" data-pv-action="layout" data-value="' + key + '" class="' +
   (key === normalized(value) ? 'active' : '') + '" aria-pressed="' +
   (key === normalized(value)) + '" title="' + esc(entry.description) + '">' +
   esc(entry.label) + '</button>').join('');
 globalThis.NuvioPreviewLayout = Object.freeze({MODES, normalized, buttons});
})();
