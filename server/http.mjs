export function configureHttp(app,{allowedOrigins=[],trustProxy=false}={}) {
  app.set('trust proxy',trustProxy);
  const allowed = new Set(allowedOrigins.map(value=>{
    const url=new URL(value);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('CORS_ALLOWED_ORIGINS must contain origins, without paths');
    return url.origin;
  }));
  app.get('/healthz',(_,res)=>res.set('Cache-Control','no-store').json({status:'ok'}));
  app.use('/api',(req,res,next)=>{
    const origin=req.get('Origin');
    res.vary('Origin');
    // The API accepts the same origin, plus explicitly configured frontend origins.
    if(origin && origin!==`${req.protocol}://${req.get('host')}` && !allowed.has(origin)) {
      return res.status(403).json({error:'เว็บไซต์นี้ไม่ได้รับอนุญาตให้เรียก API'});
    }
    if(origin) {
      res.set('Access-Control-Allow-Origin',origin);
      res.set('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
      res.set('Access-Control-Allow-Headers','Authorization,Content-Type');
    }
    res.set('Cache-Control','no-store');
    if(req.method==='OPTIONS')return res.sendStatus(204);
    next();
  });
}

export function serverOptions(env,lanUrls=[]) {
  const port=Number(env.PORT||5173);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535');
  const host=env.HOST||'0.0.0.0';
  const publicBase=env.CUSTOMER_BASE_URL||env.RENDER_EXTERNAL_URL;
  let customerBaseUrls;
  if(publicBase) {
    const url=new URL(publicBase);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('CUSTOMER_BASE_URL must be an HTTP/HTTPS URL without credentials, query or hash');
    customerBaseUrls=[url.href.replace(/\/$/,'')];
  } else if(env.NODE_ENV==='production') {
    customerBaseUrls=[]; // The browser falls back to the actual public frontend URL.
  } else {
    customerBaseUrls=[...new Set([...(host==='127.0.0.1'?[]:lanUrls),`http://localhost:${port}`])];
  }
  const proxy=env.TRUST_PROXY||'0';
  if(!/^\d+$/.test(proxy))throw new Error('TRUST_PROXY must be a non-negative proxy hop count');
  return {port,host,customerBaseUrls,trustProxy:Number(proxy),allowedOrigins:(env.CORS_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)};
}
