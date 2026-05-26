import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard/Dashboard';
import DistrictDashboard from './pages/DistrictDashboard/DistrictDashboard';

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/district-weekly-dashboard" element={<DistrictDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
