import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import VerifyEmail from './components/VerifyEmail';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Projects from './components/Projects';
import ProjectDetails from './components/ProjectDetails';
import ProjectSales from './components/ProjectSales';
import Suppliers from './components/Suppliers'; // New import
import InvoicePreviewA3Page from './components/InvoicePreviewA3Page';
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/" />;
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-blue-50">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route
            path="/dashboard/*"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          >
            {/* Nested routes under /dashboard */}
            <Route
              path="projects"
              element={
                <PrivateRoute>
                  <Projects />
                </PrivateRoute>
              }
            />
            <Route
              path="projects/:id"
              element={
                <PrivateRoute>
                  <ProjectDetails />
                </PrivateRoute>
              }
            />
            <Route
              path="project-sales/:projectId"
              element={
                <PrivateRoute>
                  <ProjectSales />
                </PrivateRoute>
              }
            />
            <Route
              path="suppliers" // New route
              element={
                <PrivateRoute>
                  <Suppliers />
                </PrivateRoute>
              }
            />
          </Route>
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <Settings />
              </PrivateRoute>
            }
          />
          <Route
            path="/invoice-preview-a3"
            element={
              <PrivateRoute>
                <InvoicePreviewA3Page />
              </PrivateRoute>
            }
          />
          {/* Redirect /projects to /dashboard/projects if accessed directly */}
          <Route path="/projects" element={<Navigate to="/dashboard/projects" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;