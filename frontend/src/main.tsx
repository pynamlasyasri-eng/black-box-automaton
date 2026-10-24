import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ExperimentProvider } from './components/ExperimentContext';
import { ToastProvider } from './components/Toast';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ExperimentProvider>
          <App />
        </ExperimentProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
