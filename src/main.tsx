import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error handling to help debug blank page issues
window.addEventListener('error', (event) => {
  console.error('GLOBAL ERROR:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('UNHANDLED REJECTION:', event.reason);
});

console.log("Frontend initializing...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("FATAL: Root element not found!");
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  console.log("Frontend render called.");
}
