/* ================================================================
   RECEITAS
================================================================ */

function encontrarIndiceReceita(identificador){
  if(identificador===null || identificador===undefined || identificador==="null" || identificador==="") return null;
  // Preferir ID único da parcela. Isso evita editar sempre a primeira parcela da venda.
  let id=String(identificador);
  let idx=db.receitas.findIndex(r=>String(r.id)===id);
  if(idx>=0) return idx;
  // Compatibilidade com versões antigas que passavam índice numérico.
  if(!isNaN(Number(identificador)) && db.receitas[Number(identificador)]) return Number(identificador);
  return null;
}
function escaparJSReceita(valor){
  return String(valor||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/\n/g," ");
}
function renderReceitas(){ conteudo.innerHTML=`<h2>Receitas</h2><button class="btn-primary" onclick="renderFormReceita()">+ Receita</button><button class="btn-secondary" onclick="renderListaReceitas()">Minhas Receitas</button><br><br><button class="btn-primary" onclick="renderGrupoSubgrupoReceita()">+ Grupos/Subgrupos</button><button class="btn-secondary" onclick="renderListaGrupoReceita()">Grupos</button>`; }

function renderFormReceita(identificador=null){
  const index=encontrarIndiceReceita(identificador);
  let r=index!==null?db.receitas[index]:{cliente:"",vendedor:"",conta:"",grupo:"",subgrupo:"",dataVenda:"",tipoVenda:"avista",vencimento:"",valor:"",situacao:"A receber",dataRecebimento:"",qtdParcelas:1,parcelaAtual:1};
  const dataVendaPadrao = r.dataVenda || r.vencimento || "";
  const tipoPadrao = r.tipoVenda || "avista";
  const qtdPadrao = r.qtdParcelas || 1;
  openModal(`<h3>${index===null?"Cadastrar":"Editar"} Receita ${index!==null && (r.tipoVenda||'avista')==='prazo' ? '- Parcela '+(r.parcelaAtual||1)+'/'+(r.qtdParcelas||1) : ''}</h3>
  <label>Cliente</label><select id="cliente">${db.clientes.map(c=>`<option ${c.nome===r.cliente?"selected":""}>${escaparHTML(c.nome)}</option>`).join("")}</select>
  <label>Vendedor</label><select id="vendedor">${db.vendedores.map(v=>`<option ${v.nome===r.vendedor?"selected":""}>${escaparHTML(v.nome)}</option>`).join("")}</select>
  <label>Conta</label><select id="conta">${db.contas.map(c=>`<option ${c.nome===r.conta?"selected":""}>${escaparHTML(c.nome)}</option>`).join("")}</select>
  <label>Grupo</label><select id="grupo" onchange="carregarSubgruposReceita()">${db.gruposReceitas.map(g=>`<option ${g===r.grupo?"selected":""}>${escaparHTML(g)}</option>`).join("")}</select>
  <label>Subgrupo</label><select id="subgrupo"></select>
  <label>Data da venda</label><input type="date" id="dataVenda" value="${dataVendaPadrao}">
  <label>Tipo da venda</label>
  <select id="tipoVenda" onchange="toggleParcelasReceita()">
    <option value="avista" ${tipoPadrao==='avista'?"selected":""}>Venda à vista</option>
    <option value="prazo" ${tipoPadrao==='prazo'?"selected":""}>Venda a prazo / parcelada</option>
  </select>
  <div id="boxParcelasReceita" style="display:none">
    <label>Quantidade de parcelas</label><input type="number" id="qtdParcelas" value="${qtdPadrao}" min="1">
    <p style="font-size:12px;color:#94a3b8;margin-top:6px">Ao cadastrar venda parcelada nova, o sistema cria uma receita para cada parcela. Na edição, altera somente a parcela aberta.</p>
  </div>
  <label id="labelVencimentoReceita">Vencimento</label><input type="date" id="vencimento" value="${r.vencimento}">
  <label>Valor ${index===null?'total':'da parcela'}</label><input id="valor" data-moeda="br" value="${moedaBR(numeroBR(r.valor))}">
  <label>Situação</label><select id="situacao" onchange="toggleRecebimento()"><option ${r.situacao==="A receber"?"selected":""}>A receber</option><option ${r.situacao==="Recebido"?"selected":""}>Recebido</option></select>
  <div id="boxRecebimento" style="display:none"><label>Data recebimento</label><input type="date" id="dataRecebimento" value="${r.dataRecebimento||""}"></div>
  <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveReceita('${index!==null?escaparJSReceita(r.id):''}')">Salvar</button></div>`);
  setTimeout(()=>{ carregarSubgruposReceita(r.subgrupo); toggleRecebimento(); toggleParcelasReceita(); },100);
}

