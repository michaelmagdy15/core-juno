import React, { useState, useEffect } from 'react';
import {
  Plane,
  Map as MapIcon,
  AlertTriangle,
  Clock,
  Shield,
  ChevronRight,
  Navigation,
  Globe,
  Radio,
  Wind
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SafeFlightsApp = () => {
  const [currentTime, setCurrentTime] = useState(new Date('2026-03-04T15:11:05+02:00'));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(prev => new Date(prev.getTime() + 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const flights = [
    { id: '1', num: 'QP 585', airline: 'Akasa Air', from: 'AUH', to: 'BOM', time: '16:00', type: 'Evacuation', status: 'ON TIME' },
    { id: '2', num: 'EK 001', airline: 'Emirates', from: 'DXB', to: 'LHR', time: '17:30', type: 'Repatriation', status: 'DELAYED' },
    { id: '3', num: 'EY 011', airline: 'Etihad', from: 'AUH', to: 'LHR', time: '18:15', type: 'Active', status: 'ON TIME' },
    { id: '4', num: 'AI 940', airline: 'Air India', from: 'DXB', to: 'DEL', time: '19:45', type: 'Special', status: 'ON TIME' },
    { id: '5', num: '6E 1406', airline: 'IndiGo', from: 'DXB', to: 'BOM', time: '20:10', type: 'Emergency Corridor', status: 'BOARDING' },
    { id: '6', num: 'EK 007', airline: 'Emirates', from: 'DXB', to: 'LHR', time: '21:00', type: 'Repatriation', status: 'SCHEDULED' },
  ];

  const alerts = [
    { title: 'Ordered Departure', text: 'U.S. State Dept. ordered departure for all non-emergency govt. personnel.', priority: 'critical' },
    { title: 'DXB Operations', text: 'Dubai International (DXB) at reduced capacity. Expect structural debris checks.', priority: 'high' },
    { title: 'Air Corridors', text: '48 emergency flights per hour capacity active.', priority: 'normal' },
  ];

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <header className="title-section">
          <h1><Radio className="animate-pulse" /> SafeFlights AI</h1>
        </header>

        <section className="glass-card">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-bold text-secondary uppercase tracking-widest">Local System Time</span>
            <Clock size={16} className="text-cyan-400" />
          </div>
          <div className="time-ticker text-center">
            {currentTime.toLocaleTimeString('en-US', { hour12: false })}
          </div>
          <div className="text-center text-xs text-secondary mt-2">MARCH 04, 2026 | (+02:00)</div>
        </section>

        <section className="glass-card">
          <h2 className="text-sm font-bold mb-4 uppercase flex items-center gap-2">
            <Shield size={16} className="text-red-500" /> Tactical Advisories
          </h2>
          <div className="space-y-4">
            {alerts.map((alert, idx) => (
              <div key={idx} className="alert-item">
                <AlertTriangle size={18} className={`alert-icon ${alert.priority === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                <div>
                  <div className="text-xs font-bold uppercase mb-1">{alert.title}</div>
                  <div className="alert-text">{alert.text}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-auto">
          <button className="w-full py-3 bg-red-900/30 border border-red-500/50 hover:bg-red-900/50 text-red-100 rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center gap-2">
            <Shield size={14} /> Immediate Assistance SOS
          </button>
        </div>
      </aside>

      <main className="main-content">
        <section className="flex justify-between items-end gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Deployment: UAE Evacuation</h2>
            <p className="text-secondary">Monitoring active air corridors and outbound commercial repatriation.</p>
          </div>
          <div className="flex gap-2">
            <div className="status-badge status-emergency">Conflict Zone: High Alert</div>
            <div className="status-badge status-active">Corridor AI: Active</div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="evacuation-map shadow-2xl">
            <div className="absolute top-4 left-4 z-10 bg-slate-900/80 p-2 rounded border border-cyan-500/30 flex items-center gap-2 text-xs font-mono">
              <Globe size={14} className="text-cyan-400" /> LIVE TACTICAL SCAN
            </div>
            <img src="/assets/map.png" alt="Tactical UAE Map" />
            <div className="absolute bottom-4 right-4 z-10 flex gap-2">
              <div className="bg-slate-900/90 text-xs p-2 border border-amber-500/30 text-amber-500">
                Airstrike: DXB Vicinity (Verified)
              </div>
            </div>
          </div>

          <div className="glass-card flex flex-direction-column gap-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-bold uppercase flex items-center gap-2">
                <Navigation size={16} className="text-cyan-400" /> Active Emergency Flights
              </h2>
              <span className="text-[10px] text-cyan-400 font-mono">SCANNING...</span>
            </div>
            <div className="flight-list overflow-y-auto max-h-[400px] pr-2">
              <AnimatePresence>
                {flights.map((flight, idx) => (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    key={flight.id}
                    className="glass-card flight-card"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-cyan-950 rounded-lg">
                        <Plane size={20} className="text-cyan-400" />
                      </div>
                      <div className="flight-info">
                        <h3>{flight.num}</h3>
                        <div className="flight-route">{flight.from} <ChevronRight className="inline" size={12} /> {flight.to}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-secondary">{flight.airline}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${flight.type === 'Evacuation' ? 'border-red-500 text-red-500' : 'border-cyan-500/50 text-cyan-400'
                          }`}>
                          {flight.type}
                        </span>
                        <span className={`text-[10px] font-mono ${flight.status === 'DELAYED' ? 'text-amber-500' : 'text-green-500'
                          }`}>
                          {flight.status}
                        </span>
                        <span className="text-lg font-bold font-mono text-cyan-400">{flight.time}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card border-l-4 border-l-cyan-500">
            <div className="flex items-center gap-3 mb-2">
              <Globe size={20} className="text-cyan-400" />
              <div className="text-sm font-bold uppercase">Safe Hubs</div>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              Muscat (MCT) and Mumbai (BOM) are confirmed hubs with active air bridges. London (LHR) remains restricted for priority citizens.
            </p>
          </div>
          <div className="glass-card border-l-4 border-l-amber-500">
            <div className="flex items-center gap-3 mb-2">
              <Wind size={20} className="text-amber-400" />
              <div className="text-sm font-bold uppercase">Land Routes</div>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              Oman-UAE border crossings (Al Wajajah/Hatta) are operational. Expect high dwell times. Land exit via KSA is restricted to nationals only.
            </p>
          </div>
          <div className="glass-card border-l-4 border-l-red-500">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={20} className="text-red-400" />
              <div className="text-sm font-bold uppercase">Aviation NOTAM</div>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              GPS jamming reported in Dubai airspace. Commercial pilots are following enhanced visual/inertial navigation protocols.
            </p>
          </div>
        </section>
      </main>

      <style>{`
        .justify-between { justify-content: space-between; }
        .items-center { align-items: center; }
        .items-end { align-items: flex-end; }
        .mb-4 { margin-bottom: 1rem; }
        .mb-2 { margin-bottom: 0.5rem; }
        .mt-2 { margin-top: 0.5rem; }
        .mt-auto { margin-top: auto; }
        .space-y-4 > * + * { margin-top: 1rem; }
        .text-center { text-align: center; }
        .text-xs { font-size: 0.75rem; }
        .text-sm { font-size: 0.875rem; }
        .text-lg { font-size: 1.125rem; }
        .text-3xl { font-size: 1.875rem; }
        .font-bold { font-weight: 700; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        .uppercase { text-transform: uppercase; }
        .tracking-widest { letter-spacing: 0.1em; }
        .tracking-tight { letter-spacing: -0.025em; }
        .text-secondary { color: var(--text-secondary); }
        .flex { display: flex; }
        .flex-direction-column { flex-direction: column; }
        .grid { display: grid; }
        .grid-cols-1 { grid-template-columns: minmax(0, 1fr); }
        .w-full { width: 100%; }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      `}</style>
    </div>
  );
};

export default SafeFlightsApp;
