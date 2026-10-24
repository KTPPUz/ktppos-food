import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import CustomerOrder from './CustomerOrder';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{window.location.pathname.startsWith('/order/')?<CustomerOrder token={window.location.pathname.split('/')[2]||''}/>:<App/>}</React.StrictMode>);