function carregarSubgruposReceita(sel=""){ subgrupo.innerHTML=db.subgruposReceitas.filter(s=>s.grupo===grupo.value).map(s=>`<option ${s.nome===sel?"selected":""}>${escaparHTML(s.nome)}</option>`).join(""); }
function toggleRecebimento(){ boxRecebimento.style.display=situacao.value==="Recebido"?"block":"none"; }
function toggleParcelasReceita(){
  const tipo=document.getElementById('tipoVenda')?.value||'avista';
  const box=document.getElementById('boxParcelasReceita');
  const label=document.getElementById('labelVencimentoReceita');
  if(box) box.style.display=tipo==='prazo'?'block':'none';
  if(label) label.textContent=tipo==='prazo'?'Vencimento da 1ª parcela':'Vencimento / recebimento';
  const dv=document.getElementById('dataVenda');
  const venc=document.getElementById('vencimento');
  if(tipo==='avista' && dv && venc && !venc.value) venc.value=dv.value;
}
function addMesesDataISO(dataISO, meses){
  if(!dataISO) return "";
  const [ano,mes,dia]=dataISO.split('-').map(Number);
  const d=new Date(ano, mes-1+meses, dia);
  return d.toISOString().slice(0,10);
}
function gerarIdReceita(prefixo='REC'){
  return prefixo + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
}
async function saveReceita(identificador=null){ 
  const antesReceitas=clonarEstado(db.receitas), antesContas=clonarEstado(db.contas);
  const index=encontrarIndiceReceita(identificador);
  const tipo=(document.getElementById('tipoVenda')?.value)||'avista';
  const dataVendaValor=(document.getElementById('dataVenda')?.value) || vencimento.value;
  const qtd=Math.max(1, parseInt((document.getElementById('qtdParcelas')?.value) || 1));
  const valorTotal=numeroBR(valor.value);
  // Venda à vista: o vencimento é automaticamente a mesma data da venda quando não informado.
  // Isso garante que a coluna Vencimento nunca fique vazia para recebimentos à vista.
  const vencimentoInformado=(document.getElementById('vencimento')?.value)||'';
  const vencimentoBase=tipo==='avista' ? dataVendaValor : vencimentoInformado;
  let transacaoAnterior=index!==null&&index!=="null"?db.receitas[index]:null;

  // Em edição, altera somente a receita/parcela aberta.
  // Mantém id/vendaId para a parcela continuar ligada à venda original.
  if(index!==null && index!=="null"){
    let novaObj={
      ...transacaoAnterior,
      id: transacaoAnterior?.id || gerarIdReceita('REC'),
      vendaId: transacaoAnterior?.vendaId || gerarIdReceita('VENDA'),
      cliente:cliente.value,vendedor:vendedor.value,conta:conta.value,grupo:grupo.value,subgrupo:subgrupo.value,
      dataVenda:dataVendaValor,tipoVenda:tipo,vencimento:vencimentoBase,valor:valorTotal,
      situacao:situacao.value,dataRecebimento:situacao.value==="Recebido"?dataRecebimento.value:"",
      qtdParcelas:transacaoAnterior?.qtdParcelas || qtd,parcelaAtual:transacaoAnterior?.parcelaAtual||1,
      atualizadoEm:new Date().toISOString()
    };
    await ajustarSaldoPorTransacao('receita',novaObj,transacaoAnterior);
    db.receitas[index]=novaObj;
  } else {
    const parcelas = tipo==='prazo' ? qtd : 1;
    const valorParcela = parcelas>1 ? Math.round((valorTotal/parcelas)*100)/100 : valorTotal;
    const vendaId=gerarIdReceita('VENDA');
    for(let n=1; n<=parcelas; n++){
      let valorDaParcela = (n===parcelas) ? Math.round((valorTotal - valorParcela*(parcelas-1))*100)/100 : valorParcela;
      let novaObj={
        id:gerarIdReceita('REC'),vendaId:vendaId,
        cliente:cliente.value,vendedor:vendedor.value,conta:conta.value,grupo:grupo.value,subgrupo:subgrupo.value,
        dataVenda:dataVendaValor,tipoVenda:tipo,vencimento:tipo==='prazo'?addMesesDataISO(vencimentoBase,n-1):vencimentoBase,
        valor:valorDaParcela,situacao:situacao.value,dataRecebimento:situacao.value==="Recebido"?dataRecebimento.value:"",
        qtdParcelas:parcelas,parcelaAtual:n,criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()
      };
      await ajustarSaldoPorTransacao('receita',novaObj,null);
      db.receitas.push(novaObj);
    }
  }
  const ok=await aposAlterarFinanceiro('receitas');
  if(!ok){ db.receitas=antesReceitas; db.contas=antesContas; return false; }
  closeModal();
  mostrarToast("✓ Receita salva com sucesso! Dashboard atualizado.");
  return true;
}

