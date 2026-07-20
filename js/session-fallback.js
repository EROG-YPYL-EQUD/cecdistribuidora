// Segurança extra: se o Firebase ou algum script falhar, não deixa preso em "Verificando sessão".
window.addEventListener('load', function(){
  setTimeout(function(){
    var loading = document.getElementById('login-loading');
    var login = document.getElementById('login-screen');
    var app = document.getElementById('main-app');
    if(loading && loading.style.display !== 'none' && (!app || app.style.display !== 'block')){
      loading.style.display = 'none';
      if(login) login.style.display = 'flex';
    }
  }, 3000);
});
