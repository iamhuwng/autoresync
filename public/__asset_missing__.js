(() => {
  const target = new URL(window.location.href);
  target.searchParams.set('asset_refresh', String(Date.now()));
  console.warn('Stale application asset requested. Reloading with a cache-busting URL.');
  window.location.replace(target.toString());
})();
