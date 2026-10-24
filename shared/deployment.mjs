export function customerOrderUrl(base, token) {
  const url = new URL(base);
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('ที่อยู่เว็บต้องเป็น HTTP/HTTPS โดยไม่มีบัญชี query หรือ hash');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  // The fragment is never requested from static hosting, so Pages needs no SPA rewrite.
  url.hash = '/order/' + encodeURIComponent(token);
  return url.href;
}

export function customerOrderToken(pathname, hash) {
  const route = hash.startsWith('#/order/') ? hash.slice(1) : pathname;
  return route.startsWith('/order/') ? route.split('/')[2] || '' : null;
}

export function apiEndpoint(base, path) {
  const prefix = (base || '/api').replace(/\/+$/, '');
  return prefix + '/' + path.replace(/^\/+/, '');
}
