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
let boletosImportadosReceita=[];
let parcelasPlanejadasReceita=[];

function normalizarFormaPagamentoReceita(valor){
  const v=String(valor||'').toLowerCase();
  return ['pix','boleto','dinheiro'].includes(v)?v:'';
}
function somenteDigitos(valor){ return String(valor||'').replace(/\D/g,''); }
function formatarLinhaDigitavel(digitos){
  const d=somenteDigitos(digitos);
  if(d.length===47) return `${d.slice(0,5)}.${d.slice(5,10)} ${d.slice(10,15)}.${d.slice(15,21)} ${d.slice(21,26)}.${d.slice(26,32)} ${d.slice(32,33)} ${d.slice(33)}`;
  if(d.length===48) return `${d.slice(0,12)} ${d.slice(12,24)} ${d.slice(24,36)} ${d.slice(36,48)}`;
  return String(digitos||'').trim();
}
function dataBRparaISO(data){
  const m=String(data||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m?`${m[3]}-${m[2]}-${m[1]}`:'';
}
function extrairLinhaDigitavelTexto(texto){
  const limpo=String(texto||'').replace(/\u00a0/g,' ');
  const candidatos=[];
  const padroes=[
    /(?:\d{5}[.\s]?\d{5}\s+\d{5}[.\s]?\d{6}\s+\d{5}[.\s]?\d{6}\s+\d\s+\d{14})/g,
    /(?:\d{11,12}\s+\d{11,12}\s+\d{11,12}\s+\d{11,12})/g,
    /(?:\d[\d.\s-]{44,90}\d)/g
  ];
  padroes.forEach(re=>{ (limpo.match(re)||[]).forEach(x=>{ const d=somenteDigitos(x); if(d.length===47||d.length===48) candidatos.push(d); }); });
  if(!candidatos.length){
    const blocos=limpo.match(/\d{44,48}/g)||[];
    blocos.forEach(d=>{ if(d.length===47||d.length===48) candidatos.push(d); });
  }
  return candidatos.length?formatarLinhaDigitavel(candidatos[0]):'';
}
function extrairVencimentoTexto(texto){
  const t=String(texto||'');
  const reContexto=/(?:vencimento|data\s+de\s+vencimento)[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/i;
  const m=t.match(reContexto);
  if(m) return dataBRparaISO(m[1]);
  const datas=[...(t.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g))].map(x=>x[1]);
  return datas.length?dataBRparaISO(datas[0]):'';
}
function extrairValorBoletoTexto(texto){
  const t=String(texto||'');
  const padroes=[
    /(?:valor\s+(?:do\s+)?documento|valor\s+cobrado|valor\s+nominal|valor\s+do\s+boleto)[^\d]{0,30}(?:R\$\s*)?([\d.]+,\d{2})/i,
    /(?:R\$\s*)([\d.]+,\d{2})/i
  ];
  for(const re of padroes){ const m=t.match(re); if(m) return numeroBR(m[1]); }
  return 0;
}
async function lerPaginasPDFBoleto(file){
  if(!window.pdfjsLib) throw new Error('Leitor de PDF indisponível. Verifique a conexão com a internet e recarregue o sistema.');
  try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }catch(_e){}
  const buffer=await file.arrayBuffer();
  const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(buffer)}).promise;
  const paginas=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    paginas.push({pagina:i,texto:content.items.map(item=>item.str||'').join(' ').replace(/\s+/g,' ').trim()});
  }
  return paginas;
}
function boletoExtraidoDeTexto(texto,arquivo,paginas){
  return {arquivo,paginas,linhaDigitavel:extrairLinhaDigitavelTexto(texto),vencimento:extrairVencimentoTexto(texto),valor:extrairValorBoletoTexto(texto),importadoEm:new Date().toISOString()};
}
function extrairBoletosDasPaginas(paginas,arquivo){
  const resultados=[];
  let atual=null;
  for(const p of paginas){
    const item=boletoExtraidoDeTexto(p.texto,arquivo,String(p.pagina));
    const temDados=!!(item.linhaDigitavel||item.vencimento||numeroBR(item.valor)>0);
    if(!temDados){
      if(atual){ atual.texto+=' '+p.texto; atual.paginas+=','+p.pagina; }
      continue;
    }
    // Um novo vencimento ou uma nova linha digitável normalmente marca o início de outro boleto.
    if(atual && ((item.linhaDigitavel&&item.linhaDigitavel!==atual.linhaDigitavel)||(item.vencimento&&atual.vencimento&&item.vencimento!==atual.vencimento))){
      resultados.push(atual); atual=null;
    }
    if(!atual){ atual={...item,texto:p.texto}; }
    else{
      atual.texto+=' '+p.texto; atual.paginas+=','+p.pagina;
      if(!atual.linhaDigitavel&&item.linhaDigitavel) atual.linhaDigitavel=item.linhaDigitavel;
      if(!atual.vencimento&&item.vencimento) atual.vencimento=item.vencimento;
      if(!numeroBR(atual.valor)&&numeroBR(item.valor)>0) atual.valor=item.valor;
    }
  }
  if(atual) resultados.push(atual);
  // Fallback: alguns bancos geram um boleto por página; se o agrupamento não separou mas há várias páginas com dados distintos, usa uma entrada por página.
  if(resultados.length<=1 && paginas.length>1){
    const porPagina=paginas.map(p=>boletoExtraidoDeTexto(p.texto,arquivo,String(p.pagina))).filter(b=>b.linhaDigitavel||b.vencimento||numeroBR(b.valor)>0);
    const chaves=new Set(porPagina.map(b=>`${somenteDigitos(b.linhaDigitavel)}|${b.vencimento}|${numeroBR(b.valor)}`));
    if(porPagina.length>1 && chaves.size>1) return porPagina;
  }
  return resultados.map(({texto,...b})=>b);
}
async function importarBoletosPDF(input){
  const arquivos=[...(input?.files||[])];
  if(!arquivos.length) return;
  const status=document.getElementById('statusImportacaoBoleto');
  if(status) status.textContent='Lendo boleto(s) e separando as parcelas...';
  boletosImportadosReceita=[];
  parcelasPlanejadasReceita=[];
  for(const file of arquivos){
    try{
      const paginas=await lerPaginasPDFBoleto(file);
      const encontrados=extrairBoletosDasPaginas(paginas,file.name);
      if(encontrados.length) boletosImportadosReceita.push(...encontrados);
      else boletosImportadosReceita.push({arquivo:file.name,paginas:`1-${paginas.length}`,linhaDigitavel:'',vencimento:'',valor:0,erro:'Nenhum boleto reconhecido'});
    }catch(err){
      console.error('Erro ao ler boleto',file.name,err);
      boletosImportadosReceita.push({arquivo:file.name,paginas:'',linhaDigitavel:'',vencimento:'',valor:0,erro:err.message||'Falha na leitura'});
    }
  }
  boletosImportadosReceita.sort((a,b)=>(a.vencimento||'9999-12-31').localeCompare(b.vencimento||'9999-12-31'));
  const validos=boletosImportadosReceita.filter(b=>b.vencimento||b.valor||b.linhaDigitavel);
  if(validos.length){
    const primeiro=validos[0];
    const venc=document.getElementById('vencimento'); if(venc&&primeiro.vencimento) venc.value=primeiro.vencimento;
    const campoValor=document.getElementById('valor');
    const valores=validos.filter(b=>numeroBR(b.valor)>0);
    if(campoValor&&valores.length===validos.length){ campoValor.value=moedaBR(valores.reduce((s,b)=>s+numeroBR(b.valor),0)); }
    const linha=document.getElementById('linhaDigitavel'); if(linha&&validos.length===1&&primeiro.linhaDigitavel) linha.value=primeiro.linhaDigitavel;
  }
  renderResumoBoletosImportados();
  sincronizarParcelasPlanejadasReceita(true);
}
function atualizarBoletoImportado(indice,campo,valor){
  if(!boletosImportadosReceita[indice]) return;
  boletosImportadosReceita[indice][campo]=campo==='valor'?numeroBR(valor):valor;
  sincronizarParcelasPlanejadasReceita(true);
}
function renderResumoBoletosImportados(){
  const box=document.getElementById('resumoBoletosImportados');
  const status=document.getElementById('statusImportacaoBoleto');
  if(!box) return;
  if(!boletosImportadosReceita.length){ box.innerHTML=''; if(status) status.textContent=''; return; }
  const completos=boletosImportadosReceita.filter(b=>b.linhaDigitavel&&b.vencimento&&numeroBR(b.valor)>0).length;
  if(status) status.textContent=`${boletosImportadosReceita.length} boleto(s) identificado(s). ${completos} com linha, vencimento e valor reconhecidos.`;
  box.innerHTML=`<div style="overflow:auto;margin-top:10px"><table><tr><th>Arquivo/Página</th><th>Vencimento</th><th>Valor</th><th>Linha digitável</th></tr>${boletosImportadosReceita.map((b,i)=>`<tr>
    <td>${escaparHTML((b.arquivo||'')+(b.paginas?' — pág. '+b.paginas:''))}</td>
    <td><input type="date" value="${escaparAtributo(b.vencimento||'')}" onchange="atualizarBoletoImportado(${i},'vencimento',this.value)"></td>
    <td><input data-moeda="br" value="${escaparAtributo(b.valor?moedaBR(numeroBR(b.valor)):'')}" onchange="atualizarBoletoImportado(${i},'valor',this.value)"></td>
    <td><input value="${escaparAtributo(b.linhaDigitavel||'')}" placeholder="Confira ou cole manualmente" onchange="atualizarBoletoImportado(${i},'linhaDigitavel',this.value)"></td>
  </tr>`).join('')}</table></div><p style="font-size:12px;color:#f59e0b;margin-top:8px">Confira os dados reconhecidos antes de salvar. PDFs digitalizados como imagem podem não ser lidos automaticamente.</p>`;
}
function valorParcelaPadraoReceita(total,qtd,indice){
  const base=Math.floor((numeroBR(total)/qtd)*100)/100;
  if(indice===qtd-1) return Math.round((numeroBR(total)-base*(qtd-1))*100)/100;
  return base;
}
function atualizarParcelaPlanejadaReceita(indice,campo,valor){
  if(!parcelasPlanejadasReceita[indice]) return;
  parcelasPlanejadasReceita[indice][campo]=campo==='valor'?numeroBR(valor):valor;
}
function sincronizarParcelasPlanejadasReceita(preferirBoletos=false){
  const tipo=document.getElementById('tipoVenda')?.value||'avista';
  const indexAtual=document.getElementById('receitaEditandoId')?.value||'';
  const box=document.getElementById('planejamentoParcelasReceita');
  if(!box || indexAtual || tipo!=='prazo'){ if(box) box.innerHTML=''; return; }
  const qtd=Math.max(1,parseInt(document.getElementById('qtdParcelas')?.value||1));
  const total=numeroBR(document.getElementById('valor')?.value||0);
  const forma=normalizarFormaPagamentoReceita(document.getElementById('formaPagamento')?.value);
  const anterior=parcelasPlanejadasReceita.slice();
  parcelasPlanejadasReceita=[];
  for(let i=0;i<qtd;i++){
    const boleto=forma==='boleto'?boletosImportadosReceita[i]:null;
    const prev=anterior[i]||{};
    parcelasPlanejadasReceita.push({
      parcela:i+1,
      vencimento:(preferirBoletos&&boleto?.vencimento)?boleto.vencimento:(prev.vencimento||boleto?.vencimento||''),
      valor:(preferirBoletos&&numeroBR(boleto?.valor)>0)?numeroBR(boleto.valor):(numeroBR(prev.valor)>0?numeroBR(prev.valor):valorParcelaPadraoReceita(total,qtd,i)),
      linhaDigitavel:boleto?.linhaDigitavel||prev.linhaDigitavel||'',
      boletoArquivoNome:boleto?.arquivo||prev.boletoArquivoNome||'',
      boletoPaginas:boleto?.paginas||prev.boletoPaginas||''
    });
  }
  renderPlanejamentoParcelasReceita();
}
function renderPlanejamentoParcelasReceita(){
  const box=document.getElementById('planejamentoParcelasReceita');
  if(!box) return;
  const forma=normalizarFormaPagamentoReceita(document.getElementById('formaPagamento')?.value);
  if(!parcelasPlanejadasReceita.length){ box.innerHTML=''; return; }
  box.innerHTML=`<div style="margin-top:12px;overflow:auto"><b>Conferência das parcelas</b><p style="font-size:12px;color:#94a3b8;margin:5px 0 8px">Cada parcela tem sua própria data. O sistema não cria vencimentos mensais automaticamente.</p><table><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th>${forma==='boleto'?'<th>Boleto</th>':''}</tr>${parcelasPlanejadasReceita.map((p,i)=>`<tr><td>${i+1}/${parcelasPlanejadasReceita.length}</td><td><input type="date" value="${escaparAtributo(p.vencimento||'')}" onchange="atualizarParcelaPlanejadaReceita(${i},'vencimento',this.value)"></td><td><input data-moeda="br" value="${escaparAtributo(moedaBR(numeroBR(p.valor)))}" onchange="atualizarParcelaPlanejadaReceita(${i},'valor',this.value)"></td>${forma==='boleto'?`<td>${p.linhaDigitavel?'✓ Linha identificada':'⚠ Linha não identificada'}${p.boletoArquivoNome?`<br><small>${escaparHTML(p.boletoArquivoNome)}${p.boletoPaginas?' — pág. '+escaparHTML(p.boletoPaginas):''}</small>`:''}</td>`:''}</tr>`).join('')}</table></div>`;
}
function toggleFormaPagamentoReceita(){
  const forma=normalizarFormaPagamentoReceita(document.getElementById('formaPagamento')?.value);
  const boleto=document.getElementById('boxBoletoReceita');
  const pix=document.getElementById('boxPixReceita');
  if(boleto) boleto.style.display=forma==='boleto'?'block':'none';
  if(pix) pix.style.display=forma==='pix'?'block':'none';
  sincronizarParcelasPlanejadasReceita(forma==='boleto');
}

