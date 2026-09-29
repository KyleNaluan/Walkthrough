import {useEffect, useState} from 'react';
import {apiGet} from './api';

type ApiStatus = 'checking' | 'ok' | 'down';

export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    apiGet<{status: string}>('/api/health')
      .then((body) => setApiStatus(body.status === 'ok' ? 'ok' : 'down'))
      .catch(() => setApiStatus('down'));
  }, []);

  return (
    <main>
      <h1>Walkthrough</h1>
      <p>Food and beverage inspections, from finding to fix.</p>
      <p>API: {apiStatus}</p>
    </main>
  );
}
