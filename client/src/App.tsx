import {AuthProvider} from './auth/AuthContext';
import {AppRoutes} from './routes';

/** The app inside a router (BrowserRouter in main.tsx, MemoryRouter in tests). */
export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
