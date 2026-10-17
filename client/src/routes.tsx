import {lazy, Suspense} from 'react';
import {Navigate, Route, Routes} from 'react-router';
import {ProtectedRoute} from './auth/ProtectedRoute';
import {landingPathFor, useAuth} from './auth/useAuth';
import {Layout} from './components/Layout';
import {Loading} from './components/ui/LoadState';
import {LoginPage} from './pages/LoginPage';
import {NotFoundPage} from './pages/NotFoundPage';
import {StoreDetailPage} from './pages/StoreDetailPage';
import {StoresPage} from './pages/StoresPage';
import {TicketsPage} from './pages/TicketsPage';

// The date pickers are large, so these pages load on first visit.
const InspectionPage = lazy(() =>
  import('./pages/InspectionPage').then((page) => ({
    default: page.InspectionPage,
  })),
);

const TicketDetailPage = lazy(() =>
  import('./pages/TicketDetailPage').then((page) => ({
    default: page.TicketDetailPage,
  })),
);

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
            element={
              <Suspense fallback={<Loading />}>
                <InspectionPage />
              </Suspense>
            }
          />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route
            path="/tickets/:ticketId"
            element={
              <Suspense fallback={<Loading />}>
                <TicketDetailPage />
              </Suspense>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