function renderReceitas(){ conteudo.innerHTML=`<h2>Receitas</h2><button class="btn-primary" onclick="renderFormReceita()">+ Receita</button><button class="btn-secondary" onclick="renderListaReceitas()">Minhas Receitas</button><button class="btn-primary" onclick="renderReguaCobranca()">📲 Régua de Cobrança</button><br><br><button class="btn-primary" onclick="renderGrupoSubgrupoReceita()">+ Grupos/Subgrupos</button><button class="btn-secondary" onclick="renderListaGrupoReceita()">Grupos</button>`; }

function renderFormReceita(identificador=null){
  const index=encontrarIndiceReceita(identificador);
  let r=index!==null?db.receitas[index]:{cliente:"",vendedor:"",conta:"",grupo:"",subgrupo:"",dataVenda:"",tipoVenda:"avista",formaPagamento:"pix",vencimento:"",valor:"",situacao:"A receber",dataRecebimento:"",qtdParcelas:1,parcelaAtual:1,linhaDigitavel:""};
  boletosImportadosReceita=[];
  const dataVendaPadrao = r.dataVenda || r.vencimento || "";
  const tipoPadrao = r.tipoVenda || "avista";
  const qtdPadrao = r.qtdParcelas || 1;
  openModal(`<input type="hidden" id="receitaEditandoId" value="${index!==null?escaparAtributo(r.id||''):''}"><h3>${index===null?"Cadastrar":"Editar"} Receita ${index!==null && (r.tipoVenda||'avista')==='prazo' ? '- Parcela '+(r.parcelaAtual||1)+'/'+(r.qtdParcelas||1) : ''}</h3>
  <label>Cliente</label><div id="clienteReceitaWrap" style="position:relative"><input id="cliente" autocomplete="off" placeholder="Digite o nome do cliente..." value="${escaparAtributo(r.cliente||"")}" onfocus="mostrarClientesReceita()" oninput="filtrarClientesReceita(this.value)" onkeydown="navegarClientesReceita(event)"><div id="listaClientesReceita" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 2px);background:#0f172a;border:1px solid #334155;border-radius:0 0 10px 10px;max-height:280px;overflow-y:auto;z-index:10000;box-shadow:0 10px 20px rgba(0,0,0,.5)"></div></div>
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
  <label>Forma de pagamento</label>
  <select id="formaPagamento" onchange="toggleFormaPagamentoReceita()">
    <option value="pix" ${normalizarFormaPagamentoReceita(r.formaPagamento)==='pix'?"selected":""}>PIX</option>
    <option value="boleto" ${normalizarFormaPagamentoReceita(r.formaPagamento)==='boleto'?"selected":""}>Boleto</option>
    <option value="dinheiro" ${normalizarFormaPagamentoReceita(r.formaPagamento)==='dinheiro'?"selected":""}>Dinheiro</option>
  </select>
  <div id="boxPixReceita" style="display:none;padding:10px 12px;margin-top:8px;border:1px solid #1e3a5f;border-radius:10px">
    <b>PIX cadastrado:</b> ${escaparHTML(db.empresa.pix||'Não configurado')}
    <div style="font-size:12px;color:#94a3b8;margin-top:5px">A chave pode ser alterada em Configurações → Dados da Empresa.</div>
  </div>
  <div id="boxBoletoReceita" style="display:none;padding:12px;margin-top:8px;border:1px solid #1e3a5f;border-radius:10px">
    <label>Importar boleto(s) em PDF</label>
    <input type="file" id="boletosPDF" accept="application/pdf,.pdf" multiple onchange="importarBoletosPDF(this)">
    <p style="font-size:12px;color:#94a3b8;margin-top:6px">Você pode importar um único PDF do banco contendo vários boletos ou vários PDFs. O sistema tenta separar os boletos, identificar vencimento, valor e linha digitável e relacioná-los às parcelas pela ordem dos vencimentos. Confira antes de salvar.</p>
    <div id="statusImportacaoBoleto" style="font-size:12px;margin-top:8px"></div>
    <div id="resumoBoletosImportados"></div>
    <label style="margin-top:10px">Linha digitável ${index!==null?'desta parcela':'(opcional, para um único boleto)'}</label>
    <input id="linhaDigitavel" value="${escaparAtributo(r.linhaDigitavel||'')}" placeholder="Cole manualmente se o PDF não for reconhecido">
  </div>
  <div id="boxParcelasReceita" style="display:none">
    <label>Quantidade de parcelas</label><input type="number" id="qtdParcelas" value="${qtdPadrao}" min="1" onchange="sincronizarParcelasPlanejadasReceita()" oninput="sincronizarParcelasPlanejadasReceita()">
    <p style="font-size:12px;color:#94a3b8;margin-top:6px">Ao cadastrar uma venda parcelada, informe ou confira a data de cada parcela abaixo. Não existe periodicidade mensal automática.</p>
    <div id="planejamentoParcelasReceita"></div>
  </div>
  <div id="boxVencimentoUnicoReceita"><label id="labelVencimentoReceita">Vencimento</label><input type="date" id="vencimento" value="${r.vencimento}"></div>
  <label>Valor ${index===null?'total':'da parcela'}</label><input id="valor" data-moeda="br" value="${moedaBR(numeroBR(r.valor))}" onchange="sincronizarParcelasPlanejadasReceita()">
  <label>Situação</label><select id="situacao" onchange="toggleRecebimento()"><option ${r.situacao==="A receber"?"selected":""}>A receber</option><option ${r.situacao==="Recebido"?"selected":""}>Recebido</option></select>
  <div id="boxRecebimento" style="display:none"><label>Data recebimento</label><input type="date" id="dataRecebimento" value="${r.dataRecebimento||""}"></div>
  <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveReceita('${index!==null?escaparJSReceita(r.id):''}')">Salvar</button></div>`);
  setTimeout(()=>{ carregarSubgruposReceita(r.subgrupo); toggleRecebimento(); toggleParcelasReceita(); toggleFormaPagamentoReceita(); sincronizarParcelasPlanejadasReceita(true); },100);
}

