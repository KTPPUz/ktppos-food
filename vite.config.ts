import {defineConfig,loadEnv} from 'vite';

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'VITE_');
  return {
    // Root for Node/Render; repository prefix for GitHub Pages.
    base:process.env.VITE_BASE_PATH||env.VITE_BASE_PATH||'/',
  };
});
