/* ============================================================
   FIREBASE — Auth + Realtime Database
   Compatível com abertura local (file://) e hospedagem web.
   Mantém os dados isolados em /users/{uid}/...
============================================================ */
(function(){
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyCSfaj4BFBLppeYNYLRZfLCdqRhomnGIC8",
    authDomain: "cecdistribuidora-5e148.firebaseapp.com",
    databaseURL: "https://cecdistribuidora-5e148-default-rtdb.firebaseio.com",
    projectId: "cecdistribuidora-5e148",
    storageBucket: "cecdistribuidora-5e148.firebasestorage.app",
    messagingSenderId: "761298781257",
    appId: "1:761298781257:web:4e0d2d8142dc892c23eb98",
    measurementId: "G-LE6VJNJ5Q1"
  };

  if (!window.firebase) {
    console.error('Firebase SDK não carregou.');
    window.addEventListener('DOMContentLoaded', function(){
      const loading = document.getElementById('login-loading');
      const login = document.getElementById('login-screen');
      const err = document.getElementById('login-error');
      if (loading) loading.style.display = 'none';
      if (login) login.style.display = 'flex';
      if (err) {
        err.textContent = 'Não foi possível carregar o Firebase. Verifique sua conexão com a internet.';
        err.style.display = 'block';
      }
    });
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const database = firebase.database();

  // API compatível com o restante do sistema, sem exigir módulos ES locais.
  window._auth = auth;
  window._db = database;
  window._dbRef = function(db, path){ return path ? db.ref(path) : db.ref(); };
  window._dbSet = function(reference, value){ return reference.set(value); };
  window._dbGet = function(reference){ return reference.once('value'); };
  window._dbChild = function(reference, path){ return reference.child(path); };
  window._dbUpdate = function(reference, updates){ return reference.update(updates); };
  window._signInFn = function(authInstance, email, password){
    return authInstance.signInWithEmailAndPassword(email, password);
  };
  window._signOutFn = function(authInstance){ return authInstance.signOut(); };

  async function aguardarSistemaPronto(){
    if (typeof window.carregarDadosFirebase === 'function') return true;

    if (document.readyState === 'loading') {
      await new Promise(resolve => window.addEventListener('DOMContentLoaded', resolve, {once:true}));
    }

    let tentativas = 0;
    while (typeof window.carregarDadosFirebase !== 'function' && tentativas < 100) {
      await new Promise(resolve => setTimeout(resolve, 50));
      tentativas++;
    }
    return typeof window.carregarDadosFirebase === 'function';
  }

  auth.onAuthStateChanged(async function(user){
    const sistemaPronto = await aguardarSistemaPronto();
    if (!sistemaPronto) {
      console.error('Sistema não inicializou: carregarDadosFirebase não ficou disponível.');
      const loading = document.getElementById('login-loading');
      const login = document.getElementById('login-screen');
      if (loading) loading.style.display = 'none';
      if (login) login.style.display = 'flex';
      return;
    }

    if (user) {
      window._uid = user.uid;
      window.mostrarCarregando?.('Carregando dados do Firebase...');
      try {
        await window.carregarDadosFirebase();
        const login = document.getElementById('login-screen');
        const app = document.getElementById('main-app');
        if (login) login.style.display = 'none';
        if (app) app.style.display = 'block';
        window.atualizarSaudacaoGlobal?.();
        window.mudarAba?.('dashboard');
        window.reiniciarTimersInatividade?.();
      } catch (err) {
        console.error('Erro ao abrir sistema:', err);
        try { await auth.signOut(); } catch(e) { console.error(e); }
        const login = document.getElementById('login-screen');
        const app = document.getElementById('main-app');
        if (login) login.style.display = 'flex';
        if (app) app.style.display = 'none';
      } finally {
        window.esconderCarregando?.();
        const btn = document.getElementById('btn-entrar');
        if (btn) { btn.disabled = false; btn.textContent = 'Entrar no Sistema'; }
      }
    } else {
      window._uid = null;
      window.pararTimersInatividade?.();
      const login = document.getElementById('login-screen');
      const app = document.getElementById('main-app');
      if (login) login.style.display = 'flex';
      if (app) app.style.display = 'none';
      window.esconderCarregando?.();
      const btn = document.getElementById('btn-entrar');
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar no Sistema'; }
    }
  });
})();
