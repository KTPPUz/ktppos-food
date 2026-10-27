import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import DemoBanner from './DemoBanner';
import {mockupMode} from './runtime';
import {customerOrderToken} from '../shared/deployment.mjs';
import CustomerOrder from './CustomerOrder';
import './styles.css';
import './modern.css';

const currentGuestToken=()=>customerOrderToken(window.location.pathname,window.location.hash);
function Root(){
  const [guestToken,setGuestToken]=useState(currentGuestToken);
  useEffect(()=>{
    const update=()=>setGuestToken(currentGuestToken());
    window.addEventListener('hashchange',update);
    window.addEventListener('popstate',update);
    return()=>{window.removeEventListener('hashchange',update);window.removeEventListener('popstate',update);};
  },[]);
  return <>{mockupMode&&<DemoBanner/>}<div className={mockupMode?'demo-content':undefined}>{guestToken!==null?<CustomerOrder key={guestToken} token={guestToken}/>:<App/>}</div></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Root/></React.StrictMode>);