function clientesOrdenadosReceita(){
  return (db.clientes||[]).slice().sort((a,b)=>String(a?.nome||'').localeCompare(String(b?.nome||''),'pt-BR',{sensitivity:'base'}));
}
function renderClientesReceita(filtro=''){
  const box=document.getElementById('listaClientesReceita');
  const campo=document.getElementById('cliente');
  if(!box||!campo) return;
  const termo=String(filtro||'').trim().toLocaleLowerCase('pt-BR');
  const clientes=clientesOrdenadosReceita().filter(c=>String(c?.nome||'').toLocaleLowerCase('pt-BR').includes(termo));
  box.innerHTML=clientes.map(c=>{
    const nome=String(c.nome||'');
    return `<div data-cliente-receita="${escaparAtributo(nome)}" style="padding:10px 12px;color:#fff;background:#0f172a;cursor:pointer;font-size:13px;border-bottom:1px solid #1e293b" onmouseenter="this.style.background='#2563eb'" onmouseleave="this.style.background='#0f172a'" onclick="selecionarClienteReceita(this.dataset.clienteReceita)">${escaparHTML(nome)}</div>`;
  }).join('');
  box.style.display=clientes.length?'block':'none';
}
function mostrarClientesReceita(){ renderClientesReceita(''); }
function filtrarClientesReceita(valor){ renderClientesReceita(valor); }
function selecionarClienteReceita(nome){
  const campo=document.getElementById('cliente');
  const box=document.getElementById('listaClientesReceita');
  if(campo) campo.value=nome;
  if(box) box.style.display='none';
}
function fecharListaClientesReceita(event){
  const wrap=document.getElementById('clienteReceitaWrap');
  if(wrap && !wrap.contains(event.target)){
    const box=document.getElementById('listaClientesReceita');
    if(box) box.style.display='none';
  }
}
function navegarClientesReceita(event){
  if(event.key==='Escape'){
    const box=document.getElementById('listaClientesReceita');
    if(box) box.style.display='none';
  }
}
if(!window._listenerClientesReceita){
  document.addEventListener('mousedown',fecharListaClientesReceita);
  window._listenerClientesReceita=true;
}

