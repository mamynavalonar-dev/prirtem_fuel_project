import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ToastProvider } from './components/ToastContext.jsx';
import { ThemeProvider } from './components/ThemeContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';

import Login from './pages/Login.jsx';
import Forgot from './pages/Forgot.jsx';
import Reset from './pages/Reset.jsx';

import Dashboard from './pages/Dashboard.jsx';
import Fuel from './pages/Fuel.jsx';
import ImportExcel from './pages/ImportExcel.jsx';
import FuelRequests from './pages/FuelRequests.jsx';
import CarRequests from './pages/CarRequests.jsx';
import CalendarView from './pages/CalendarView.jsx';
import Logbooks from './pages/Logbooks.jsx';
import LogbookEdit from './pages/LogbookEdit.jsx';
import PrintFuelRequest from './pages/PrintFuelRequest.jsx';
import PrintCarRequest from './pages/PrintCarRequest.jsx';
import PrintLogbook from './pages/PrintLogbook.jsx';
import Meta from './pages/Meta.jsx';
import Trash from './pages/Trash.jsx';
import Users from './pages/Users.jsx';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ThemeProvider>
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

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/users"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <Layout>
                    <Users />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/fuel"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Fuel />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/import"
              element={
                <ProtectedRoute roles={['ADMIN', 'LOGISTIQUE']}>
                  <Layout>
                    <ImportExcel />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/requests/fuel"
              element={
                <ProtectedRoute>
                  <Layout>
                    <FuelRequests />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/requests/fuel/manage"
              element={
                <ProtectedRoute roles={['ADMIN', 'LOGISTIQUE']}>
                  <Layout>
                    <FuelRequests />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/requests/fuel/raf"
              element={
                <ProtectedRoute roles={['ADMIN', 'RAF']}>
                  <Layout>
                    <FuelRequests />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/requests/car"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CarRequests />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/requests/car/manage"
              element={
                <ProtectedRoute roles={['ADMIN', 'LOGISTIQUE']}>
                  <Layout>
                    <CarRequests />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/requests/car/raf"
              element={
                <ProtectedRoute roles={['ADMIN', 'RAF']}>
                  <Layout>
                    <CarRequests />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/calendar"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CalendarView />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/meta"
              element={
                <ProtectedRoute roles={['ADMIN', 'LOGISTIQUE']}>
                  <Layout>
                    <Meta />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/trash"
              element={
                <ProtectedRoute roles={['ADMIN', 'LOGISTIQUE']}>
                  <Layout>
                    <Trash />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/logbooks"
              element={
                <ProtectedRoute roles={['ADMIN', 'LOGISTIQUE', 'RAF']}>
                  <Layout>
                    <Logbooks />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/logbooks/:id"
              element={
                <ProtectedRoute roles={['ADMIN', 'LOGISTIQUE', 'RAF']}>
                  <Layout>
                    <LogbookEdit />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </ThemeProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
