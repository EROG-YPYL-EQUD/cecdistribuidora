/* ================================================================
   BANCO DE DADOS LOCAL (espelho em memória do Firebase)
================================================================ */
let db = {
  contas:[],clientes:[],fornecedores:[],vendedores:[],
  despesas:[],gruposDespesas:[],subgruposDespesas:[],
  receitas:[],gruposReceitas:[],subgruposReceitas:[],
  empresa:{nome:"",doc:"",end:"",cidade:"",estado:"",tel:"",email:""}
};

let abaAtiva='dashboard', telaAtiva='contas', dashAtivo='geral';
let filtroPeriodo='mes_atual', dataInicioCustom='', dataFimCustom='', mesesSelecionados=[];
let chartEvolucaoFinanceira=null, chartExecutiveScore=null;

/* ================================================================
   FIREBASE — LEITURA E ESCRITA
================================================================ */

// Carrega TODOS os dados do Firebase para db{}
async function carregarDadosFirebase(){
  try {
    const usuario = window._auth?.currentUser;
    if(!usuario?.uid) throw new Error("Usuário não autenticado.");
    const uidAutenticado = usuario.uid;
    window._uid = uidAutenticado;

    const dbPadrao = {
      contas:[],clientes:[],fornecedores:[],vendedores:[],
      despesas:[],gruposDespesas:[],subgruposDespesas:[],
      receitas:[],gruposReceitas:[],subgruposReceitas:[],
      empresa:{nome:"",doc:"",end:"",cidade:"",estado:"",tel:"",email:""}
    };

    const dbRef = window._dbRef(window._db);
    const caminho = `users/${uidAutenticado}`;
    console.log("🔎 Lendo Firebase em:", caminho);

    const snapshot = await window._dbGet(window._dbChild(dbRef, caminho));

    // Começa sempre pelo padrão e preenche SOMENTE com o que existe no Firebase.
    // Não usa localStorage e não salva nada durante o carregamento.
    db = JSON.parse(JSON.stringify(dbPadrao));

    if(snapshot.exists()){
      const data = snapshot.val() || {};

      Object.keys(dbPadrao).forEach(key => {
        if(key === 'empresa'){
          db[key] = data[key] || dbPadrao[key];
        }else{
          db[key] = Array.isArray(data[key])
            ? data[key]
            : Object.values(data[key] || {});
        }
      });

      normalizarDadosLegados(); // só ajusta em memória; NÃO grava no Firebase ao abrir
      recalcularSaldosContas(); // recalcula caixa em memória sem salvar ao abrir

      console.log("✅ Dados carregados do Firebase:", {
        contas: db.contas.length,
        clientes: db.clientes.length,
        fornecedores: db.fornecedores.length,
        vendedores: db.vendedores.length,
        despesas: db.despesas.length,
        receitas: db.receitas.length
      });

      mostrarToast(`✓ Firebase carregado: ${db.receitas.length} receitas, ${db.clientes.length} clientes`);
    } else {
      console.warn("⚠️ Nenhum dado encontrado no Firebase neste caminho:", caminho);
      mostrarToast("⚠️ Firebase vazio neste caminho");
    }
  } catch(err){
    console.error("Erro ao carregar dados do Firebase:", err);
    alert("Erro ao carregar dados do Firebase. Verifique as regras do Firebase e o login.");
    throw err;
  }
}

// Migra dados do localStorage para o Firebase (roda apenas uma vez)
async function migrarLocalStorageParaFirebase(){
  // DESATIVADO POR SEGURANÇA.
  // Nunca migrar localStorage automaticamente para não sobrescrever dados do Firebase.
  console.warn("Migração automática do localStorage desativada por segurança.");
}

// Fallback: carrega do localStorage se Firebase não responder