function renderListaReceitas(){
  let meses=[...new Set(db.receitas.map(r=>{ const d=r.vencimento||((r.tipoVenda||'avista')==='avista'?r.dataVenda:''); return d? d.slice(5,7)+"/"+d.slice(2,4) : ""; }).filter(Boolean))]
    .sort((a,b)=>{ const [ma,aa]=a.split('/'); const [mb,ab]=b.split('/'); return ("20"+ab+mb).localeCompare("20"+aa+ma); });
  conteudo.innerHTML=`<h2>Minhas Receitas</h2><button class="btn-secondary" onclick="renderReceitas()">Voltar</button><button class="btn-primary" onclick="renderFormReceita()">+ Receita</button><hr><div style="display:flex;gap:14px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><label>Buscar cliente</label><input id="fBuscaCliente" placeholder="Digite o nome..." oninput="filtrarReceitas()"></div><div style="flex:1"><label>Mês</label><select id="fMes" onchange="filtrarReceitas()"><option>Todas</option>${meses.map(m=>`<option>${m}</option>`).join("")}</select></div><div style="flex:1"><label>Conta</label><select id="fConta" onchange="filtrarReceitas()"><option>Todas</option>${db.contas.map(c=>`<option>${escaparHTML(c.nome)}</option>`).join("")}</select></div><div style="flex:1"><label>Situação</label><select id="fSituacao" onchange="filtrarReceitas()"><option>Todas</option><option>A receber</option><option>Pendente</option><option>Recebido</option></select></div></div><div id="tabelaReceitas"></div>`;
  filtrarReceitas();
}

function filtrarReceitas(){
  const hoje=new Date(),mes=fMes?.value||"Todas",conta=fConta?.value||"Todas",sit=fSituacao?.value||"Todas",busca=(fBuscaCliente?.value||"").toLowerCase().trim();
  let html=`<table><tr><th>Data venda</th><th>Vencimento</th><th>Tipo</th><th>Parcela</th><th>Cliente</th><th>Vendedor</th><th>Conta</th><th>Grupo</th><th>Subgrupo</th><th>Valor</th><th>Situação</th><th>Ações</th></tr>`;
  const lista = db.receitas
    .map((r,i)=>({r,i}))
    .sort((a,b)=> new Date((b.r.vencimento||b.r.dataVenda||'1900-01-01')+"T00:00:00") - new Date((a.r.vencimento||a.r.dataVenda||'1900-01-01')+"T00:00:00"));
  lista.forEach(({r,i})=>{
    let s=r.situacao;
    if(s!=="Recebido"&&r.vencimento&&new Date(r.vencimento+"T00:00:00")<hoje) s="Pendente";
    const vencExibido=r.vencimento||((r.tipoVenda||'avista')==='avista'?r.dataVenda:'');
    let rm=vencExibido?vencExibido.slice(5,7)+"/"+vencExibido.slice(2,4):"";
    const nomeCliente=(r.cliente||"").toLowerCase();
    if((mes==="Todas"||rm===mes)&&(conta==="Todas"||r.conta===conta)&&(sit==="Todas"||s===sit)&&(!busca||nomeCliente.includes(busca))){
      const tipoLabel=(r.tipoVenda||'avista')==='prazo'?'A prazo':'À vista';
      const parcelaLabel=(r.tipoVenda||'avista')==='prazo'?`${r.parcelaAtual||1}/${r.qtdParcelas||1}`:'-';
      html+=`<tr><td>${r.dataVenda||r.vencimento||''}</td><td>${vencExibido||''}</td><td>${tipoLabel}</td><td>${parcelaLabel}</td><td>${escaparHTML(r.cliente||'')}</td><td>${escaparHTML(r.vendedor||"-")}</td><td>${escaparHTML(r.conta||'')}</td><td>${escaparHTML(r.grupo||'')}</td><td>${escaparHTML(r.subgrupo||'')}</td><td>${moedaBR(numeroBR(r.valor))}</td><td>${escaparHTML(s)}</td><td><button class="btn-primary" onclick="renderFormReceita('${escaparJSReceita(r.id)}')">Editar</button><button class="btn-secondary" onclick="baixarReceita(${i})">Baixa</button><button class="btn-danger" onclick="excluirReceita(${i})">Excluir</button></td></tr>`;
    }
  });
  html+="</table>"; tabelaReceitas.innerHTML=html;
}

