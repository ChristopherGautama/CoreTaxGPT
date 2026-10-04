import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
// Pages serves static files without an SPA fallback. Hash routes keep reloads
// on the real repository index while the local development routes stay intact.
const Router = import.meta.env.MODE === 'github-pages' ? HashRouter : BrowserRouter;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Router><App /></Router></React.StrictMode>);
