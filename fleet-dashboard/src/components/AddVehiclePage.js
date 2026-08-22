import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function AddVehiclePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UAV");

  const handleSubmit = (e) => {
    e.preventDefault();
    fetch('http://localhost:8080/api/fleet/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category })
    })
    .then(res => res.json())
    .then(() => navigate('/manage'))
    .catch(err => console.error("Error adding vehicle:", err));
  };

  return (
    <div className="fleet-shell page-enter" style={{ justifyContent: 'center', alignItems: 'center', display: 'flex', height: '100vh', background: 'var(--app-bg, #050505)' }}>
      <div style={{ width: '100%', maxWidth: '420px', padding: '30px', background: '#111', border: '1px solid #222', borderRadius: '16px', boxSizing: 'border-box' }}>
        <button type="button" className="link-back" onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px', padding: 0, fontSize: '13px' }}>
          <ArrowLeft size={14} strokeWidth={2} />
          Back to Portal
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontWeight: '500', fontSize: '20px', color: '#fff' }}>Register Vehicle</h2>
          <ThemeToggle />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Vehicle Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Recon Drone Beta"
              required
              style={{ width: '100%', padding: '12px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '8px', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: '12px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '8px', boxSizing: 'border-box', outline: 'none' }}
            >
              <option value="UAV">UAV (Aerial Drone)</option>
              <option value="GROUND">GROUND (Rover)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button type="button" onClick={() => navigate('/')} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#fff', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" style={{ flex: 1, padding: '12px', background: '#fff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Register</button>
          </div>
        </form>
      </div>
    </div>
  );
}