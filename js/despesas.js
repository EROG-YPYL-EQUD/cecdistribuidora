/* ================================================================
   DESPESAS
================================================================ */
function renderDespesas(){ conteudo.innerHTML=`<h2>Despesas</h2><button class="btn-primary" onclick="renderFormDespesa()">+ Despesa</button><button class="btn-secondary" onclick="renderListaDespesas()">Minhas Despesas</button><br><br><button class="btn-primary" onclick="renderGrupoSubgrupo()">+ Grupos/Subgrupos</button><button class="btn-secondary" onclick="renderListaGrupoDespesa()">Grupos</button>`; }

function renderFormDespesa(index=null){
  let d=index!==null?db.despesas[index]:{fornecedor:"",conta:"",grupo:"",subgrupo:"",vencimento:"",valor:"",situacao:"A pagar",dataPagamento:""};
  let pessoas=[...db.fornecedores,...db.vendedores];
  openModal(`<h3>${index===null?"Cadastrar":"Editar"} Despesa</h3><label>Fornecedor / Vendedor</label><select id="fornecedor">${pessoas.map(p=>`<option ${p.nome===d.fornecedor?"selected":""}>${escaparHTML(p.nome)}</option>`).join("")}</select><label>Conta</label><select id="conta">${db.contas.map(c=>`<option ${c.nome===d.conta?"selected":""}>${escaparHTML(c.nome)}</option>`).join("")}</select><label>Grupo</label><select id="grupo" onchange="carregarSubgrupos()">${db.gruposDespesas.map(g=>`<option ${g===d.grupo?"selected":""}>${escaparHTML(g)}</option>`).join("")}</select><label>Subgrupo</label><select id="subgrupo"></select><label>Vencimento</label><input type="date" id="vencimento" value="${d.vencimento}"><label>Valor</label><input id="valor" data-moeda="br" value="${moedaBR(numeroBR(d.valor))}"><label>Situação</label><select id="situacao" onchange="togglePagamento()"><option ${d.situacao==="A pagar"?"selected":""}>A pagar</option><option ${d.situacao==="Pago"?"selected":""}>Pago</option></select><div id="boxPagamento" style="display:none"><label>Data pagamento</label><input type="date" id="dataPagamento" value="${d.dataPagamento||""}"></div><div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveDespesa(${index})">Salvar</button></div>`);
  setTimeout(()=>{ carregarSubgrupos(d.subgrupo); togglePagamento(); },100);
}

function carregarSubgrupos(sel=""){ subgrupo.innerHTML=db.subgruposDespesas.filter(s=>s.grupo===grupo.value).map(s=>`<option ${s.nome===sel?"selected":""}>${escaparHTML(s.nome)}</option>`).join(""); }
function togglePagamento(){ boxPagamento.style.display=situacao.value==="Pago"?"block":"none"; }
async function saveDespesa(index){
  return executarOperacaoProtegida(document.activeElement, async()=>{
    const antesDespesas=clonarEstado(db.despesas), antesContas=clonarEstado(db.contas);
    let novaObj={fornecedor:fornecedor.value,conta:conta.value,grupo:grupo.value,subgrupo:subgrupo.value,vencimento:vencimento.value,valor:numeroBR(valor.value),situacao:situacao.value,dataPagamento:situacao.value==="Pago"?dataPagamento.value:""};
    if(!novaObj.vencimento || novaObj.valor<=0){ alert("Informe vencimento e valor válido."); return false; }
    if(novaObj.situacao==='Pago' && !novaObj.dataPagamento){ alert("Informe a data de pagamento."); return false; }
    let transacaoAnterior=index!==null&&index!=="null"?db.despesas[index]:null;
    await ajustarSaldoPorTransacao('despesa',novaObj,transacaoAnterior);
    if(index===null||index==="null") db.despesas.push(novaObj); else db.despesas[index]=novaObj;
    const ok=await aposAlterarFinanceiro('despesas');
    if(!ok){ db.despesas=antesDespesas; db.contas=antesContas; return false; }
    closeModal(); mostrarToast("✓ Despesa salva com sucesso! Dashboard atualizado."); return true;
  });
}

function renderListaDespesas(){
  let meses=[...new Set(db.despesas.map(d=>d.vencimento? d.vencimento.slice(5,7)+"/"+d.vencimento.slice(2,4) : "").filter(Boolean))]
    .sort((a,b)=>{ const [ma,aa]=a.split('/'); const [mb,ab]=b.split('/'); return ("20"+ab+mb).localeCompare("20"+aa+ma); });
  conteudo.innerHTML=`<h2>Minhas Despesas</h2><button class="btn-secondary" onclick="renderDespesas()">Voltar</button><button class="btn-primary" onclick="renderFormDespesa()">+ Despesa</button><hr><div style="display:flex;gap:14px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><label>Buscar fornecedor/vendedor</label><input id="fBuscaFornecedor" placeholder="Digite o nome..." oninput="filtrarDespesas()"></div><div style="flex:1"><label>Mês</label><select id="fMes" onchange="filtrarDespesas()"><option>Todas</option>${meses.map(m=>`<option>${m}</option>`).join("")}</select></div><div style="flex:1"><label>Conta</label><select id="fConta" onchange="filtrarDespesas()"><option>Todas</option>${db.contas.map(c=>`<option>${escaparHTML(c.nome)}</option>`).join("")}</select></div><div style="flex:1"><label>Situação</label><select id="fSituacao" onchange="filtrarDespesas()"><option>Todas</option><option>A pagar</option><option>Pendente</option><option>Pago</option></select></div></div><div id="tabelaDespesas"></div>`;
  filtrarDespesas();
}