function carregarSubgruposReceita(sel=""){ subgrupo.innerHTML=db.subgruposReceitas.filter(s=>s.grupo===grupo.value).map(s=>`<option ${s.nome===sel?"selected":""}>${escaparHTML(s.nome)}</option>`).join(""); }
function toggleRecebimento(){ boxRecebimento.style.display=situacao.value==="Recebido"?"block":"none"; }
function toggleParcelasReceita(){
  const tipo=document.getElementById('tipoVenda')?.value||'avista';
  const box=document.getElementById('boxParcelasReceita');
  const boxVenc=document.getElementById('boxVencimentoUnicoReceita');
  const editando=!!(document.getElementById('receitaEditandoId')?.value||'');
  if(box) box.style.display=(tipo==='prazo'&&!editando)?'block':'none';
  if(boxVenc) boxVenc.style.display=(tipo==='prazo'&&!editando)?'none':'block';
  const dv=document.getElementById('dataVenda');
  const venc=document.getElementById('vencimento');
  if(tipo==='avista' && dv && venc && !venc.value) venc.value=dv.value;
  sincronizarParcelasPlanejadasReceita();
}
function gerarIdReceita(prefixo='REC'){
  return prefixo + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
}
async function saveReceita(identificador=null){
  const antesReceitas=clonarEstado(db.receitas), antesContas=clonarEstado(db.contas);
  const index=encontrarIndiceReceita(identificador);
  const tipo=document.getElementById('tipoVenda')?.value||'avista';
  const formaPagamento=normalizarFormaPagamentoReceita(document.getElementById('formaPagamento')?.value)||'pix';
  const linhaDigitavelManual=(document.getElementById('linhaDigitavel')?.value||'').trim();
  const dataVendaValor=(document.getElementById('dataVenda')?.value)||(document.getElementById('vencimento')?.value)||'';
  const qtd=Math.max(1,parseInt(document.getElementById('qtdParcelas')?.value||1));
  const valorTotal=numeroBR(document.getElementById('valor')?.value||0);
  const vencimentoInformado=document.getElementById('vencimento')?.value||'';
  const transacaoAnterior=index!==null?db.receitas[index]:null;

  if(index!==null){
    const vencimentoFinal=tipo==='avista'?(vencimentoInformado||dataVendaValor):vencimentoInformado;
    if(!vencimentoFinal){ alert('Informe o vencimento desta receita.'); return false; }
    const novaObj={...transacaoAnterior,id:transacaoAnterior?.id||gerarIdReceita('REC'),vendaId:transacaoAnterior?.vendaId||gerarIdReceita('VENDA'),cliente:cliente.value,vendedor:vendedor.value,conta:conta.value,grupo:grupo.value,subgrupo:subgrupo.value,dataVenda:dataVendaValor,tipoVenda:tipo,formaPagamento,vencimento:vencimentoFinal,valor:valorTotal,linhaDigitavel:formaPagamento==='boleto'?linhaDigitavelManual:'',situacao:situacao.value,dataRecebimento:situacao.value==='Recebido'?dataRecebimento.value:'',qtdParcelas:transacaoAnterior?.qtdParcelas||1,parcelaAtual:transacaoAnterior?.parcelaAtual||1,atualizadoEm:new Date().toISOString()};
    await ajustarSaldoPorTransacao('receita',novaObj,transacaoAnterior);
    db.receitas[index]=novaObj;
  }else if(tipo==='prazo'){
    sincronizarParcelasPlanejadasReceita(formaPagamento==='boleto');
    if(parcelasPlanejadasReceita.length!==qtd){ alert('Não foi possível montar todas as parcelas. Confira a quantidade informada.'); return false; }
    const semData=parcelasPlanejadasReceita.findIndex(p=>!p.vencimento);
    if(semData>=0){ alert(`Informe o vencimento da parcela ${semData+1}/${qtd}.`); return false; }
    if(formaPagamento==='boleto'){
      const semLinha=parcelasPlanejadasReceita.findIndex(p=>!String(p.linhaDigitavel||'').trim());
      if(semLinha>=0 && !confirm(`A parcela ${semLinha+1}/${qtd} está sem linha digitável reconhecida. Deseja salvar mesmo assim e completar depois?`)) return false;
    }
    const soma=Math.round(parcelasPlanejadasReceita.reduce((t,p)=>t+numeroBR(p.valor),0)*100)/100;
    if(Math.abs(soma-valorTotal)>0.01){
      if(!confirm(`A soma das parcelas (${moedaBR(soma)}) é diferente do valor total da venda (${moedaBR(valorTotal)}). Deseja salvar com os valores das parcelas exibidos?`)) return false;
    }
    const vendaId=gerarIdReceita('VENDA');
    for(let n=0;n<qtd;n++){
      const plan=parcelasPlanejadasReceita[n];
      const boleto=formaPagamento==='boleto'?boletosImportadosReceita[n]:null;
      const novaObj={id:gerarIdReceita('REC'),vendaId,cliente:cliente.value,vendedor:vendedor.value,conta:conta.value,grupo:grupo.value,subgrupo:subgrupo.value,dataVenda:dataVendaValor,tipoVenda:'prazo',formaPagamento,vencimento:plan.vencimento,valor:numeroBR(plan.valor),linhaDigitavel:formaPagamento==='boleto'?String(plan.linhaDigitavel||'').trim():'',situacao:situacao.value,dataRecebimento:situacao.value==='Recebido'?dataRecebimento.value:'',qtdParcelas:qtd,parcelaAtual:n+1,criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()};
      if(boleto){ novaObj.boletoArquivoNome=boleto.arquivo||''; novaObj.boletoPaginas=boleto.paginas||''; novaObj.boletoImportadoEm=boleto.importadoEm||new Date().toISOString(); }
      await ajustarSaldoPorTransacao('receita',novaObj,null);
      db.receitas.push(novaObj);
    }
  }else{
    const vencimentoFinal=vencimentoInformado||dataVendaValor;
    if(!vencimentoFinal){ alert('Informe a data da venda/vencimento.'); return false; }
    const novaObj={id:gerarIdReceita('REC'),vendaId:gerarIdReceita('VENDA'),cliente:cliente.value,vendedor:vendedor.value,conta:conta.value,grupo:grupo.value,subgrupo:subgrupo.value,dataVenda:dataVendaValor,tipoVenda:'avista',formaPagamento,vencimento:vencimentoFinal,valor:valorTotal,linhaDigitavel:formaPagamento==='boleto'?(boletosImportadosReceita[0]?.linhaDigitavel||linhaDigitavelManual||''):'',situacao:situacao.value,dataRecebimento:situacao.value==='Recebido'?dataRecebimento.value:'',qtdParcelas:1,parcelaAtual:1,criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()};
    if(formaPagamento==='boleto'&&boletosImportadosReceita[0]){ const b=boletosImportadosReceita[0]; if(b.vencimento) novaObj.vencimento=b.vencimento; if(numeroBR(b.valor)>0) novaObj.valor=numeroBR(b.valor); novaObj.boletoArquivoNome=b.arquivo||''; novaObj.boletoPaginas=b.paginas||''; novaObj.boletoImportadoEm=b.importadoEm||new Date().toISOString(); }
    await ajustarSaldoPorTransacao('receita',novaObj,null);
    db.receitas.push(novaObj);
  }
  const ok=await aposAlterarFinanceiro('receitas');
  if(!ok){ db.receitas=antesReceitas; db.contas=antesContas; return false; }
  closeModal(); mostrarToast('✓ Receita salva com sucesso! Dashboard atualizado.'); return true;
}


