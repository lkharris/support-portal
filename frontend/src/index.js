import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// This is the entry point of your React application.
// It finds the 'root' div in your public/index.html file and
// renders the main App component inside of it.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
