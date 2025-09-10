import './polyfills.ts';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Buffer } from 'buffer';

// Add Buffer polyfill globally
window.Buffer = window.Buffer || Buffer;

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <ToastContainer />
  </QueryClientProvider>
);