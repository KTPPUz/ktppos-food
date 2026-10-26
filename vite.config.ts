import {defineConfig,loadEnv} from 'vite';

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'VITE_');
  return {
    // Root for Node/Render; repository prefix for GitHub Pages.
    base:process.env.VITE_BASE_PATH||env.VITE_BASE_PATH||'/',
    server:{proxy:{'/api':{target:`http://127.0.0.1:${process.env.PHP_API_PORT||8050}`},'/healthz':{target:`http://127.0.0.1:${process.env.PHP_API_PORT||8050}`}}},
  };
});