function obterClienteReceita(r){
  const nome=(r?.cliente||'').trim().toLowerCase();
  return (db.clientes||[]).find(c=>(c.nome||'').trim().toLowerCase()===nome)||null;
}

function telefoneWhatsAppReceita(telefone){
  let n=String(telefone||'').replace(/\D/g,'');
  if(!n) return '';
  // Telefones brasileiros cadastrados sem DDI recebem 55 automaticamente.
  if(n.length===10||n.length===11) n='55'+n;
  return n;
}

function dataBRReceita(iso){
  if(!iso) return '';
  const p=String(iso).split('-');
  return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:iso;
}

function diferencaDiasReceita(dataIso){
  if(!dataIso) return 0;
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const alvo=new Date(dataIso+'T00:00:00'); alvo.setHours(0,0,0,0);
  return Math.round((alvo-hoje)/86400000);
}

function montarMensagemCobrancaReceita(r){
  const cliente=obterClienteReceita(r);
  const nomeCompleto=((cliente?.nome||r.cliente||'').trim())||'';
  const venc=r.vencimento||((r.tipoVenda||'avista')==='avista'?r.dataVenda:'');
  const dias=diferencaDiasReceita(venc);
  const valor=moedaBR(numeroBR(r.valor));
  const forma=normalizarFormaPagamentoReceita(r.formaPagamento);
  let situacao='';
  if(venc){
    if(dias<0) situacao=`com vencimento em *${dataBRReceita(venc)}*, no valor de *${valor}*, vencido há *${Math.abs(dias)} dia${Math.abs(dias)===1?'':'s'}*.`;
    else if(dias===0) situacao=`com vencimento *hoje (${dataBRReceita(venc)})*, no valor de *${valor}*.`;
    else situacao=`com vencimento em *${dataBRReceita(venc)}*, no valor de *${valor}*. Faltam *${dias} dia${dias===1?'':'s'}* para o vencimento.`;
  }else situacao=`no valor de *${valor}*.`;

  let pagamento='';
  if(forma==='pix'){
    const chave=(db.empresa?.pix||'').trim();
    pagamento=chave?`\n\nPagamento via PIX:\n*${chave}*`:'\n\nPagamento via PIX.';
  }else if(forma==='boleto'){
    const linha=String(r.linhaDigitavel||'').trim();
    pagamento=linha?`\n\nBoleto – Linha digitável:\n*${linha}*`:'\n\nPagamento via boleto. Entre em contato conosco caso precise da linha digitável.';
  }else if(forma==='dinheiro'){
    pagamento='';
  }

  return `Olá${nomeCompleto?', '+nomeCompleto:''}! Tudo bem?\n\nIdentificamos um pagamento ${situacao}${pagamento}\n\nCaso já tenha realizado o pagamento, por favor, desconsidere esta mensagem.\n\nAt.te,\n*C&C DISTRIBUIDORA*`;
}

