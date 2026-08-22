import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const navigate = useNavigate();

  const tileStyle = {
    background: '#111',
    border: '1px solid #333',
    borderRadius: '16px',
    padding: '40px',
    width: '250px',
    cursor: 'pointer',
    textAlign: 'center',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#050505', color: '#fff', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontWeight: '500', letterSpacing: '-1px', marginBottom: '10px' }}>Fleet Orchestrator</h1>
      <p style={{ color: '#888', marginBottom: '50px' }}>Enterprise Robotics Management Suite</p>
      
      <div style={{ display: 'flex', gap: '30px' }}>
        <div style={tileStyle} onClick={() => navigate('/add-vehicle')}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>+ Add Vehicle</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>Register a new UAV or Ground Rover.</p>
        </div>

        <div style={tileStyle} onClick={() => navigate('/manage')}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>Manage Fleet</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>Enter live telemetry and control map.</p>
        </div>
      </div>
    </div>
  );
}