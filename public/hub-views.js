/* Views de operação e publicação; sem estado global de edição. */
(() => {
 'use strict';
function renderMonitor(report, {pageTitle,makeBtn,esc,editable}){
 return pageTitle('OPERAÇÃO / MONITOR','Saúde dos addons',
  'Manifesto, busca e reprodução são verificações distintas. O Hub não testa automaticamente se um vídeo reproduz no Nuvio.',
  makeBtn('Verificar agora','monitor-check','btn btn-primary',editable?'':'disabled')+
  makeBtn('Atualizar','monitor-refresh'))+
 (report?`<div class="stat-grid">
 <div class="stat"><div class="value">${(report.items||[]).filter(x=>x.health?.status==='online').length}</div><span class="descriptor">Manifestos online</span></div>
 <div class="stat"><div class="value">${(report.items||[]).filter(x=>x.health&&x.health.status!=='online').length}</div><span class="descriptor">Com problemas</span></div>
 <div class="stat"><div class="value">${(report.items||[]).filter(x=>x.enabled).length}</div><span class="descriptor">Ativos</span></div>
 <div class="stat"><div class="value">${report.latestSearch?.durationMs||'—'}</div><span class="descriptor">Última busca (ms)</span></div></div>
 <div class="panel"><div class="table-wrap"><table><thead><tr><th>Addon</th><th>Manifesto</th><th>Tempo</th><th>Busca de streams</th><th>Reprodução</th></tr></thead>
 <tbody>${(report.items||[]).map(a=>`<tr><td><b>${esc(a.name)}</b><small>${esc((a.resources||[]).join(' · '))}</small></td>
 <td><span class="badge ${a.health?.status==='online'?'ok':a.health?'error':'off'}">${esc(a.health?.status||'Aguardando')}</span></td>
 <td>${a.health?.durationMs==null?'—':a.health.durationMs+' ms'}</td>
 <td>${esc(a.diagnostics?.streamSearch==='unchecked'?'Não testada':a.diagnostics?.streamSearch||'Não testada')} ${a.search?.delivered>0?'('+a.search.delivered+' streams entregues)':''}</td>
 <td><span class="badge off">Não verificada na TV</span></td></tr>`).join('')}</tbody></table></div></div>`:
 '<div class="panel"><div class="empty"><b>Monitor ainda não consultado</b><span>Use Atualizar para consultar os dados de desempenho.</span></div></div>');
}
function renderPublish({pageTitle,makeBtn,esc,MANIFEST,EXPORT}){
 return pageTitle('DISTRIBUIÇÃO / NUVIO','Tudo pronto para o Nuvio',
 'O Agregador e suas coleções trabalham juntos, mas a instalação do manifesto e o carregamento do JSON dependem das opções oferecidas pela versão do Nuvio.')+
 `<div class="inline-info">O Hub usa um único conjunto de addons e sua biblioteca de coleções. Editar aqui atualiza os links abaixo depois de salvar. Nenhuma publicação automática na sua conta foi habilitada.</div>
 <div class="two-cols" style="margin-top:19px">
 <div class="panel"><div class="section-head"><h2>1. Addon do Agregador</h2><span class="badge ok">Link estável</span></div>
 <p class="panel-sub">Um manifesto para as fontes de reprodução, metadados e os catálogos expostos pelo Hub.</p>
 <div class="link-box"><code id="manifestLink">${MANIFEST}</code>${makeBtn('Copiar','copy-manifest','btn btn-small')}</div>
 <a class="btn btn-subtle" href="/manifest.json" target="_blank" rel="noopener">Abrir manifesto ↗</a></div>
 <div class="panel"><div class="section-head"><h2>2. Suas coleções</h2><span class="badge ok">JSON dinâmico</span></div>
 <p class="panel-sub">Inclui a organização das pastas, as fontes que você escolheu e as capas adaptadas para Legacy.</p>
 <div class="link-box"><code id="collectionsLink">${EXPORT}</code>${makeBtn('Copiar','copy-collections','btn btn-small')}</div>
 <a class="btn btn-subtle" href="/api/hub/collections.json" target="_blank" rel="noopener">Visualizar JSON ↗</a></div>
 </div>
 <div class="panel" style="margin-top:16px"><h2>Guia de utilização</h2>
 ${[
 'Cadastre os addons no Hub e mantenha habilitados os que quiser utilizar.',
 'Crie suas coleções, defina as pastas e vincule os catálogos. Clique em Salvar alterações.',
 'No Nuvio, instale o manifesto do Agregador e importe o JSON de coleções na função oferecida pelo aplicativo.'
 ].map((x,i)=>`<div class="step"><span class="step-number">${i+1}</span><span>${esc(x)}</span></div>`).join('')}
 <div class="inline-info warning">O formato atual do Nuvio Legacy não garante que um único link de addon instale também coleções pessoais. A exportação oferece os dois links necessários, sem afirmar que a instalação na TV foi testada.</div>
 </div>`;
}


 globalThis.NuvioHubViews = Object.freeze({renderMonitor,renderPublish});
})();
