if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => console.log('✅ PWA ativo: service worker registrado'))
      .catch(err => console.warn('⚠️ Service worker não registrado:', err));
  });
}