function enviarWhatsAppReceita(i){
  const r=db.receitas[i];
  if(!r){ alert('Receita não encontrada.'); return; }
  if(r.situacao==='Recebido'){ alert('Esta receita já está marcada como recebida.'); return; }
  const cliente=obterClienteReceita(r);
  if(!cliente){ alert('Cliente não localizado no cadastro. Confira o nome vinculado à receita.'); return; }
  const telefone=telefoneWhatsAppReceita(cliente.telefone);
  if(!telefone){ alert(`O cliente ${cliente.nome||r.cliente} não possui telefone cadastrado.`); return; }
  const forma=normalizarFormaPagamentoReceita(r.formaPagamento);
  if(forma==='pix' && !(db.empresa?.pix||'').trim()){
    if(!confirm('A chave PIX da empresa não está cadastrada. Deseja abrir o WhatsApp mesmo assim?')) return;
  }
  if(forma==='boleto' && !String(r.linhaDigitavel||'').trim()){
    if(!confirm('Esta parcela não possui linha digitável cadastrada. Deseja abrir o WhatsApp mesmo assim?')) return;
  }
  const msg=montarMensagemCobrancaReceita(r);
  const url=`https://wa.me/${telefone}?text=${encodeURIComponent(msg)}`;
  window.open(url,'_blank','noopener,noreferrer');
}