// Normaliza dados antigos salvos antes do ajuste de parcelas/comissões.
// Não apaga nada: só completa campos que não existiam no modelo antigo.
function normalizarDadosLegados(){
  if(!Array.isArray(db.receitas)) db.receitas = [];
  db.receitas = db.receitas.map((r, idx) => {
    const id = r.id || gerarIdReceita('REC');
    const vendaId = r.vendaId || r.idVenda || id;
    return {
      ...r,
      id,
      vendaId,
      tipoVenda: r.tipoVenda || r.tipo || 'avista',
      dataVenda: r.dataVenda || r.data || r.vencimento || '',
      qtdParcelas: parseInt(r.qtdParcelas || r.totalParcelas || 1),
      parcelaAtual: parseInt(r.parcelaAtual || r.parcela || 1)
    };
  });
  if(!Array.isArray(db.despesas)) db.despesas = [];
  if(!Array.isArray(db.contas)) db.contas = [];
  db.contas = db.contas.map(c => ({
    ...c,
    saldoInicial: c.saldoInicial !== undefined ? numeroBR(c.saldoInicial) : numeroBR(c.saldo)
  }));
}

function recalcularSaldosContas(){
  if(!Array.isArray(db.contas)) return;

  db.contas.forEach(c => {
    if(c.saldoInicial === undefined || c.saldoInicial === null || c.saldoInicial === ''){
      c.saldoInicial = numeroBR(c.saldo);
    }
    c.saldo = numeroBR(c.saldoInicial);
  });

  (db.receitas||[]).forEach(r => {
    if(r.situacao === 'Recebido'){
      const idx = db.contas.findIndex(c => c.nome === r.conta);
      if(idx !== -1) db.contas[idx].saldo = numeroBR(db.contas[idx].saldo) + numeroBR(r.valor);
    }
  });

  (db.despesas||[]).forEach(d => {
    if(d.situacao === 'Pago'){
      const idx = db.contas.findIndex(c => c.nome === d.conta);
      if(idx !== -1) db.contas[idx].saldo = numeroBR(db.contas[idx].saldo) - numeroBR(d.valor);
    }
  });
}

function carregarDoLocalStorage(){
  throw new Error("localStorage desativado: o Firebase é a única fonte principal de dados.");
}

// Salva UMA chave no Firebase
const CHAVES_PERSISTENCIA_PERMITIDAS = new Set([
  'contas','clientes','fornecedores','vendedores','despesas',
  'gruposDespesas','subgruposDespesas','receitas','gruposReceitas',
  'subgruposReceitas','empresa'
]);

async function persist(chave){
  const usuario = window._auth?.currentUser;
  if(!usuario?.uid || window._uid !== usuario.uid){
    console.error("Persistência bloqueada: usuário não autenticado ou UID divergente.");
    mostrarToast("❌ Sessão inválida. Faça login novamente.");
    return false;
  }
  if(!CHAVES_PERSISTENCIA_PERMITIDAS.has(chave) || !Object.prototype.hasOwnProperty.call(db, chave)){
    console.error("Persistência bloqueada para chave não permitida:", chave);
    mostrarToast("❌ Operação de salvamento não permitida.");
    return false;
  }
  try {
    const r = window._dbRef(window._db, `users/${usuario.uid}/${chave}`);
    await window._dbSet(r, db[chave]);
    mostrarToast("✓ Salvo no Firebase");
    return true;
  } catch(err){
    console.error("Erro ao salvar no Firebase:", err);
    mostrarToast("❌ Erro ao salvar no Firebase");
    alert("Não foi possível salvar no Firebase. Nenhum fallback local foi utilizado.");
    return false;
  }
}


function clonarEstado(valor){
  return JSON.parse(JSON.stringify(valor));
}

async function persistirAtomico(chaves){
  const usuario = window._auth?.currentUser;
  const lista = [...new Set((Array.isArray(chaves)?chaves:[chaves]).filter(Boolean))];
  if(!usuario?.uid || window._uid !== usuario.uid){
    console.error("Persistência atômica bloqueada: sessão inválida.");
    mostrarToast("❌ Sessão inválida. Faça login novamente.");
    return false;
  }
  if(!lista.length || lista.some(chave=>!CHAVES_PERSISTENCIA_PERMITIDAS.has(chave) || !Object.prototype.hasOwnProperty.call(db,chave))){
    console.error("Persistência atômica bloqueada para chaves:", lista);
    mostrarToast("❌ Operação de salvamento não permitida.");
    return false;
  }
  try{
    const atualizacoes={};
    lista.forEach(chave=>{ atualizacoes[chave]=db[chave]; });
    const raizUsuario=window._dbRef(window._db, `users/${usuario.uid}`);
    await window._dbUpdate(raizUsuario, atualizacoes);
    return true;
  }catch(err){
    console.error("Erro em gravação atômica no Firebase:",err);
    mostrarToast("❌ Erro ao salvar no Firebase");
    alert("Não foi possível concluir a operação. Nenhuma confirmação de sucesso foi exibida.");
    return false;
  }
}

