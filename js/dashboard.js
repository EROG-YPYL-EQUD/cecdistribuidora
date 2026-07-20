/* ================================================================
   DASHBOARD
================================================================ */
function atualizarSaudacaoGlobal(){
  const agora=new Date(); const hora=agora.getHours();
  let saudacao="Bom dia";
  if(hora>=12&&hora<18) saudacao="Boa tarde";
  else if(hora>=18||hora<5) saudacao="Boa noite";
  const dataFormatada=agora.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
  const greetingEl=document.getElementById('global-greeting');
  if(greetingEl){
    const nome=db.empresa.nome||"Administrador";
    greetingEl.innerHTML=`
      <div class="greeting-text">
        <h2>${saudacao}, ${escaparHTML(nome)}</h2>
        <p>${dataFormatada}</p>
      </div>
      <div class="status-realtime">
        <div class="status-dot"></div>
        <span id="weather-info" class="status-label">Carregando clima...</span>
        <button class="refresh-btn" onclick="atualizarSaudacaoGlobal(); if(abaAtiva==='dashboard') renderDashboard();">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>`;
  }
  const apiKey="442af6ebd3b9094ed8e9764c28aad770";
  const cidade=(db.empresa.cidade||"Sao Paulo").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cidade)}&appid=${apiKey}&units=metric&lang=pt_br`)
    .then(r=>r.json()).then(data=>{
      const el=document.getElementById('weather-info');
      if(el&&data.main) el.innerText=`${data.name}: ${data.weather[0].description.charAt(0).toUpperCase()+data.weather[0].description.slice(1)}, ${Math.round(data.main.temp)}°C`;
    }).catch(()=>{ const el=document.getElementById('weather-info'); if(el) el.innerText='Configure a cidade em Configurações'; });
}

function renderDashboard(){
  let todosMeses=[...new Set([
    ...db.receitas.map(r=>r.vencimento?.slice(0,7)),
    ...db.despesas.map(d=>d.vencimento?.slice(0,7))
  ])].filter(m=>m).sort().reverse();
  atualizarSaudacaoGlobal();
  conteudo.innerHTML=`
  <div class="dash-header">
    <div><h2 style="margin-bottom:0">Dashboard ${dashAtivo.toUpperCase()}</h2></div>
    <div class="dash-filters">
      <div style="width:180px">
        <select id="selectPeriodo" onchange="atualizarFiltroPeriodo(this.value)">
          <option value="mes_atual"   ${filtroPeriodo==='mes_atual'?'selected':''}>Mês Atual</option>
          <option value="mes_anterior"${filtroPeriodo==='mes_anterior'?'selected':''}>Mês Anterior</option>
          <option value="trimestre"   ${filtroPeriodo==='trimestre'?'selected':''}>Último Trimestre</option>
          <option value="semestre"    ${filtroPeriodo==='semestre'?'selected':''}>Último Semestre</option>
          <option value="ano"         ${filtroPeriodo==='ano'?'selected':''}>Este Ano</option>
          <option value="custom"      ${filtroPeriodo==='custom'?'selected':''}>Personalizado</option>
          <option value="comparacao"  ${filtroPeriodo==='comparacao'?'selected':''}>Comparação Livre</option>
          <option value="todos"       ${filtroPeriodo==='todos'?'selected':''}>Tudo</option>
        </select>
      </div>
      <div id="custom-dates" style="display:${filtroPeriodo==='custom'?'flex':'none'}; gap:10px; align-items:center">
        <input type="date" id="dash-inicio" value="${dataInicioCustom}" onchange="atualizarDatasCustom()">
        <span style="font-size:12px; color:#94a3b8">até</span>
        <input type="date" id="dash-fim" value="${dataFimCustom}" onchange="atualizarDatasCustom()">
      </div>
      <div id="comparacao-box" style="display:${filtroPeriodo==='comparacao'?'block':'none'}; position:relative">
        <button class="btn-secondary" onclick="toggleMultiSelect()">Selecionar Meses (${mesesSelecionados.length})</button>
        <div id="multi-select-list" class="multi-select-box">
          ${todosMeses.map(m=>`<div class="multi-select-item" onclick="event.stopPropagation()"><input type="checkbox" value="${m}" ${mesesSelecionados.includes(m)?'checked':''} onchange="atualizarMesesSelecionados(this)"><span style="margin-left:8px">${m.split('-').reverse().join('/')}</span></div>`).join('')}
        </div>
      </div>
    </div>
  </div>
  <div id="dash-content"></div>`;
  processarDadosDashboard();
}

function toggleMultiSelect(){ const el=document.getElementById('multi-select-list'); el.style.display=el.style.display==='block'?'none':'block'; }
function atualizarMesesSelecionados(cb){ if(cb.checked) mesesSelecionados.push(cb.value); else mesesSelecionados=mesesSelecionados.filter(m=>m!==cb.value); processarDadosDashboard(); }
function atualizarFiltroPeriodo(val){ filtroPeriodo=val; renderDashboard(); }
function atualizarDatasCustom(){ dataInicioCustom=document.getElementById('dash-inicio').value; dataFimCustom=document.getElementById('dash-fim').value; if(dataInicioCustom&&dataFimCustom) processarDadosDashboard(); }

function obterDataComissaoReceita(r){
  // Comissão: venda à vista entra no mês da venda; venda a prazo entra pelo vencimento da parcela.
  const tipo=(r.tipoVenda||r.tipo||'avista').toString().toLowerCase();
  if(tipo==='avista' || tipo==='à vista' || tipo==='a vista') return r.dataVenda || r.vencimento;
  return r.vencimento || r.dataVenda;
}

function processarDadosDashboard(){
  const hoje=new Date(); let dataInicio,dataFim=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate(),23,59,59);
  const mc=(filtroPeriodo==='comparacao');
  if(filtroPeriodo==='mes_atual'){dataInicio=new Date(hoje.getFullYear(),hoje.getMonth(),1);dataFim=new Date(hoje.getFullYear(),hoje.getMonth()+1,0,23,59,59);}
  else if(filtroPeriodo==='mes_anterior'){dataInicio=new Date(hoje.getFullYear(),hoje.getMonth()-1,1);dataFim=new Date(hoje.getFullYear(),hoje.getMonth(),0,23,59,59);}
  else if(filtroPeriodo==='trimestre'){dataInicio=new Date(hoje.getFullYear(),hoje.getMonth()-2,1);}
  else if(filtroPeriodo==='semestre'){dataInicio=new Date(hoje.getFullYear(),hoje.getMonth()-5,1);}
  else if(filtroPeriodo==='ano'){dataInicio=new Date(hoje.getFullYear(),0,1);dataFim=new Date(hoje.getFullYear(),11,31,23,59,59);}
  else if(filtroPeriodo==='custom'){dataInicio=dataInicioCustom?new Date(dataInicioCustom+"T00:00:00"):new Date(2000,0,1);dataFim=dataFimCustom?new Date(dataFimCustom+"T23:59:59"):new Date(2100,0,1);}
  else{dataInicio=new Date(2000,0,1);dataFim=new Date(2100,0,1);}
  const filtrar=(ds)=>{ if(!ds) return false; if(mc) return mesesSelecionados.includes(ds.slice(0,7)); const d=new Date(ds+"T00:00:00"); return d>=dataInicio&&d<=dataFim; };
  let recs=db.receitas.filter(r=>filtrar(dashAtivo==='comissoes'?obterDataComissaoReceita(r):r.vencimento));
  let dess=db.despesas.filter(d=>filtrar(d.vencimento));
  if(dashAtivo==='geral') renderDashGeral(recs,dess);
  else if(dashAtivo==='comissoes') renderDashComissoes(recs);
  else if(dashAtivo==='fluxo') renderDashFluxo();
  else renderDashDRE(recs,dess);
}

function gerarAnaliseIA(recs,dess){
  let insights=[];
  let tr=recs.reduce((a,r)=>a+(numeroBR(r.valor)),0);
  let td=dess.reduce((a,d)=>a+(numeroBR(d.valor)),0);
  let lucro=tr-td;
  if(tr>0){ let m=(lucro/tr)*100; if(m>20) insights.push("Excelente! Margem de lucro saudável."); else if(m>5) insights.push("Margem positiva. Otimize custos e preços."); else if(m>=0) insights.push("Atenção: margem muito apertada."); else insights.push("Alerta: operando com prejuízo!"); }
  else if(td>0){ insights.push("Sem receitas. Foque em gerar vendas."); }
  else{ insights.push("Nenhum dado no período. Comece a registrar!"); }
  if(td>0&&tr>0&&(td/tr)>0.5) insights.push("Despesas >50% das receitas. Reduza custos.");
  let rank={}; recs.forEach(r=>{ rank[r.cliente]=(rank[r.cliente]||0)+(numeroBR(r.valor)); });
  let sorted=Object.entries(rank).sort((a,b)=>b[1]-a[1]);
  if(sorted.length>0) insights.push(`Destaque: ${sorted[0][0]} – ${moedaBR(sorted[0][1])}.`);
  if(lucro>0) insights.push("Bom lucro! Considere reinvestir ou reserva de emergência.");
  else if(lucro<0) insights.push("Receba mais rápido e negocie prazos com fornecedores.");
  return insights.map(i=>`<p style="margin-bottom:8px; font-size:14px; color:#e2e8f0">${i}</p>`).join('');
}

function renderDashGeral(recs,dess){
  let tr=recs.reduce((a,r)=>a+(numeroBR(r.valor)),0);
  let td=dess.reduce((a,d)=>a+(numeroBR(d.valor)),0);
  let lucro=tr-td;
  let sc=db.contas.reduce((a,c)=>a+(numeroBR(c.saldo)),0);
  let rent=tr>0?Math.max(0,Math.min(100,Math.round((lucro/tr)*100))):0;
  let saude=(tr===0&&td===0)?0:(tr>td?85:45);
  let custos=tr>0?Math.min(100,Math.round((td/tr)*100)):0;
  let cresc=tr>0?Math.min(100,Math.max(-100,Math.round((lucro/tr)*50))):(td>0?-50:0);
  let ranking={}; recs.forEach(r=>{ ranking[r.cliente]=(ranking[r.cliente]||0)+(numeroBR(r.valor)); });
  let sortedR=Object.entries(ranking).sort((a,b)=>b[1]-a[1]).slice(0,5);
  document.getElementById('dash-content').innerHTML=`
  <div class="dash-grid">
    <div class="dash-card card-receita"><h4><span style="color:#22c55e">●</span> Receita</h4><div class="value">${moedaBR(tr)}</div></div>
    <div class="dash-card card-despesa"><h4><span style="color:#ef4444">●</span> Despesas</h4><div class="value">${moedaBR(td)}</div></div>
    <div class="dash-card ${lucro>=0?'card-lucro':'card-prejuizo'}"><h4><span style="color:${lucro>=0?'#3b82f6':'#ef4444'}">●</span> ${lucro>=0?'Lucro':'Prejuízo'}</h4><div class="value">${moedaBR(lucro)}</div></div>
    <div class="dash-card card-caixa"><h4><span style="color:#a855f7">●</span> Caixa Total</h4><div class="value">${moedaBR(sc)}</div></div>
    <div class="dash-card card-ia"><h4><span style="color:#f59e0b">●</span> IA Análise</h4><div class="ia-insights" style="font-size:12px">${gerarAnaliseIA(recs,dess)}</div></div>
  </div>
  <div class="main-grid">
    <div class="card"><h3>Evolução Financeira</h3><canvas id="chartLucro" style="height:300px; max-height:300px"></canvas></div>
    <div class="card">
      <h3>Executive Score</h3>
      <div style="display:flex; justify-content:center; margin-bottom:20px"><canvas id="chartScore" style="width:150px; height:150px; max-width:150px; max-height:150px"></canvas></div>
      <div class="score-item"><div class="score-label"><span>Rentabilidade</span><span>${rent}%</span></div><div class="progress-bg"><div class="progress-fill" style="width:${rent}%; background:#22c55e"></div></div></div>
      <div class="score-item"><div class="score-label"><span>Saúde</span><span>${saude}%</span></div><div class="progress-bg"><div class="progress-fill" style="width:${saude}%; background:#3b82f6"></div></div></div>
      <div class="score-item"><div class="score-label"><span>Custos</span><span>${custos}%</span></div><div class="progress-bg"><div class="progress-fill" style="width:${custos}%; background:#ef4444"></div></div></div>
      <div class="score-item"><div class="score-label"><span>Crescimento</span><span>${cresc}%</span></div><div class="progress-bg"><div class="progress-fill" style="width:${Math.abs(cresc)}%; background:${cresc>=0?'#22c55e':'#ef4444'}"></div></div></div>
    </div>
  </div>
  <div class="card">
    <h3>🏆 Ranking de Clientes</h3>
    <table style="margin-top:0">
      ${sortedR.map((item,i)=>`<tr><td style="width:40px; font-weight:bold; color:#f59e0b">${i+1}º</td><td>${item[0]}</td><td style="text-align:right; font-weight:bold">${moedaBR(item[1])}</td><td style="width:200px"><div class="progress-bg"><div class="progress-fill" style="width:${tr>0?(item[1]/tr*100).toFixed(0):0}%; background:#22c55e"></div></div></td></tr>`).join('')}
      ${sortedR.length===0?'<tr><td colspan="4" style="color:#94a3b8">Nenhum dado disponível</td></tr>':''}
    </table>
  </div>`;
  initCharts(recs,dess,rent);
}

function renderDashComissoes(recs){
  let tv=recs.filter(r=>r.vendedor).reduce((a,r)=>a+(numeroBR(r.valor)),0);
  let va=[...new Set(recs.filter(r=>r.vendedor).map(r=>r.vendedor))];
  let tc=0, rv={};
  
  // Primeiro, agrupa as vendas por vendedor
  recs.filter(r=>r.vendedor).forEach(r=>{
    if(!rv[r.vendedor]) rv[r.vendedor] = {vendido:0, comissao:0, meta:0, bonus:0, atingiuMeta:false};
    rv[r.vendedor].vendido += (numeroBR(r.valor));
  });

  // Depois, calcula a comissão baseada na meta
  Object.keys(rv).forEach(nome => {
    let v = db.vendedores.find(vend => vend.nome === nome);
    if(v) {
      rv[nome].meta = numeroBR(v.meta);
      rv[nome].bonus = numeroBR(v.comissaoBonus);
      rv[nome].comissaoBase = numeroBR(v.comissao);
      rv[nome].atingiuMeta = (rv[nome].meta > 0 && rv[nome].vendido >= rv[nome].meta);
      
      let p = rv[nome].atingiuMeta ? rv[nome].bonus : rv[nome].comissaoBase;
      rv[nome].comissao = rv[nome].vendido * (p/100);
      rv[nome].percAplicado = p;
      tc += rv[nome].comissao;
    }
  });
  
  // Determinar o período exibido
  let periodoTexto = 'Todos os períodos';
  if(filtroPeriodo === 'mes_atual') periodoTexto = 'Mês atual';
  else if(filtroPeriodo === 'mes_anterior') periodoTexto = 'Mês anterior';
  else if(filtroPeriodo === 'trimestre') periodoTexto = 'Últimos 3 meses';
  else if(filtroPeriodo === 'semestre') periodoTexto = 'Últimos 6 meses';
  else if(filtroPeriodo === 'ano') periodoTexto = 'Este ano';
  else if(filtroPeriodo === 'custom') periodoTexto = `De ${dataInicioCustom} a ${dataFimCustom}`;

  let mc=va.length>0?tc/va.length:0;
  let sv=Object.entries(rv).sort((a,b)=>b[1].vendido-a[1].vendido);
  
  document.getElementById('dash-content').innerHTML=`
  <div class="dash-grid">
    <div class="dash-card card-vendido"><h4>💰 Total Vendido</h4><div class="value">${moedaBR(tv)}</div><span style="font-size:12px; color:#94a3b8">Período: ${periodoTexto}</span></div>
    <div class="dash-card card-vendedores"><h4>👥 Vendedores</h4><div class="value">${va.length}</div></div>
    <div class="dash-card card-total-comissao"><h4>💸 Total Comissão</h4><div class="value">${moedaBR(tc)}</div></div>
    <div class="dash-card card-media-comissao"><h4>📊 Média Comissão</h4><div class="value">${moedaBR(mc)}</div></div>
  </div>
  <div class="card">
    <h3>🏆 Ranking e Metas de Vendedores (${periodoTexto})</h3>
    <table style="margin-top:0">
      <tr>
        <th>Posição</th>
        <th>Vendedor</th>
        <th>Total Vendido</th>
        <th>Meta (R$)</th>
        <th>Comissão (%)</th>
        <th>Valor Comissão</th>
        <th>Progresso Meta</th>
      </tr>
      ${sv.map((item,i)=>{
        let info = item[1];
        let percMeta = info.meta > 0 ? Math.min(100, (info.vendido / info.meta * 100)) : 100;
        let corProgresso = info.atingiuMeta ? '#22c55e' : '#f59e0b';
        let statusMeta = info.meta > 0 ? (info.atingiuMeta ? 'META ATINGIDA!' : `Faltam ${moedaBR(info.meta - info.vendido)}`) : 'Sem meta';
        return `<tr>
          <td style="font-weight:bold; color:#f59e0b">${i+1}º</td>
          <td>${item[0]} ${info.atingiuMeta ? '🏆' : ''}</td>
          <td style="font-weight:bold">${moedaBR(info.vendido)}</td>
          <td style="color:#94a3b8">${moedaBR(info.meta)}</td>
          <td style="color:${info.atingiuMeta?'#22c55e':'#94a3b8'}">${info.percAplicado}% ${info.atingiuMeta?'(Bônus)':''}</td>
          <td style="color:#22c55e; font-weight:bold">${moedaBR(info.comissao)}</td>
          <td style="width:200px">
            <div class="progress-bg">
              <div class="progress-fill" style="width:${percMeta}%; background:${corProgresso}"></div>
            </div>
            <span style="font-size:10px; color:#94a3b8">${percMeta.toFixed(1)}% - ${statusMeta}</span>
          </td>
        </tr>`;
      }).join('')}
      ${sv.length===0?'<tr><td colspan="7" style="color:#94a3b8; text-align:center; padding:20px"><strong>Nenhuma venda com vendedor no período selecionado.</strong> Verifique se as datas das receitas estão dentro do período de filtro.</td></tr>':''}
    </table>
  </div>`;
}

function renderDashDRE(recs,dess){
  let rg={}; recs.forEach(r=>{ rg[r.grupo]=(rg[r.grupo]||0)+(numeroBR(r.valor)); });
  let trb=Object.values(rg).reduce((a,b)=>a+b,0);
  let dg={}; dess.forEach(d=>{ dg[d.grupo]=(dg[d.grupo]||0)+(numeroBR(d.valor)); });
  let td=Object.values(dg).reduce((a,b)=>a+b,0);
  let ll=trb-td;
  document.getElementById('dash-content').innerHTML=`
  <div class="card">
    <h3>Demonstrativo do Resultado do Exercício (DRE)</h3>
    <table style="margin-top:20px">
      <tr style="background:#1e293b"><th colspan="2">DESCRIÇÃO</th><th style="text-align:right">VALOR</th></tr>
      <tr style="font-weight:bold; color:#22c55e"><td>(+) RECEITA OPERACIONAL BRUTA</td><td></td><td style="text-align:right">${moedaBR(trb)}</td></tr>
      ${Object.entries(rg).map(([g,v])=>`<tr style="font-size:12px; color:#94a3b8"><td>&nbsp;&nbsp;&nbsp;&nbsp;${g}</td><td></td><td style="text-align:right">${moedaBR(v)}</td></tr>`).join('')}
      <tr style="font-weight:bold"><td>(=) RECEITA LÍQUIDA</td><td></td><td style="text-align:right">${moedaBR(trb)}</td></tr>
      <tr style="font-weight:bold; color:#ef4444"><td>(-) DESPESAS OPERACIONAIS</td><td></td><td style="text-align:right">${moedaBR(td)}</td></tr>
      ${Object.entries(dg).map(([g,v])=>`<tr style="font-size:12px; color:#94a3b8"><td>&nbsp;&nbsp;&nbsp;&nbsp;${g}</td><td></td><td style="text-align:right">${moedaBR(v)}</td></tr>`).join('')}
      <tr style="height:20px"><td></td><td></td><td></td></tr>
      <tr style="background:#1e293b; font-weight:bold; font-size:16px; color:${ll>=0?'#22c55e':'#ef4444'}">
        <td>(=) RESULTADO LÍQUIDO</td><td></td><td style="text-align:right">${moedaBR(ll)}</td>
      </tr>
    </table>
  </div>`;
}

function renderDashFluxo(){
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  let sa=db.contas.reduce((a,c)=>a+(numeroBR(c.saldo)),0);
  const gp=(dias)=>{ let dl=new Date(); dl.setDate(hoje.getDate()+dias); dl.setHours(23,59,59,999); let e=db.receitas.filter(r=>{ let d=new Date(r.vencimento+"T00:00:00"); return d>=hoje&&d<=dl; }).reduce((a,r)=>a+(numeroBR(r.valor)),0); let s=db.despesas.filter(d=>{ let dt=new Date(d.vencimento+"T00:00:00"); return dt>=hoje&&dt<=dl; }).reduce((a,d)=>a+(numeroBR(d.valor)),0); return{e,s,saldo:sa+e-s}; };
  let p7=gp(7),p15=gp(15),p30=gp(30),p60=gp(60),sd=gp(0);
  const cpm=(lista)=>{ let t=0,c=0; lista.forEach(i=>{ if(i.situacao!=="Pago"&&i.situacao!=="Recebido"){ let v=new Date(i.vencimento+"T00:00:00"); let d=Math.ceil((v-hoje)/(864e5)); if(d>=0){t+=d;c++;} } }); return c>0?Math.round(t/c):0; };
  document.getElementById('dash-content').innerHTML=`
  <div class="dash-grid">
    <div class="dash-card card-saldo-atual"><h4>💳 Saldo Atual</h4><div class="value">${moedaBR(sa)}</div></div>
    <div class="dash-card card-saldo-dia"><h4>📅 Saldo do Dia</h4><div class="value">${moedaBR(sd.saldo)}</div></div>
    <div class="dash-card card-projecao-30"><h4>📊 Projeção 30 dias</h4><div class="value">${moedaBR(p30.saldo)}</div></div>
    <div class="dash-card card-prazo-pagto"><h4>⌛ Prazo Médio Pagamento</h4><div class="value">${cpm(db.despesas)} dias</div></div>
    <div class="dash-card card-prazo-receb"><h4>⌛ Prazo Médio Recebimento</h4><div class="value">${cpm(db.receitas)} dias</div></div>
  </div>
  <div class="card">
    <h3>📈 Projeção de Caixa</h3>
    <div class="dash-grid" style="margin-top:20px">
      ${[{d:'7 dias',p:p7},{d:'15 dias',p:p15},{d:'30 dias',p:p30},{d:'60 dias',p:p60}].map(({d,p})=>`
      <div class="dash-card"><h4 style="color:#94a3b8">${d}</h4><div class="value">${moedaBR(p.saldo)}</div>
      <div style="font-size:12px; margin-top:10px"><span style="color:#22c55e">+ ${moedaBR(p.e)}</span><br><span style="color:#ef4444">- ${moedaBR(p.s)}</span></div></div>`).join('')}
    </div>
  </div>`;
}

function initCharts(recs,dess,rent){
  // Recria os gráficos sempre que o dashboard muda.
  if(chartEvolucaoFinanceira){ try{ chartEvolucaoFinanceira.destroy(); }catch(e){} chartEvolucaoFinanceira=null; }
  if(chartExecutiveScore){ try{ chartExecutiveScore.destroy(); }catch(e){} chartExecutiveScore=null; }

  const canvasLucro=document.getElementById('chartLucro');
  const canvasScore=document.getElementById('chartScore');
  if(!canvasLucro || !canvasScore || typeof Chart === 'undefined') return;

  // Garante altura real para o Chart.js em todos os filtros.
  canvasLucro.style.height='300px';
  canvasLucro.parentElement.style.minHeight='340px';

  const hoje=new Date();
  const pad2=n=>String(n).padStart(2,'0');
  const isoDia=d=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const isoMes=d=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  const addDia=(d,q=1)=>{ const x=new Date(d); x.setDate(x.getDate()+q); return x; };
  const addMes=(d,q=1)=>{ const x=new Date(d); x.setMonth(x.getMonth()+q); return x; };
  const parseData=ds=>{
    if(!ds || typeof ds!=='string') return null;
    const p=ds.slice(0,10).split('-');
    if(p.length<3) return null;
    return new Date(Number(p[0]), Number(p[1])-1, Number(p[2]));
  };
  const dataReceita=r=>r.vencimento || r.dataVenda || r.data || '';

  let modo='mensal';
  let labels=[];

  function preencherDias(inicio,fim){
    modo='diario'; labels=[];
    for(let d=new Date(inicio); d<=fim; d=addDia(d,1)) labels.push(isoDia(d));
  }
  function preencherMeses(inicio,fim){
    modo='mensal'; labels=[];
    const ini=new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const end=new Date(fim.getFullYear(), fim.getMonth(), 1);
    for(let d=ini; d<=end; d=addMes(d,1)) labels.push(isoMes(d));
  }

  if(filtroPeriodo==='mes_atual'){
    const ini=new Date(hoje.getFullYear(),hoje.getMonth(),1);
    const fim=new Date(hoje.getFullYear(),hoje.getMonth()+1,0);
    preencherDias(ini,fim);
  }else if(filtroPeriodo==='mes_anterior'){
    const ini=new Date(hoje.getFullYear(),hoje.getMonth()-1,1);
    const fim=new Date(hoje.getFullYear(),hoje.getMonth(),0);
    preencherDias(ini,fim);
  }else if(filtroPeriodo==='trimestre'){
    preencherMeses(new Date(hoje.getFullYear(),hoje.getMonth()-2,1), new Date(hoje.getFullYear(),hoje.getMonth()+1,0));
  }else if(filtroPeriodo==='semestre'){
    preencherMeses(new Date(hoje.getFullYear(),hoje.getMonth()-5,1), new Date(hoje.getFullYear(),hoje.getMonth()+1,0));
  }else if(filtroPeriodo==='ano'){
    preencherMeses(new Date(hoje.getFullYear(),0,1), new Date(hoje.getFullYear(),11,31));
  }else if(filtroPeriodo==='comparacao'){
    modo='mensal';
    labels=(mesesSelecionados&&mesesSelecionados.length?mesesSelecionados:[]).slice().sort();
  }else if(filtroPeriodo==='custom' && dataInicioCustom && dataFimCustom){
    const ini=parseData(dataInicioCustom), fim=parseData(dataFimCustom);
    const dias=ini&&fim ? Math.round((fim-ini)/86400000) : 999;
    if(ini&&fim&&dias<=62) preencherDias(ini,fim); else if(ini&&fim) preencherMeses(ini,fim);
  }

  // Em "Tudo" ou se não houver labels montadas, usa todos os meses que possuem dados.
  if(labels.length===0){
    const set=new Set();
    (recs||[]).forEach(r=>{ const ds=dataReceita(r); if(ds&&ds.length>=7) set.add(ds.slice(0,7)); });
    (dess||[]).forEach(d=>{ const ds=d.vencimento; if(ds&&ds.length>=7) set.add(ds.slice(0,7)); });
    labels=[...set].sort();
    modo='mensal';
  }

  // Se ainda assim não tiver dados, mostra o mês atual zerado para não deixar o gráfico branco.
  if(labels.length===0){ labels=[isoMes(hoje)]; modo='mensal'; }

  const mapa={};
  labels.forEach(k=>mapa[k]={r:0,d:0});
  const chave=(ds)=> modo==='diario' ? (ds||'').slice(0,10) : (ds||'').slice(0,7);

  (recs||[]).forEach(r=>{
    const k=chave(dataReceita(r));
    if(!mapa[k]) mapa[k]={r:0,d:0};
    mapa[k].r += numeroBR(r.valor);
  });
  (dess||[]).forEach(d=>{
    const k=chave(d.vencimento);
    if(!mapa[k]) mapa[k]={r:0,d:0};
    mapa[k].d += numeroBR(d.valor);
  });

  // Mantém só o intervalo do filtro, mas aceita dados que caírem nele.
  labels=labels.filter(k=>mapa[k]).sort();
  const labelTela=k=>{
    if(modo==='diario'){
      const [a,m,d]=k.split('-'); return `${d}/${m}`;
    }
    const [a,m]=k.split('-'); return `${m}/${a}`;
  };

  chartEvolucaoFinanceira = new Chart(canvasLucro.getContext('2d'),{
    type:'line',
    data:{
      labels:labels.map(labelTela),
      datasets:[
        {label:'Receita',data:labels.map(l=>mapa[l].r),borderColor:'#22c55e',backgroundColor:'rgba(34,197,94,.12)',tension:.35,fill:true,pointRadius:4,pointHoverRadius:6},
        {label:'Despesa',data:labels.map(l=>mapa[l].d),borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,.10)',tension:.35,fill:true,pointRadius:4,pointHoverRadius:6}
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{labels:{color:'#94a3b8'}},
        tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${moedaBR(ctx.parsed.y)}`}}
      },
      scales:{
        y:{beginAtZero:true,grid:{color:'#1e293b'},ticks:{color:'#94a3b8',callback:(v)=>moedaBR(v)}},
        x:{grid:{display:false},ticks:{color:'#94a3b8',maxRotation:45,minRotation:0}}
      }
    }
  });

  chartExecutiveScore = new Chart(canvasScore.getContext('2d'),{
    type:'doughnut',
    data:{datasets:[{data:[rent||.1,100-(rent||.1)],backgroundColor:[rent>0?'#3b82f6':'#1e293b','#1e293b'],borderWidth:0}]},
    options:{cutout:'80%',plugins:{tooltip:{enabled:false}}}
  });
}

function escaparHTML(valor){
  return String(valor ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

function escaparAtributo(valor){ return escaparHTML(valor); }
