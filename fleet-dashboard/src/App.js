import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import AddVehiclePage from './components/AddVehiclePage';
import ManageFleetPage from './components/ManageFleetPage';
import { ThemeProvider } from './context/ThemeContext';
import VehicleHistoryPage from './components/VehicleHistoryPage';
import './App.css';

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <Routes>
        <Route path="/vehicle/:id" element={<VehicleHistoryPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/add-vehicle" element={<AddVehiclePage />} />
          <Route path="/manage" element={<ManageFleetPage />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}