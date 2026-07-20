// Login seguro: nunca deixa a tela presa em "Verificando sessão".
document.addEventListener('DOMContentLoaded', function(){
  const loading = document.getElementById('login-loading');
  const login = document.getElementById('login-screen');
  const app = document.getElementById('main-app');
  if(loading) loading.style.display = 'none';
  if(login && (!app || app.style.display !== 'block')) login.style.display = 'flex';
});