function renderListaReceitas(){
  let meses=[...new Set(db.receitas.map(r=>{ const d=r.vencimento||((r.tipoVenda||'avista')==='avista'?r.dataVenda:''); return d? d.slice(5,7)+"/"+d.slice(2,4) : ""; }).filter(Boolean))]
    .sort((a,b)=>{ const [ma,aa]=a.split('/'); const [mb,ab]=b.split('/'); return ("20"+ab+mb).localeCompare("20"+aa+ma); });
  conteudo.innerHTML=`<h2>Minhas Receitas</h2><button class="btn-secondary" onclick="renderReceitas()">Voltar</button><button class="btn-primary" onclick="renderFormReceita()">+ Receita</button><hr><div style="display:flex;gap:14px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><label>Buscar cliente</label><input id="fBuscaCliente" placeholder="Digite o nome..." oninput="filtrarReceitas()"></div><div style="flex:1"><label>Mês</label><select id="fMes" onchange="filtrarReceitas()"><option>Todas</option>${meses.map(m=>`<option>${m}</option>`).join("")}</select></div><div style="flex:1"><label>Conta</label><select id="fConta" onchange="filtrarReceitas()"><option>Todas</option>${db.contas.map(c=>`<option>${escaparHTML(c.nome)}</option>`).join("")}</select></div><div style="flex:1"><label>Situação</label><select id="fSituacao" onchange="filtrarReceitas()"><option>Todas</option><option>A receber</option><option>Pendente</option><option>Recebido</option></select></div></div><div id="tabelaReceitas"></div>`;
  filtrarReceitas();
}

