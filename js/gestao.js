/* ================================================================
   GESTÃO (CRUD)
================================================================ */
function openModal(html){
  modal.style.display="flex";
  document.getElementById("modal-body").innerHTML=html;
  setTimeout(prepararCamposMoeda, 0);
}
function closeModal(){ modal.style.display="none"; }
function label(m){ return{contas:"Conta",clientes:"Cliente",fornecedores:"Fornecedor",vendedores:"Vendedor"}[m]; }
function plural(m){ return{contas:"Contas",clientes:"Clientes",fornecedores:"Fornecedores",vendedores:"Vendedores"}[m]; }
function prefixoLista(m){ return m==="contas"?"Minhas":"Meus"; }

function renderSubmenu(m){ conteudo.innerHTML=`<h2>${plural(m)}</h2><button class="btn-primary" onclick="renderForm('${m}')">+ ${label(m)}</button><button class="btn-secondary" onclick="renderLista('${m}')">${prefixoLista(m)} ${plural(m)}</button>`; }

function renderLista(m){
  let html=`<h2>${prefixoLista(m)} ${plural(m)}</h2><button class="btn-secondary" onclick="renderSubmenu('${m}')">Voltar</button><button class="btn-primary" onclick="renderForm('${m}')">+ ${label(m)}</button><hr>`;
  // Exibe clientes, fornecedores e vendedores em ordem alfabética sem alterar os índices reais do banco.
  const itens = db[m].map((item, idx)=>({item, idx}));
  if(['clientes','fornecedores','vendedores'].includes(m)){
    itens.sort((a,b)=>(a.item.nome||'').localeCompare((b.item.nome||''),'pt-BR',{sensitivity:'base',numeric:true}));
  }
  itens.forEach(({item:i,idx})=>{
    let det="";
    if(m==="contas") det=`<div class="detail" style="display:block">${escaparHTML(i.banco)} | ${escaparHTML(i.tipo)} | Saldo: ${moedaBR(numeroBR(i.saldo))}</div>`;
    else if(m==="vendedores") det=`<div id="det-${m}-${idx}" class="detail">Comissão: ${i.comissao}%<br>CPF/CNPJ: ${escaparHTML(i.doc)}<br>${escaparHTML(i.cidade)} - ${escaparHTML(i.estado)}</div>`;
    else if(m==="clientes") det=`<div id="det-${m}-${idx}" class="detail">CPF/CNPJ: ${escaparHTML(i.doc||'-')}<br>Telefone: ${escaparHTML(i.telefone||'-')}<br>Endereço: ${escaparHTML(i.end||'-')}<br>${escaparHTML(i.cidade||'')}${i.cidade&&i.estado?' - ':''}${escaparHTML(i.estado||'')}</div>`;
    else det=`<div id="det-${m}-${idx}" class="detail">CPF/CNPJ: ${escaparHTML(i.doc)}<br>Endereço: ${escaparHTML(i.end)}<br>${escaparHTML(i.cidade)} - ${escaparHTML(i.estado)}</div>`;
    html+=`<div class="card"><div class="row"><div onclick="${m==='contas'?'':'toggleDetalhe(\''+m+'\','+idx+')'}" style="cursor:pointer;font-weight:bold">${escaparHTML(i.nome)}</div><div><button class="btn-primary" onclick="renderForm('${m}',${idx})">Editar</button><button class="btn-danger" onclick="removeItem('${m}',${idx})">Excluir</button></div></div>${det}</div>`;
  });
  conteudo.innerHTML=html;
}

function toggleDetalhe(m,i){ const el=document.getElementById(`det-${m}-${i}`); el.style.display=el.style.display==="block"?"none":"block"; }

function renderForm(m,index=null){
  if(m==="contas") return renderFormConta(index);
  if(m==="vendedores") return renderFormVendedor(index);
  let i=index!==null?db[m][index]:{nome:"",doc:"",telefone:"",end:"",cidade:"",estado:""};
  const campoTelefone = m==="clientes" ? `<label>Telefone</label><input id="telefone" type="tel" inputmode="tel" placeholder="(00) 00000-0000" value="${escaparAtributo(i.telefone||'')}">` : '';
  openModal(`<h3>${index===null?"Cadastrar":"Editar"} ${label(m)}</h3><label>Nome / Razão Social</label><input id="nome" value="${escaparAtributo(i.nome)}"><label>CPF / CNPJ</label><input id="doc" value="${escaparAtributo(i.doc)}">${campoTelefone}<label>Endereço</label><input id="end" value="${escaparAtributo(i.end)}"><label>Cidade</label><input id="cidade" value="${escaparAtributo(i.cidade)}"><label>Estado</label><input id="estado" value="${escaparAtributo(i.estado)}"><div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveCadastro('${m}',${index})">Salvar</button></div>`);
}

