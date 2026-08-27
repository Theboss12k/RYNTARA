import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import AddVehiclePage from './components/AddVehiclePage';
import ManageFleetPage from './components/ManageFleetPage';
import { ThemeProvider } from './context/ThemeContext';
import VehicleHistoryPage from './components/VehicleHistoryPage';
import AdapterStudioPage from './components/AdapterStudioPage';
import PathPlannerPage from './components/PathPlannerPage';
import './App.css';
import 'maplibre-gl/dist/maplibre-gl.css';
export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <Routes>
        <Route path="/vehicle/:id" element={<VehicleHistoryPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/add-vehicle" element={<AddVehiclePage />} />
          <Route path="/manage" element={<ManageFleetPage />} />
          <Route path="/studio" element={<AdapterStudioPage />} />
          <Route path="/plan" element={<PathPlannerPage />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}