function baixarReceita(i){ const r=db.receitas[i]; openModal(`<h3>Baixar Receita</h3><table><tr><th>Vencimento</th><th>Data recebimento</th><th>Valor</th></tr><tr><td>${r.vencimento}</td><td><input type="date" id="dataReceb"></td><td><input id="valorReceb" data-moeda="br" value="${moedaBR(numeroBR(r.valor))}"></td></tr></table><div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Fechar</button><button class="btn-primary" onclick="confirmarBaixaReceita(${i})">Baixar</button></div>`); }
async function confirmarBaixaReceita(i){
  if(numeroBR(valorReceb.value)!==numeroBR(db.receitas[i].valor)){ alert("Valor deve ser igual ao da receita"); return; }
  if(!dataReceb.value){ alert("Informe a data de recebimento."); return; }
  const antesReceitas=clonarEstado(db.receitas), antesContas=clonarEstado(db.contas);
  const receitaAnterior={...db.receitas[i]};
  const novaReceita={...db.receitas[i],situacao:"Recebido",dataRecebimento:dataReceb.value,atualizadoEm:new Date().toISOString()};
  await ajustarSaldoPorTransacao('receita',novaReceita,receitaAnterior); db.receitas[i]=novaReceita;
  if(!await aposAlterarFinanceiro('receitas')){ db.receitas=antesReceitas; db.contas=antesContas; return; }
  closeModal(); mostrarToast("✓ Receita baixada! Caixa, comissão e dashboard atualizados.");
}
async function excluirReceita(i){
  if(!confirm('Deseja excluir esta receita?')) return;
  const antesReceitas=clonarEstado(db.receitas), antesContas=clonarEstado(db.contas);
  db.receitas.splice(i,1);
  if(!await aposAlterarFinanceiro('receitas')){ db.receitas=antesReceitas; db.contas=antesContas; return; }
  mostrarToast("✓ Receita excluída! Caixa e dashboard atualizados.");
}


function renderGrupoSubgrupoReceita(et=null,idx=null,si=null){
  let title="Grupo / Subgrupo Receitas",gv="",sv="",gp=0;
  if(et==='grupo'&&idx!==null){title="Editar Grupo";gv=db.gruposReceitas[idx];}
  else if(et==='subgrupo'&&idx!==null&&si!==null){title="Editar Subgrupo";let s=db.subgruposReceitas.filter(s=>s.grupo===db.gruposReceitas[idx])[si];sv=s.nome;gp=idx;}
  openModal(`<h3>${title}</h3><label>Grupo</label><input id="novoGrupoReceita" value="${escaparAtributo(gv)}"><button class="btn-primary" style="margin-top:10px" onclick="saveGrupoReceita(${idx})">${et==='grupo'?'Salvar':'+ Grupo'}</button><hr><label>Grupo Pai</label><select id="grupoPaiReceita">${db.gruposReceitas.map((g,i)=>`<option value="${i}" ${i===gp?'selected':''}>${escaparHTML(g)}</option>`).join("")}</select><label>Subgrupo</label><input id="novoSubgrupoReceita" value="${escaparAtributo(sv)}"><div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveSubgrupoReceita(${idx},${si})">${et==='subgrupo'?'Salvar':'+ Subgrupo'}</button></div>`);
}

