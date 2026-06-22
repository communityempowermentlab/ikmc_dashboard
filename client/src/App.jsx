import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Dashboard from './pages/Dashboard/Dashboard';
import DistrictDashboard from './pages/DistrictDashboard/DistrictDashboard';
import LoginOverlay from './components/auth/LoginOverlay';

function App() {
  const { isAuthenticated } = useSelector((state) => state.auth);

  return (
    <div className="app-container">
      <Router basename={import.meta.env.BASE_URL}>
        <div className={!isAuthenticated ? 'dashboard-blurred' : ''}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/district-weekly-dashboard" element={<DistrictDashboard />} />
          </Routes>
        </div>
        {!isAuthenticated && <LoginOverlay />}
      </Router>
    </div>
  );
}

export default App;
