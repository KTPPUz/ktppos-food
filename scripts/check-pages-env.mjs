const value=process.env.VITE_API_BASE_URL;
try {
  if(!value)throw new Error('missing');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.replace(/\/$/,'').endsWith('/api'))throw new Error('invalid');
  if(['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('local');
  console.log('Pages backend URL is configured.');
} catch {
  console.error('::error::Set repository variable VITE_API_BASE_URL to your live HTTPS API URL, for example https://your-service.onrender.com/api. GitHub Pages cannot run the Node.js API. See docs/DEPLOYMENT.md.');
  process.exitCode=1;
}