async function saveGrupoReceita(idx=null){ if(idx!==null&&idx!==undefined){let a=db.gruposReceitas[idx];db.gruposReceitas[idx]=novoGrupoReceita.value;db.subgruposReceitas.forEach(s=>{if(s.grupo===a)s.grupo=novoGrupoReceita.value;});await persist("subgruposReceitas");}else{db.gruposReceitas.push(novoGrupoReceita.value);} await persist("gruposReceitas"); if(abaAtiva==='gestao') renderListaGrupoReceita(); else renderGrupoSubgrupoReceita(); }
async function saveSubgrupoReceita(gi=null,si=null){ let gn=db.gruposReceitas[grupoPaiReceita.value]; if(si!==null&&si!==undefined){let s=db.subgruposReceitas.filter(s=>s.grupo===db.gruposReceitas[gi])[si];let ri=db.subgruposReceitas.indexOf(s);db.subgruposReceitas[ri].nome=novoSubgrupoReceita.value;db.subgruposReceitas[ri].grupo=gn;}else{db.subgruposReceitas.push({grupo:gn,nome:novoSubgrupoReceita.value});} await persist("subgruposReceitas"); closeModal(); if(abaAtiva==='gestao') renderListaGrupoReceita(); }
async function excluirGrupoReceita(i){
  const n=db.gruposReceitas[i]; if(!n) return;
  if(db.receitas.some(r=>r.grupo===n)){ alert("Não é possível excluir um grupo usado em receitas. Preserve o histórico ou altere os lançamentos antes."); return; }
  if(!confirm("Excluir grupo e subgrupos?")) return;
  const ag=clonarEstado(db.gruposReceitas), as=clonarEstado(db.subgruposReceitas);
  db.gruposReceitas.splice(i,1); db.subgruposReceitas=db.subgruposReceitas.filter(s=>s.grupo!==n);
  if(!await persistirAtomico(["gruposReceitas","subgruposReceitas"])){ db.gruposReceitas=ag; db.subgruposReceitas=as; return; }
  renderListaGrupoReceita();
}
async function excluirSubgrupoReceita(gi,si){
  let item=db.subgruposReceitas.filter(s=>s.grupo===db.gruposReceitas[gi])[si]; if(!item) return;
  if(db.receitas.some(r=>r.grupo===item.grupo&&r.subgrupo===item.nome)){ alert("Não é possível excluir um subgrupo usado em receitas."); return; }
  if(!confirm("Excluir subgrupo?")) return; const antes=clonarEstado(db.subgruposReceitas);
  db.subgruposReceitas.splice(db.subgruposReceitas.indexOf(item),1); if(!await persist("subgruposReceitas")){db.subgruposReceitas=antes;return;} renderListaGrupoReceita();
}

function renderListaGrupoReceita(){
  let html=`<div class="row"><h2>Grupos Receitas</h2><button class="btn-primary" onclick="renderGrupoSubgrupoReceita()">+ Novo</button></div><hr>`;
  db.gruposReceitas.forEach((g,gi)=>{ html+=`<div class="card"><div class="row"><b>${escaparHTML(g)}</b><div><button class="btn-primary btn-small" onclick="renderGrupoSubgrupoReceita('grupo',${gi})">Editar</button><button class="btn-danger btn-small" onclick="excluirGrupoReceita(${gi})">Excluir</button></div></div><div style="margin-top:8px">`; db.subgruposReceitas.filter(s=>s.grupo===g).forEach((s,si)=>{ html+=`<div class="item-list"><span>└ ${escaparHTML(s.nome)}</span><div><button class="btn-secondary btn-small" onclick="renderGrupoSubgrupoReceita('subgrupo',${gi},${si})">Editar</button><button class="btn-danger btn-small" onclick="excluirSubgrupoReceita(${gi},${si})">Excluir</button></div></div>`; }); html+="</div></div>"; });
  conteudo.innerHTML=html;
}