function filtrarReceitas(){
  const hoje=new Date(),mes=fMes?.value||"Todas",conta=fConta?.value||"Todas",sit=fSituacao?.value||"Todas",busca=(fBuscaCliente?.value||"").toLowerCase().trim();
  let html=`<table><tr><th>Data venda</th><th>Vencimento</th><th>Tipo</th><th>Pagamento</th><th>Parcela</th><th>Cliente</th><th>Vendedor</th><th>Conta</th><th>Grupo</th><th>Subgrupo</th><th>Valor</th><th>Situação</th><th>Cobrança</th><th>Ações</th></tr>`;
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
      const formaLabel={pix:'PIX',boleto:'Boleto',dinheiro:'Dinheiro'}[normalizarFormaPagamentoReceita(r.formaPagamento)]||'Não informado';
      html+=`<tr><td>${r.dataVenda||r.vencimento||''}</td><td>${vencExibido||''}</td><td>${tipoLabel}</td><td>${formaLabel}</td><td>${parcelaLabel}</td><td>${escaparHTML(r.cliente||'')}</td><td>${escaparHTML(r.vendedor||"-")}</td><td>${escaparHTML(r.conta||'')}</td><td>${escaparHTML(r.grupo||'')}</td><td>${escaparHTML(r.subgrupo||'')}</td><td>${moedaBR(numeroBR(r.valor))}</td><td>${escaparHTML(s)}</td><td>${s!=="Recebido"?`<button class="btn-primary" style="white-space:nowrap" onclick="enviarWhatsAppReceita(${i})" title="Enviar WhatsApp" aria-label="Enviar WhatsApp">📲</button>`:'-'}</td><td><button class="btn-primary" onclick="renderFormReceita('${escaparJSReceita(r.id)}')" title="Editar" aria-label="Editar">✏️</button><button class="btn-secondary" onclick="baixarReceita(${i})" title="Dar baixa" aria-label="Dar baixa">✅</button><button class="btn-danger" onclick="excluirReceita(${i})" title="Excluir" aria-label="Excluir">🗑️</button></td></tr>`;
    }
  });
  html+="</table>"; tabelaReceitas.innerHTML=html;
}


function renderReguaCobranca(){
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  let itens=db.receitas.map((r,i)=>({r,i})).filter(({r})=>r.situacao!=="Recebido");
  itens.sort((a,b)=>new Date((a.r.vencimento||a.r.dataVenda||'2999-12-31')+'T00:00:00')-new Date((b.r.vencimento||b.r.dataVenda||'2999-12-31')+'T00:00:00'));
  let html=`<h2>Régua de Cobrança</h2><button class="btn-secondary" onclick="renderReceitas()">Voltar</button><p style="margin:14px 0;color:#94a3b8">Clique no ícone 📲 para abrir a conversa do cliente com a mensagem pronta. O envio só acontece quando você confirmar no WhatsApp.</p>`;
  if(!itens.length){ conteudo.innerHTML=html+`<div class="card"><b>Nenhuma cobrança pendente.</b></div>`; return; }
  html+=`<div style="overflow-x:auto"><table><tr><th>Cliente</th><th>Vencimento</th><th>Dias</th><th>Forma</th><th>Valor</th><th>Ação</th></tr>`;
  itens.forEach(({r,i})=>{
    const venc=r.vencimento||r.dataVenda||'';
    let diasTexto='Sem vencimento';
    if(venc){
      const dv=new Date(venc+'T00:00:00');
      const diff=Math.round((dv-hoje)/86400000);
      diasTexto=diff<0?`Vencido há ${Math.abs(diff)} dia${Math.abs(diff)!==1?'s':''}`:diff===0?'Vence hoje':`Vence em ${diff} dia${diff!==1?'s':''}`;
    }
    const forma={pix:'PIX',boleto:'Boleto',dinheiro:'Dinheiro'}[normalizarFormaPagamentoReceita(r.formaPagamento)]||'Não informado';
    html+=`<tr><td>${escaparHTML(r.cliente||'')}</td><td>${escaparHTML(venc)}</td><td><b>${escaparHTML(diasTexto)}</b></td><td>${forma}</td><td>${moedaBR(numeroBR(r.valor))}</td><td><button class="btn-primary" style="white-space:nowrap" onclick="enviarWhatsAppReceita(${i})" title="Enviar WhatsApp" aria-label="Enviar WhatsApp">📲</button></td></tr>`;
  });
  html+=`</table></div>`;
  conteudo.innerHTML=html;
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
