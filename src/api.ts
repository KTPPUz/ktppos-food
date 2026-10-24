import {apiUrl} from './runtime';
export async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch(apiUrl(path),{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(sessionStorage.getItem('bt-token')||'')},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'ไม่สามารถเชื่อมต่อได้');return data;
}
