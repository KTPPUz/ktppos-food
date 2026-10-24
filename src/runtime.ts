import {apiEndpoint} from '../shared/deployment.mjs';
export const mockupMode = import.meta.env.VITE_DEPLOY_TARGET==='pages' && !import.meta.env.VITE_API_BASE_URL;
export const externalApi = !!import.meta.env.VITE_API_BASE_URL;
export const apiUrl = (path:string) => apiEndpoint(import.meta.env.VITE_API_BASE_URL,path);
export const publicAppUrl = () => new URL(import.meta.env.BASE_URL,window.location.origin).href;

export async function apiFetch(path:string,options:RequestInit={}){
 if(mockupMode){const {demoFetch}=await import('./demo/transport.mjs');return demoFetch(path,options) as Promise<Response>;}
 return fetch(apiUrl(path),options);
}