function renderFormVendedor(index=null){
  let i=index!==null?db.vendedores[index]:{nome:"",doc:"",end:"",cidade:"",estado:"",comissao:"",meta:0,comissaoBonus:0};
  openModal(`<h3>${index===null?"Cadastrar":"Editar"} Vendedor</h3>
    <label>Nome</label><input id="nome" value="${escaparAtributo(i.nome)}">
    <label>CPF / CNPJ</label><input id="doc" value="${escaparAtributo(i.doc)}">
    <label>Endereço</label><input id="end" value="${escaparAtributo(i.end)}">
    <div style="display:flex; gap:10px">
      <div style="flex:2"><label>Cidade</label><input id="cidade" value="${escaparAtributo(i.cidade)}"></div>
      <div style="flex:1"><label>Estado</label><input id="estado" value="${escaparAtributo(i.estado)}"></div>
    </div>
    <hr>
    <div style="display:flex; gap:10px">
      <div style="flex:1"><label>% Comissão Base</label><input id="comissao" type="number" value="${i.comissao}"></div>
      <div style="flex:1"><label>Meta de Vendas (R$)</label><input id="meta" data-moeda="br" value="${moedaBR(numeroBR(i.meta||0))}"></div>
      <div style="flex:1"><label>% Comissão Bônus</label><input id="comissaoBonus" type="number" value="${i.comissaoBonus||0}"></div>
    </div>
    <p style="font-size:11px; color:#94a3b8; margin-top:5px">Dica: Se o vendedor vender mais que a meta, a comissão bônus será aplicada.</p>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveVendedor(${index})">Salvar</button></div>`);
}

function renderFormConta(index=null){
  let i=index!==null?db.contas[index]:{nome:"",banco:"",tipo:"Corrente",saldo:""};
  openModal(`<h3>${index===null?"Cadastrar":"Editar"} Conta</h3><label>Nome</label><input id="nome" value="${escaparAtributo(i.nome)}"><label>Banco</label><input id="banco" value="${escaparAtributo(i.banco)}"><label>Tipo</label><select id="tipo"><option>Corrente</option><option>Caixa</option><option>Carteira</option><option>Investimento</option></select><label>Saldo Inicial / Base do Caixa</label><input id="saldo" data-moeda="br" value="${moedaBR(numeroBR(i.saldoInicial!==undefined?i.saldoInicial:i.saldo))}"><div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveConta(${index})">Salvar</button></div>`);
}

async function saveCadastro(m,index){
  return executarOperacaoProtegida(document.activeElement, async()=>{
    const antes=clonarEstado(db[m]);
    let obj={nome:nome.value.trim(),doc:doc.value.trim(),end:end.value.trim(),cidade:cidade.value.trim(),estado:estado.value.trim()};
    if(m==="clientes") obj.telefone=(document.getElementById("telefone")?.value||"").trim();
    if(!obj.nome){ alert("Informe o nome."); return false; }
    if(index===null||index==="null") db[m].push(obj); else db[m][index]=obj;
    if(!await persist(m)){ db[m]=antes; return false; }
    closeModal(); renderLista(m); return true;
  });
}
async function saveVendedor(index){
  return executarOperacaoProtegida(document.activeElement, async()=>{
    const antes=clonarEstado(db.vendedores);
    let obj={nome:nome.value.trim(),doc:doc.value.trim(),end:end.value.trim(),cidade:cidade.value.trim(),estado:estado.value.trim(),comissao:parseFloat(comissao.value)||0,meta:numeroBR(meta.value),comissaoBonus:parseFloat(comissaoBonus.value)||0};
    if(!obj.nome){ alert("Informe o nome do vendedor."); return false; }
    if(index===null||index==="null") db.vendedores.push(obj); else db.vendedores[index]=obj;
    if(!await persist("vendedores")){ db.vendedores=antes; return false; }
    closeModal(); renderLista("vendedores"); return true;
  });
}
async function saveConta(index){
  return executarOperacaoProtegida(document.activeElement, async()=>{
    const antes=clonarEstado(db.contas);
    let saldoBase=numeroBR(saldo.value);
    let obj={nome:nome.value.trim(),banco:banco.value.trim(),tipo:tipo.value,saldoInicial:saldoBase,saldo:saldoBase};
    if(!obj.nome){ alert("Informe o nome da conta."); return false; }
    if(index===null||index==="null") db.contas.push(obj); else db.contas[index]=obj;
    recalcularSaldosContas();
    if(!await persist("contas")){ db.contas=antes; recalcularSaldosContas(); return false; }
    closeModal(); renderLista("contas"); return true;
  });
}
function cadastroPossuiVinculos(m,item){
  const nome=item?.nome||'';
  if(m==='contas') return db.receitas.some(r=>r.conta===nome)||db.despesas.some(d=>d.conta===nome);
  if(m==='clientes') return db.receitas.some(r=>r.cliente===nome);
  if(m==='fornecedores') return db.despesas.some(d=>d.fornecedor===nome);
  if(m==='vendedores') return db.receitas.some(r=>r.vendedor===nome)||db.despesas.some(d=>d.fornecedor===nome);
  return false;
}
async function removeItem(m,i){
  const item=db[m]?.[i]; if(!item) return;
  if(cadastroPossuiVinculos(m,item)){ alert(`Não é possível excluir ${label(m).toLowerCase()} com lançamentos vinculados. Edite o cadastro ou mantenha-o para preservar o histórico.`); return; }
  if(!confirm(`Excluir ${label(m).toLowerCase()} "${item.nome||''}"?`)) return;
  const antes=clonarEstado(db[m]);
  db[m].splice(i,1);
  if(!await persist(m)){ db[m]=antes; return; }
  renderLista(m);
}