function filtrarDespesas(){
  const hoje=new Date(),mes=fMes?.value||"Todas",conta=fConta?.value||"Todas",sit=fSituacao?.value||"Todas",busca=(fBuscaFornecedor?.value||"").toLowerCase().trim();
  let html=`<table><tr><th>Vencimento</th><th>Fornecedor</th><th>Conta</th><th>Grupo</th><th>Subgrupo</th><th>Valor</th><th>Situação</th><th>Ações</th></tr>`;
  const lista = db.despesas
    .map((d,i)=>({d,i}))
    .sort((a,b)=> new Date((b.d.vencimento||'1900-01-01')+"T00:00:00") - new Date((a.d.vencimento||'1900-01-01')+"T00:00:00"));
  lista.forEach(({d,i})=>{ 
    let s=d.situacao; 
    if(s!=="Pago"&&d.vencimento&&new Date(d.vencimento+"T00:00:00")<hoje) s="Pendente"; 
    let dm=d.vencimento?d.vencimento.slice(5,7)+"/"+d.vencimento.slice(2,4):""; 
    const nomeFornecedor=(d.fornecedor||"").toLowerCase();
    if((mes==="Todas"||dm===mes)&&(conta==="Todas"||d.conta===conta)&&(sit==="Todas"||s===sit)&&(!busca||nomeFornecedor.includes(busca))) html+=`<tr><td>${d.vencimento||''}</td><td>${escaparHTML(d.fornecedor||'')}</td><td>${escaparHTML(d.conta||'')}</td><td>${escaparHTML(d.grupo||'')}</td><td>${escaparHTML(d.subgrupo||'')}</td><td>${moedaBR(numeroBR(d.valor))}</td><td>${escaparHTML(s)}</td><td><button class="btn-primary" onclick="renderFormDespesa(${i})" title="Editar" aria-label="Editar">✏️</button><button class="btn-secondary" onclick="baixarDespesa(${i})" title="Dar baixa" aria-label="Dar baixa">✅</button><button class="btn-danger" onclick="excluirDespesa(${i})" title="Excluir" aria-label="Excluir">🗑️</button></td></tr>`; 
  });
  html+="</table>"; tabelaDespesas.innerHTML=html;
}

function baixarDespesa(i){ const d=db.despesas[i]; openModal(`<h3>Baixar Despesa</h3><table><tr><th>Vencimento</th><th>Data pagamento</th><th>Valor pago</th></tr><tr><td>${d.vencimento}</td><td><input type="date" id="dataPgto"></td><td><input id="valorPgto" data-moeda="br" value="${moedaBR(numeroBR(d.valor))}"></td></tr></table><div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Fechar</button><button class="btn-primary" onclick="confirmarBaixa(${i})">Baixar</button></div>`); }
async function confirmarBaixa(i){
  if(numeroBR(valorPgto.value)!==numeroBR(db.despesas[i].valor)){ alert("Valor deve ser igual ao da despesa"); return; }
  if(!dataPgto.value){ alert("Informe a data de pagamento."); return; }
  const antesDespesas=clonarEstado(db.despesas), antesContas=clonarEstado(db.contas);
  db.despesas[i]={...db.despesas[i],situacao:"Pago",dataPagamento:dataPgto.value,atualizadoEm:new Date().toISOString()};
  if(!await aposAlterarFinanceiro('despesas')){ db.despesas=antesDespesas; db.contas=antesContas; return; }
  closeModal(); mostrarToast("✓ Despesa baixada! Caixa e dashboard atualizados.");
}
async function excluirDespesa(i){
  if(!confirm('Deseja excluir esta despesa?')) return;
  const antesDespesas=clonarEstado(db.despesas), antesContas=clonarEstado(db.contas);
  db.despesas.splice(i,1);
  if(!await aposAlterarFinanceiro('despesas')){ db.despesas=antesDespesas; db.contas=antesContas; return; }
  mostrarToast("✓ Despesa excluída! Caixa e dashboard atualizados.");
}