let operacaoEmAndamento=false;
async function executarOperacaoProtegida(botao, acao){
  if(operacaoEmAndamento) return false;
  operacaoEmAndamento=true;
  const el=botao || document.activeElement;
  const estadoAnterior=el && 'disabled' in el ? el.disabled : null;
  if(el && 'disabled' in el) el.disabled=true;
  try{ return await acao(); }
  finally{
    operacaoEmAndamento=false;
    if(el && 'disabled' in el && estadoAnterior!==null) el.disabled=estadoAnterior;
  }
}

// Salva TODO o db no Firebase (usado na migração)
async function salvarBackupRestauradoFirebase(){
  // Usado somente quando o usuário confirma restauração de backup manual.
  const usuario = window._auth?.currentUser;
  if(!usuario?.uid || window._uid !== usuario.uid) throw new Error("Restauração bloqueada: usuário não autenticado.");
  const r = window._dbRef(window._db, `users/${usuario.uid}`);
  await window._dbSet(r, db);
}

async function salvarTudoFirebase(){
  // DESATIVADO POR SEGURANÇA.
  // Esta função não deve ser chamada automaticamente.
  console.warn("salvarTudoFirebase() bloqueado por segurança. Use persist(chave) ou restauração manual.");
}


/* ================================================================
   MOEDA BRASILEIRA — FORMATAÇÃO E CONVERSÃO
================================================================ */
function moedaBR(valor){
  const n = Number(valor || 0);
  return n.toLocaleString('pt-BR', {
    style:'currency',
    currency:'BRL',
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

function numeroBR(valor){
  if(valor === null || valor === undefined) return 0;
  if(typeof valor === 'number') return valor;

  let v = String(valor).trim();
  if(!v) return 0;

  v = v.replace(/R\$/g,'').replace(/\s/g,'');

  // Padrão brasileiro: 1.500,50 -> 1500.50
  if(v.includes(',')){
    v = v.replace(/\./g,'').replace(',', '.');
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // Se digitou no padrão americano por engano: 1500.50 -> 1500.50
  // Se digitou 1.500 como milhar, vira 1500.
  if(v.includes('.')){
    const partes = v.split('.');
    const ultima = partes[partes.length - 1];
    const pareceDecimalAmericano = partes.length === 2 && ultima.length > 0 && ultima.length <= 2;
    v = pareceDecimalAmericano ? v : v.replace(/\./g,'');
  }

  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function normalizarDigitacaoMoedaBR(input){
  let v = String(input.value || '')
    .replace(/R\$/g,'')
    .replace(/\s/g,'')
    .replace(/[^0-9,\.]/g,'');

  // Se o usuário digitar decimal com ponto, troca para vírgula.
  // Ex.: 1500.50 -> 1500,50
  if(v.includes('.') && !v.includes(',')){
    const partes = v.split('.');
    const ultima = partes[partes.length - 1];
    if(partes.length === 2 && ultima.length > 0 && ultima.length <= 2){
      v = partes[0] + ',' + ultima;
    }
  }

  input.value = v;
}

function formatarCampoMoeda(input){
  if(String(input.value || '').trim() === '') return;
  input.value = moedaBR(numeroBR(input.value));
}

function prepararCamposMoeda(){
  document.querySelectorAll('input[data-moeda="br"]').forEach(input=>{
    if(input.value !== '') input.value = moedaBR(numeroBR(input.value));

    input.onfocus = function(){
      // Remove R$ só para facilitar edição, mantendo padrão BR.
      if(this.value !== ''){
        this.value = this.value.replace(/R\$/g,'').trim();
        this.select();
      }
    };

    input.oninput = function(){
      normalizarDigitacaoMoedaBR(this);
    };

    input.onblur = function(){
      formatarCampoMoeda(this);
    };
  });
}

/* ================================================================
   UI HELPERS
================================================================ */
function mostrarCarregando(msg="Carregando..."){
  document.getElementById('loading-msg').textContent = msg;
  document.getElementById('login-loading').style.display = 'flex';
}
function esconderCarregando(){
  document.getElementById('login-loading').style.display = 'none';
}
function mostrarToast(msg="Salvo!"){
  const t = document.getElementById('save-toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>{ t.style.display='none'; }, 2500);
}

// Expõe funções para o script type=module do Firebase.
window.carregarDadosFirebase = carregarDadosFirebase;
window.mostrarCarregando = mostrarCarregando;
window.esconderCarregando = esconderCarregando;
window.mostrarToast = mostrarToast;

/* ================================================================
   LOGIN / LOGOUT
================================================================ */
async function realizarLogin(){
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errorMsg = document.getElementById('login-error');
  const btn = document.getElementById('btn-entrar');
  if(!email||!pass){ errorMsg.textContent='Preencha e-mail e senha.'; errorMsg.style.display='block'; return; }
  btn.disabled=true; btn.textContent='Entrando...'; errorMsg.style.display='none';
  try {
    await window._signInFn(window._auth, email, pass);
  } catch(err){
    btn.disabled=false; btn.textContent='Entrar no Sistema';
    const msgs = {
      'auth/invalid-credential':'E-mail ou senha incorretos.',
      'auth/user-not-found':'Usuário não encontrado.',
      'auth/wrong-password':'Senha incorreta.',
      'auth/too-many-requests':'Muitas tentativas. Tente mais tarde.',
      'auth/invalid-email':'E-mail inválido.',
    };
    errorMsg.textContent = msgs[err.code]||'Erro ao entrar. Verifique as credenciais.';
    errorMsg.style.display='block';
  }
}

async function realizarLogout(){
  try {
    limparMetadadosSessao();
    pararTimersInatividade();
    await window._signOutFn(window._auth);
    document.getElementById('login-pass').value='';
    document.getElementById('login-error').style.display='none';
    document.getElementById('btn-entrar').disabled=false;
    document.getElementById('btn-entrar').textContent='Entrar no Sistema';
  } catch(err){ console.error(err); }
}

/* ================================================================
   SESSÃO — LOGOUT AUTOMÁTICO POR INATIVIDADE
   - 15 minutos sem atividade com a página aberta.
   - Persiste somente metadados de sessão (UID + última atividade), nunca dados do sistema.
   - Ao reabrir/retomar a página, encerra imediatamente se o prazo já expirou.
================================================================ */
const TEMPO_INATIVIDADE_MS = 15 * 60 * 1000;
const TEMPO_AVISO_MS = 13 * 60 * 1000;
const CHAVE_ULTIMA_ATIVIDADE = 'cec_session_last_activity';
const CHAVE_UID_SESSAO = 'cec_session_uid';
let timerInatividade = null;
let timerAvisoInatividade = null;
let avisoInatividadeExibido = false;
let ultimoRegistroAtividade = 0;

function sessaoEstaLogada(){
  return !!(window._auth && window._auth.currentUser);
}

function lerUltimaAtividadeSessao(){
  try {
    const valor = Number(localStorage.getItem(CHAVE_ULTIMA_ATIVIDADE) || 0);
    return Number.isFinite(valor) ? valor : 0;
  } catch(e){
    return Number(window.__ultimaAtividadeSessao || 0);
  }
}

function lerUidSessao(){
  try { return localStorage.getItem(CHAVE_UID_SESSAO) || ''; }
  catch(e){ return String(window.__uidSessao || ''); }
}

function gravarUltimaAtividadeSessao(agora = Date.now(), forcar = false){
  if(!sessaoEstaLogada()) return;
  const uid = window._auth.currentUser?.uid;
  if(!uid) return;

  // Evita escrita excessiva em eventos como mousemove, sem perder precisão relevante.
  if(!forcar && agora - ultimoRegistroAtividade < 5000) return;
  ultimoRegistroAtividade = agora;
  window.__ultimaAtividadeSessao = agora;
  window.__uidSessao = uid;
  try {
    localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(agora));
    localStorage.setItem(CHAVE_UID_SESSAO, uid);
  } catch(e){ /* metadados permanecem em memória nesta execução */ }
}

function limparMetadadosSessao(){
  ultimoRegistroAtividade = 0;
  window.__ultimaAtividadeSessao = 0;
  window.__uidSessao = '';
  try {
    localStorage.removeItem(CHAVE_ULTIMA_ATIVIDADE);
    localStorage.removeItem(CHAVE_UID_SESSAO);
  } catch(e){}
}

function sessaoExpiradaPorInatividade(uidAtual){
  const ultima = lerUltimaAtividadeSessao();
  const uidSalvo = lerUidSessao();
  if(!ultima || !uidSalvo || uidSalvo !== uidAtual) return false;
  return (Date.now() - ultima) >= TEMPO_INATIVIDADE_MS;
}

async function encerrarSessaoPorInatividade(){
  if(!sessaoEstaLogada()) return;
  try {
    pararTimersInatividade();
    limparMetadadosSessao();
    await realizarLogout();
    mostrarToast('Sessão encerrada automaticamente por 15 minutos de inatividade.');
  } catch(e){ console.error('Erro no logout automático:', e); }
}

function agendarTimersComBaseNaUltimaAtividade(){
  if(!sessaoEstaLogada()) return;
  clearTimeout(timerInatividade);
  clearTimeout(timerAvisoInatividade);
  avisoInatividadeExibido = false;

  const agora = Date.now();
  const ultima = lerUltimaAtividadeSessao() || agora;
  const decorrido = Math.max(0, agora - ultima);
  const restanteLogout = TEMPO_INATIVIDADE_MS - decorrido;
  const restanteAviso = TEMPO_AVISO_MS - decorrido;

  if(restanteLogout <= 0){
    encerrarSessaoPorInatividade();
    return;
  }

  if(restanteAviso > 0){
    timerAvisoInatividade = setTimeout(()=>{
      if(sessaoEstaLogada()){
        avisoInatividadeExibido = true;
        mostrarToast('Sua sessão será encerrada em 2 minutos por inatividade.');
      }
    }, restanteAviso);
  }

  timerInatividade = setTimeout(()=>{
    if(!sessaoEstaLogada()) return;
    // Confere o relógio real; não confia apenas no timer do navegador.
    const ultimaReal = lerUltimaAtividadeSessao();
    if(ultimaReal && Date.now() - ultimaReal >= TEMPO_INATIVIDADE_MS){
      encerrarSessaoPorInatividade();
    } else {
      agendarTimersComBaseNaUltimaAtividade();
    }
  }, restanteLogout);
}

function reiniciarTimersInatividade(){
  if(!sessaoEstaLogada()) return;
  gravarUltimaAtividadeSessao(Date.now());
  agendarTimersComBaseNaUltimaAtividade();
}

function iniciarSessaoInatividade(uid){
  if(!uid || !sessaoEstaLogada()) return;
  const uidSalvo = lerUidSessao();
  const ultima = lerUltimaAtividadeSessao();

  // Sessão nova ou outro usuário: começa a contagem agora.
  if(!uidSalvo || uidSalvo !== uid || !ultima){
    gravarUltimaAtividadeSessao(Date.now(), true);
  }
  agendarTimersComBaseNaUltimaAtividade();
}

function pararTimersInatividade(){
  clearTimeout(timerInatividade);
  clearTimeout(timerAvisoInatividade);
  timerInatividade = null;
  timerAvisoInatividade = null;
  avisoInatividadeExibido = false;
}

function registrarAtividadeUsuario(){
  if(!sessaoEstaLogada()) return;
  gravarUltimaAtividadeSessao(Date.now());
  agendarTimersComBaseNaUltimaAtividade();
}

['mousedown','mousemove','keydown','touchstart','scroll','click'].forEach(evento=>{
  document.addEventListener(evento, registrarAtividadeUsuario, {passive:true});
});

// Ao voltar para a aba/janela, verifica tempo real decorrido mesmo que timers tenham sido suspensos.
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible' && sessaoEstaLogada()){
    const uid = window._auth.currentUser?.uid;
    if(uid && sessaoExpiradaPorInatividade(uid)) encerrarSessaoPorInatividade();
    else agendarTimersComBaseNaUltimaAtividade();
  }
});
window.addEventListener('focus', ()=>{
  if(!sessaoEstaLogada()) return;
  const uid = window._auth.currentUser?.uid;
  if(uid && sessaoExpiradaPorInatividade(uid)) encerrarSessaoPorInatividade();
  else agendarTimersComBaseNaUltimaAtividade();
});

/* ================================================================
   NAVEGAÇÃO
================================================================ */
function mudarAba(aba){
  abaAtiva=aba;
  document.getElementById('tab-dashboard').classList.toggle('active',aba==='dashboard');
  document.getElementById('tab-gestao').classList.toggle('active',aba==='gestao');
  document.getElementById('submenu-dashboard').style.display=(aba==='dashboard')?'flex':'none';
  document.getElementById('submenu-gestao').style.display=(aba==='gestao')?'flex':'none';
  if(aba==='dashboard') abrirDash(dashAtivo); else abrirTela(telaAtiva);
}

function abrirDash(d){
  dashAtivo=d;
  ['geral','comissoes','fluxo','dre'].forEach(n=>document.getElementById('btn-dash-'+n).classList.toggle('active',n===d));
  renderDashboard();
}

function abrirTela(m){
  telaAtiva=m;
  ["contas","clientes","fornecedores","vendedores","despesas","receitas"].forEach(t=>{
    const btn=document.getElementById("btn-"+t); if(btn) btn.classList.toggle("active",t===m);
  });
  if(m==="despesas") renderDespesas();
  else if(m==="receitas") renderReceitas();
  else renderSubmenu(m);
}

/* ================================================================
   CONFIGURAÇÕES E BACKUP
================================================================ */
function abrirConfiguracoes(){
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.submenu').forEach(s=>s.style.display='none');
  renderConfig();
}

function renderConfig(){
  conteudo.innerHTML=`
  <h2>Configurações do Sistema</h2>
  <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
    <div class="card">
      <h3>Dados da Empresa</h3>
      <p style="margin-bottom:20px; color:#94a3b8">Personalize com as informações do seu negócio.</p>
      <label>Nome da Empresa / Proprietário</label>
      <input type="text" id="emp-nome" value="${escaparAtributo(db.empresa.nome)}">
      <label>CNPJ / CPF</label>
      <input type="text" id="emp-doc" value="${escaparAtributo(db.empresa.doc)}">
      <label>Endereço</label>
      <input type="text" id="emp-end" value="${escaparAtributo(db.empresa.end)}">
      <div style="display:flex; gap:10px">
        <div style="flex:2"><label>Cidade</label><input type="text" id="emp-cidade" value="${escaparAtributo(db.empresa.cidade)}"></div>
        <div style="flex:1"><label>Estado</label><input type="text" id="emp-estado" value="${escaparAtributo(db.empresa.estado)}"></div>
      </div>
      <div style="display:flex; gap:10px">
        <div style="flex:1"><label>Telefone</label><input type="text" id="emp-tel" value="${escaparAtributo(db.empresa.tel)}"></div>
        <div style="flex:1"><label>E-mail Empresa</label><input type="text" id="emp-email" value="${escaparAtributo(db.empresa.email)}"></div>
      </div>
      <div style="margin-top:20px">
        <button class="btn-primary" onclick="salvarDadosEmpresa()">💾 Salvar no Firebase</button>
      </div>
    </div>

    <div style="display:flex; flex-direction:column; gap:20px">
      <div class="card">
        <h3>🔥 Armazenamento Firebase</h3>
        <p style="color:#94a3b8; font-size:13px; margin-bottom:15px">
          Todos os seus dados estão salvos com segurança no Firebase Realtime Database.
        </p>
        <div style="background:#0a1628; border:1px solid #1e3a5f; padding:14px; border-radius:10px; font-size:12px; color:#94a3b8; line-height:1.8">
          📁 <b style="color:#3b82f6">users/${window._uid||'...'}/</b><br>
          &nbsp;&nbsp;├── contas (${db.contas.length} registro${db.contas.length!==1?'s':''})<br>
          &nbsp;&nbsp;├── clientes (${db.clientes.length} registro${db.clientes.length!==1?'s':''})<br>
          &nbsp;&nbsp;├── fornecedores (${db.fornecedores.length} registro${db.fornecedores.length!==1?'s':''})<br>
          &nbsp;&nbsp;├── vendedores (${db.vendedores.length} registro${db.vendedores.length!==1?'s':''})<br>
          &nbsp;&nbsp;├── despesas (${db.despesas.length} registro${db.despesas.length!==1?'s':''})<br>
          &nbsp;&nbsp;└── receitas (${db.receitas.length} registro${db.receitas.length!==1?'s':''})
        </div>
      </div>

      <div class="card">
        <h3>🔐 Acesso ao Sistema</h3>
        <p style="color:#94a3b8; font-size:13px; margin-bottom:10px">
          Login gerenciado pelo Firebase Authentication.<br>
          Somente usuários cadastrados por você no Firebase Console têm acesso.
        </p>
        <div style="background:#1e293b; padding:12px; border-radius:10px; font-size:12px; color:#94a3b8">
          🔒 Para alterar sua senha, acesse: <b>Firebase Console → Authentication → Users</b>
        </div>
      </div>

      <div class="card">
        <h3>Backup e Restauração</h3>
        <p style="margin-bottom:15px; color:#94a3b8; font-size:12px">Exporte um arquivo JSON de todos os seus dados.</p>
        <div style="display:flex; flex-direction:column; gap:10px">
          <button class="btn-secondary" onclick="exportarBackup()">📥 Exportar Backup JSON</button>
          <input type="file" id="importFile" style="display:none" onchange="importarBackup(this)">
          <button class="btn-primary" onclick="document.getElementById('importFile').click()">📤 Restaurar Backup</button>
        </div>
      </div>
    </div>
  </div>`;
}

async function salvarDadosEmpresa(){
  db.empresa={
    nome:document.getElementById('emp-nome').value,
    doc:document.getElementById('emp-doc').value,
    end:document.getElementById('emp-end').value,
    cidade:document.getElementById('emp-cidade').value,
    estado:document.getElementById('emp-estado').value,
    tel:document.getElementById('emp-tel').value,
    email:document.getElementById('emp-email').value
  };
  await persist('empresa');
  openModal(`<h3>✅ Sucesso!</h3><p>Perfil da empresa salvo no Firebase.</p><div class="modal-actions"><button class="btn-primary" onclick="closeModal()">OK</button></div>`);
}

function exportarBackup(){
  const dataStr="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(db));
  const a=document.createElement('a');
  a.setAttribute("href",dataStr);
  a.setAttribute("download","backup_erp_"+new Date().toISOString().slice(0,10)+".json");
  document.body.appendChild(a); a.click(); a.remove();
}

async function importarBackup(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async function(e){
    try{
      const importedDb=JSON.parse(e.target.result);
      if(confirm("Isso irá substituir TODOS os dados no Firebase. Deseja continuar?")){
        mostrarCarregando("Restaurando dados...");
        Object.keys(importedDb).forEach(key=>{ db[key]=importedDb[key]; });
        await salvarBackupRestauradoFirebase();
        esconderCarregando();
        mostrarToast("✅ Dados restaurados no Firebase!");
        alert("Dados restaurados com sucesso!");
        location.reload();
      }
    }catch(err){ alert("Erro ao ler o arquivo de backup."); }
  };
  reader.readAsText(file);
}

/* ================================================================
   SINCRONIZACAO DE SALDO (Funcao Universal)
================================================================ */
async function ajustarSaldoPorTransacao(tipo, novaTransacao, transacaoAnterior=null){
  // O caixa não deve ficar preso nem duplicar movimento.
  // A cada alteração, o saldo é recalculado a partir do saldo inicial + receitas recebidas - despesas pagas.
  recalcularSaldosContas();
}

/* ================================================================
   GATILHO GLOBAL DE ATUALIZACAO DO DASHBOARD
================================================================ */
async function atualizarDashboardGlobal(){
  // Atualiza o dashboard imediatamente quando ele estiver aberto.
  // Quando estiver em Gestão, os dados já ficam no db{} e o dashboard renderiza atualizado ao abrir.
  if(abaAtiva === 'dashboard'){
    renderDashboard();
  }
}

async function aposAlterarFinanceiro(tipoAtual=''){
  // Grava contas + módulo financeiro relacionado em uma única atualização Firebase.
  recalcularSaldosContas();
  const chaves=['contas'];
  if(tipoAtual==='receitas') chaves.push('receitas');
  if(tipoAtual==='despesas') chaves.push('despesas');
  const ok=await persistirAtomico(chaves);
  if(!ok) return false;

  if(abaAtiva === 'dashboard') renderDashboard();
  else if(abaAtiva === 'gestao'){
    if(telaAtiva === 'receitas') renderListaReceitas();
    if(telaAtiva === 'despesas') renderListaDespesas();
  }
  return true;
}
