import React, { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ToastProvider } from './components/ToastContext.jsx';
import { ThemeProvider } from './components/ThemeContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { pageModules } from './routeModules.js';

const Login = lazy(pageModules.login);
const Layout = lazy(pageModules.layout);
const Forgot = lazy(pageModules.forgot);
const Reset = lazy(pageModules.reset);
const Dashboard = lazy(pageModules.dashboard);
const Fuel = lazy(pageModules.fuel);
const ImportExcel = lazy(pageModules.importExcel);
const FuelRequests = lazy(pageModules.fuelRequests);
const CarRequests = lazy(pageModules.carRequests);
const FuelRequestsManage = lazy(pageModules.fuelRequestsManage);
const FuelRequestsRaf = lazy(pageModules.fuelRequestsRaf);
const CarRequestsManage = lazy(pageModules.carRequestsManage);
const CarRequestsRaf = lazy(pageModules.carRequestsRaf);
const CalendarView = lazy(pageModules.calendar);
const Logbooks = lazy(pageModules.logbooks);
const LogbookEdit = lazy(pageModules.logbookEdit);
const PrintFuelRequest = lazy(pageModules.printFuel);
const PrintCarRequest = lazy(pageModules.printCar);
const PrintLogbook = lazy(pageModules.printLogbook);
const Meta = lazy(pageModules.meta);
const Trash = lazy(pageModules.trash);
const Users = lazy(pageModules.users);

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ThemeProvider>
          <Suspense fallback={<div className="container" role="status">Chargement…</div>}>
            <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot" element={<Forgot />} />
            <Route path="/reset" element={<Reset />} />

            {/* Print routes */}
            <Route
              path="/print/fuel/:id"
              element={
                <ProtectedRoute>
                  <PrintFuelRequest />
                </ProtectedRoute>
              }
            />
            <Route
              path="/print/car/:id"
              element={
                <ProtectedRoute>
                  <PrintCarRequest />
                </ProtectedRoute>
              }
            />
            <Route
              path="/print/logbook/:id"
              element={
                <ProtectedRoute>
                  <PrintLogbook />
                </ProtectedRoute>
              }
            />

            {/* Le Layout reste monte entre deux pages : seule la zone centrale
                change, sans reconstruire sidebar, topbar et notifications. */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/app" element={<Dashboard />} />
              <Route path="/app/fuel" element={<Fuel />} />
              <Route path="/app/requests/fuel" element={<FuelRequests />} />
              <Route path="/app/requests/car" element={<CarRequests />} />
              <Route path="/app/calendar" element={<CalendarView />} />

              <Route path="/app/users" element={<ProtectedRoute roles={['ADMIN']}><Users /></ProtectedRoute>} />
              <Route path="/app/import" element={<ProtectedRoute roles={['ADMIN', 'LOGISTIQUE']}><ImportExcel /></ProtectedRoute>} />
              <Route path="/app/requests/fuel/manage" element={<ProtectedRoute roles={['LOGISTIQUE']}><FuelRequestsManage /></ProtectedRoute>} />
              <Route path="/app/requests/fuel/raf" element={<ProtectedRoute roles={['RAF']}><FuelRequestsRaf /></ProtectedRoute>} />
              <Route path="/app/requests/car/manage" element={<ProtectedRoute roles={['LOGISTIQUE']}><CarRequestsManage /></ProtectedRoute>} />
              <Route path="/app/requests/car/raf" element={<ProtectedRoute roles={['RAF']}><CarRequestsRaf /></ProtectedRoute>} />
              <Route path="/app/meta" element={<ProtectedRoute roles={['ADMIN', 'LOGISTIQUE']}><Meta /></ProtectedRoute>} />
              <Route path="/app/trash" element={<ProtectedRoute roles={['ADMIN', 'LOGISTIQUE']}><Trash /></ProtectedRoute>} />
              <Route path="/app/logbooks" element={<ProtectedRoute roles={['ADMIN', 'LOGISTIQUE', 'RAF']}><Logbooks /></ProtectedRoute>} />
              <Route path="/app/logbooks/:id" element={<ProtectedRoute roles={['ADMIN', 'LOGISTIQUE', 'RAF']}><LogbookEdit /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </ThemeProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
