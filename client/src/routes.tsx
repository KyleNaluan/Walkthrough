import {Navigate, Route, Routes} from 'react-router';
import {ProtectedRoute} from './auth/ProtectedRoute';
import {landingPathFor, useAuth} from './auth/useAuth';
import {Layout} from './components/Layout';
import {InspectionPage} from './pages/InspectionPage';
import {LoginPage} from './pages/LoginPage';
import {NotFoundPage} from './pages/NotFoundPage';
import {StoreDetailPage} from './pages/StoreDetailPage';
import {StoresPage} from './pages/StoresPage';
import {TicketDetailPage} from './pages/TicketDetailPage';
import {TicketsPage} from './pages/TicketsPage';

function Home() {
  const {user} = useAuth();
  return <Navigate to={user ? landingPathFor(user.role) : '/login'} replace />;
}

/** Every page. Stories fill in their page; the server still checks access. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/stores" element={<StoresPage />} />
          <Route path="/stores/:storeId" element={<StoreDetailPage />} />
          <Route
            path="/inspections/:inspectionId"
            element={<InspectionPage />}
          />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