function renderGrupoSubgrupo(et=null,idx=null,si=null){
  let title="Grupo / Subgrupo Despesas",gv="",sv="",gp=0;
  if(et==='grupo'&&idx!==null){title="Editar Grupo";gv=db.gruposDespesas[idx];}
  else if(et==='subgrupo'&&idx!==null&&si!==null){title="Editar Subgrupo";let s=db.subgruposDespesas.filter(s=>s.grupo===db.gruposDespesas[idx])[si];sv=s.nome;gp=idx;}
  openModal(`<h3>${title}</h3><label>Grupo</label><input id="novoGrupo" value="${escaparAtributo(gv)}"><button class="btn-primary" style="margin-top:10px" onclick="saveGrupo(${idx})">${et==='grupo'?'Salvar Alteração':'+ Grupo'}</button><hr><label>Grupo Pai</label><select id="grupoPai">${db.gruposDespesas.map((g,i)=>`<option value="${i}" ${i===gp?'selected':''}>${escaparHTML(g)}</option>`).join("")}</select><label>Subgrupo</label><input id="novoSubgrupo" value="${escaparAtributo(sv)}"><div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveSubgrupo(${idx},${si})">${et==='subgrupo'?'Salvar Alteração':'+ Subgrupo'}</button></div>`);
}

async function saveGrupo(idx=null){ if(idx!==null&&idx!==undefined){let a=db.gruposDespesas[idx];db.gruposDespesas[idx]=novoGrupo.value;db.subgruposDespesas.forEach(s=>{if(s.grupo===a)s.grupo=novoGrupo.value;});await persist("subgruposDespesas");}else{db.gruposDespesas.push(novoGrupo.value);} await persist("gruposDespesas"); if(abaAtiva==='gestao') renderListaGrupoDespesa(); else renderGrupoSubgrupo(); }
async function saveSubgrupo(gi=null,si=null){ let gn=db.gruposDespesas[grupoPai.value]; if(si!==null&&si!==undefined){let s=db.subgruposDespesas.filter(s=>s.grupo===db.gruposDespesas[gi])[si];let ri=db.subgruposDespesas.indexOf(s);db.subgruposDespesas[ri].nome=novoSubgrupo.value;db.subgruposDespesas[ri].grupo=gn;}else{db.subgruposDespesas.push({grupo:gn,nome:novoSubgrupo.value});} await persist("subgruposDespesas"); closeModal(); if(abaAtiva==='gestao') renderListaGrupoDespesa(); }
async function excluirGrupoDespesa(i){
  const n=db.gruposDespesas[i]; if(!n) return;
  if(db.despesas.some(d=>d.grupo===n)){ alert("Não é possível excluir um grupo usado em despesas. Preserve o histórico ou altere os lançamentos antes."); return; }
  if(!confirm("Excluir grupo e subgrupos?")) return;
  const ag=clonarEstado(db.gruposDespesas), as=clonarEstado(db.subgruposDespesas);
  db.gruposDespesas.splice(i,1); db.subgruposDespesas=db.subgruposDespesas.filter(s=>s.grupo!==n);
  if(!await persistirAtomico(["gruposDespesas","subgruposDespesas"])){ db.gruposDespesas=ag; db.subgruposDespesas=as; return; }
  renderListaGrupoDespesa();
}
async function excluirSubgrupoDespesa(gi,si){
  let item=db.subgruposDespesas.filter(s=>s.grupo===db.gruposDespesas[gi])[si]; if(!item) return;
  if(db.despesas.some(d=>d.grupo===item.grupo&&d.subgrupo===item.nome)){ alert("Não é possível excluir um subgrupo usado em despesas."); return; }
  if(!confirm("Excluir subgrupo?")) return; const antes=clonarEstado(db.subgruposDespesas);
  db.subgruposDespesas.splice(db.subgruposDespesas.indexOf(item),1); if(!await persist("subgruposDespesas")){db.subgruposDespesas=antes;return;} renderListaGrupoDespesa();
}

function renderListaGrupoDespesa(){
  let html=`<div class="row"><h2>Grupos Despesas</h2><button class="btn-primary" onclick="renderGrupoSubgrupo()">+ Novo</button></div><hr>`;
  db.gruposDespesas.forEach((g,gi)=>{ html+=`<div class="card"><div class="row"><b>${escaparHTML(g)}</b><div><button class="btn-primary btn-small" onclick="renderGrupoSubgrupo('grupo',${gi})">Editar</button><button class="btn-danger btn-small" onclick="excluirGrupoDespesa(${gi})">Excluir</button></div></div><div style="margin-top:8px">`; db.subgruposDespesas.filter(s=>s.grupo===g).forEach((s,si)=>{ html+=`<div class="item-list"><span>└ ${escaparHTML(s.nome)}</span><div><button class="btn-secondary btn-small" onclick="renderGrupoSubgrupo('subgrupo',${gi},${si})">Editar</button><button class="btn-danger btn-small" onclick="excluirSubgrupoDespesa(${gi},${si})">Excluir</button></div></div>`; }); html+="</div></div>"; });
  conteudo.innerHTML=html;
}
