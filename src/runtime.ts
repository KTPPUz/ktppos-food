import {apiEndpoint} from '../shared/deployment.mjs';
export const externalApi = !!import.meta.env.VITE_API_BASE_URL;
export const apiUrl = (path:string) => apiEndpoint(import.meta.env.VITE_API_BASE_URL,path);
export const publicAppUrl = () => new URL(import.meta.env.BASE_URL,window.location.origin).href;
