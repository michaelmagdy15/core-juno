import React, { useState, useEffect, useRef } from 'react';
import {
  Plane, AlertCircle, Clock, ShieldAlert, Activity,
  Map as MapIcon, ChevronRight, SignalHigh, PlaySquare, Compass, Search, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import './index.css';

interface FlightState {
  id: string;
  num: string;
  airline: string;
  country: string;
  lon: number;
  lat: number;
  alt: number;
  velocity: number;
  heading: number;
  onGround: boolean;
}

interface FlightDetails {
  Registration?: string;
  Type?: string;
  OperatorFlagCode?: string;
  Manufacturer?: string;
}

// Global Coordinates
const CENTER_LAT = 25.25;
const CENTER_LON = 55.36;

const createPlaneIcon = (heading: number, isSelected: boolean) => {
  const bgColor = isSelected ? '#ef4444' : '#FFD700';
  const html = `
    <div style="transform: rotate(${heading}deg); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.6));">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${bgColor}" stroke="#000000" stroke-width="1">
        <path d="M21,16v-2l-8-5V3.5c0-0.83-0.67-1.5-1.5-1.5S10,2.67,10,3.5V9l-8,5v2l8-2.5V19l-2,1.5V22l3.5-1l3.5,1v-1.5L13,19v-5.5L21,16z"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-plane-icon',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -10]
  });
};

const MapUpdater = ({ flyToLocation }: { flyToLocation: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (flyToLocation) {
      map.flyTo(flyToLocation, 9, { animate: true, duration: 1.5 });
    }
  }, [flyToLocation, map]);
  return null;
};

// Component to track bounding box to fetch only visible aircraft
const MapBoundsFetcher = ({ boundsRef }: { boundsRef: React.MutableRefObject<[number, number, number, number] | null> }) => {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      boundsRef.current = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    }
  });

  useEffect(() => {
    const b = map.getBounds();
    boundsRef.current = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
  }, [map, boundsRef]);

  return null;
};

const SafeFlightsApp = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [flights, setFlights] = useState<FlightState[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<FlightState | null>(null);
  const [flyToLocation, setFlyToLocation] = useState<[number, number] | null>(null);
  const [dataSource, setDataSource] = useState<"OPENSKY" | "ADSB_LOL" | "SYNTHETIC">("OPENSKY");

  const [selectedFlightTrack, setSelectedFlightTrack] = useState<[number, number][]>([]);
  const [selectedFlightDetails, setSelectedFlightDetails] = useState<FlightDetails | null>(null);

  const boundsRef = useRef<[number, number, number, number] | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [liveSearchResults, setLiveSearchResults] = useState<FlightState[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAirportBoard, setSelectedAirportBoard] = useState<{ name: string, lat: number, lon: number } | null>(null);

  // Time ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // API Fetch loop with robust 3-tier fallback
  useEffect(() => {
    let active = true;

    // Synthetic fallback generator
    const generateSyntheticFlights = (b: [number, number, number, number]) => {
      const [lamin, lomin, lamax, lomax] = b;
      const airlines = ['UAE', 'EY', 'FZ', 'G9', 'BAW', 'DLH', 'QFA', 'AFR', 'SIA', 'AIC', 'IGO'];
      const countries = ['UAE', 'UK', 'Germany', 'Australia', 'France', 'Singapore', 'India', 'USA'];
      const newFlights = [];
      const numToGen = Math.min(45, Math.floor(Math.abs((lamax - lamin) * (lomax - lomin)) * 10) + 10);

      for (let i = 0; i < numToGen; i++) {
        const alt = Math.floor(Math.random() * 35000) + 1000; // in feet
        const velocity = Math.floor(Math.random() * 500) + 200; // km/h
        const isGrounded = alt < 3000 && Math.random() > 0.8;
        const airlineCode = airlines[Math.floor(Math.random() * airlines.length)];

        newFlights.push({
          id: `SYN-${Math.random().toString(36).substr(2, 6)}`,
          num: `${airlineCode}${Math.floor(Math.random() * 900) + 100}`,
          country: countries[Math.floor(Math.random() * countries.length)],
          airline: airlineCode,
          lon: lomin + Math.random() * (lomax - lomin),
          lat: lamin + Math.random() * (lamax - lamin),
          alt: isGrounded ? 0 : alt,
          velocity: isGrounded ? 0 : velocity,
          heading: Math.floor(Math.random() * 360),
          onGround: isGrounded
        });
      }
      return newFlights;
    };

    const fetchFlights = async () => {
      if (!boundsRef.current) return;
      setIsScanning(true);
      const b = boundsRef.current;
      const [lamin, lomin, lamax, lomax] = b;

      try {
        // TIER 1: Primary OpenSky API
        const res = await fetch(`https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`);

        if (res.ok) {
          const data = await res.json();
          if (!active) return;
          if (data.states) {
            const parsed = data.states.map((state: any) => ({
              id: state[0],
              num: state[1] ? state[1].trim() : "UNKNOWN",
              country: state[2],
              airline: (state[1] ? state[1].trim() : "Private").substring(0, 3),
              lon: state[5],
              lat: state[6],
              alt: Math.round((state[7] || 0) * 3.28084), // meters to feet
              onGround: state[8],
              velocity: Math.round((state[9] || 0) * 3.6), // m/s to km/h
              heading: Math.round(state[10] || 0)
            })).filter((f: FlightState) => f.lat && f.lon);
            setFlights(parsed);
            setDataSource("OPENSKY");
            setIsScanning(false);
            return;
          }
        }
        throw new Error(`OpenSky failed with status: ${res.status}`);
      } catch (err) {
        console.warn("Primary API failed. Engaging Fallback TIER 2 (ADSB.lol)...");

        try {
          // TIER 2: Secondary ADSB.lol API
          const centerLat = (lamin + lamax) / 2;
          const centerLon = (lomin + lomax) / 2;
          const radiusNm = Math.min(250, Math.max(Math.abs(lamax - lamin) * 60, Math.abs(lomax - lomin) * 60));

          const res2 = await fetch(`https://api.adsb.lol/v2/lat/${centerLat.toFixed(3)}/lon/${centerLon.toFixed(3)}/dist/${Math.ceil(radiusNm)}`);
          if (res2.ok) {
            const data2 = await res2.json();
            if (!active) return;
            if (data2.ac) {
              const parsed2 = data2.ac.map((ac: any) => ({
                id: ac.hex,
                num: ac.flight ? ac.flight.trim() : "UNKNOWN",
                country: ac.r || "Unknown",
                airline: (ac.flight ? ac.flight.trim() : "Private").substring(0, 3),
                lon: ac.lon,
                lat: ac.lat,
                alt: ac.alt_baro === "ground" ? 0 : (ac.alt_baro || 0),
                onGround: ac.alt_baro === "ground",
                velocity: Math.round((ac.gs || 0) * 1.852), // knots to km/h
                heading: Math.round(ac.track || ac.tru || ac.mag || 0)
              })).filter((f: FlightState) => f.lat && f.lon);

              // Filter to actual bounding box just in case
              const bounded = parsed2.filter((f: FlightState) => f.lat >= lamin && f.lat <= lamax && f.lon >= lomin && f.lon <= lomax);

              setFlights(bounded);
              setDataSource("ADSB_LOL");
              setIsScanning(false);
              return;
            }
          }
          throw new Error("ADSB.lol failed as well.");
        } catch (err2) {
          console.warn("Secondary API failed. Engaging TIER 3 Synthetic Subroutine...");

          // TIER 3: Synthetic Physics Engine (Never Fail)
          if (!active) return;
          setFlights(prev => {
            if (prev.length > 0 && prev[0].id.startsWith('SYN')) {
              // Update physics ticks for existing synthetic flight
              return prev.map(f => {
                if (f.onGround) return f;
                const distanceMeters = (f.velocity * 1000 / 3600) * 10; // distance over 10s tick
                const latDelta = (distanceMeters * Math.cos(f.heading * (Math.PI / 180))) / 111000;
                const lonDelta = (distanceMeters * Math.sin(f.heading * (Math.PI / 180))) / (111000 * Math.cos(f.lat * (Math.PI / 180)));
                return { ...f, lat: f.lat + latDelta, lon: f.lon + lonDelta };
              }).filter((f: FlightState) => f.lat >= Math.min(lamin, lamax) && f.lat <= Math.max(lamin, lamax) && f.lon >= Math.min(lomin, lomax) && f.lon <= Math.max(lomin, lomax));
            } else {
              // Generate fresh batch
              return generateSyntheticFlights(b);
            }
          });
          setDataSource("SYNTHETIC");
          setIsScanning(false);
        }
      }
    };

    fetchFlights();
    const interval = setInterval(fetchFlights, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Fetch track line & hexdb details for selected flight
  useEffect(() => {
    if (!selectedFlight) {
      setSelectedFlightTrack([]);
      setSelectedFlightDetails(null);
      return;
    }

    // Fetch Aircraft HexDB Details (Type, Reg, Logo)
    const fetchDetails = async () => {
      try {
        const res = await fetch(`https://hexdb.io/api/v1/aircraft/${selectedFlight.id}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedFlightDetails(data);
        }
      } catch (err) {
        console.error("HexDB API Error: ", err);
      }
    };

    // Fetch Historical Track with Fallback
    const fetchTrack = async () => {
      try {
        const res = await fetch(`https://opensky-network.org/api/tracks/all?icao24=${selectedFlight.id}&time=0`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.path) {
            const trackPositions: [number, number][] = data.path.map((p: any) => [p[1], p[2]]);
            setSelectedFlightTrack([...trackPositions, [selectedFlight.lat, selectedFlight.lon]]);
            return;
          }
        }
        throw new Error("OpenSky Track fallback triggered");
      } catch (err) {
        try {
          // Fallback to ADSB.lol trace
          const res2 = await fetch(`https://api.adsb.lol/v2/trace/${selectedFlight.id}`);
          if (res2.ok) {
            const data2 = await res2.json();
            if (data2 && data2.trace) {
              const trackPositions: [number, number][] = data2.trace.map((p: any) => [p[1], p[2]]);
              setSelectedFlightTrack([...trackPositions, [selectedFlight.lat, selectedFlight.lon]]);
              return;
            }
          }
        } catch (fallbackErr) {
          console.error("Track API Fallbacks exhausted: ", fallbackErr);
        }
        // If everything fails, default to plotting nothing
        setSelectedFlightTrack([]);
      }
    };

    fetchDetails();
    fetchTrack();
  }, [selectedFlight]);

  // Live Flight Local Search
  useEffect(() => {
    if (!searchQuery) {
      setLiveSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = flights.filter(f =>
      f.num.toLowerCase().includes(q) ||
      f.airline.toLowerCase().includes(q) ||
      f.country.toLowerCase().includes(q)
    ).slice(0, 5);
    setLiveSearchResults(matches);
  }, [searchQuery, flights]);

  // Handle Airport Searching
  const handleAirportSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}+airport&format=json&limit=5`);
      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      console.error("Search API Error: ", err);
    }
    setIsSearching(false);
  };

  const flyToAirportResult = (lat: string, lon: string, name: string) => {
    const plat = parseFloat(lat);
    const plon = parseFloat(lon);
    setFlyToLocation([plat, plon]);
    setSelectedAirportBoard({ name: name.split(',')[0], lat: plat, lon: plon });
    setSelectedFlight(null);
    setSearchResults([]);
    setSearchQuery("");
  };

  const handleFlightSelect = (flight: FlightState) => {
    setSelectedFlight(flight);
    setSelectedAirportBoard(null);
    setFlyToLocation([flight.lat, flight.lon]);
    setSearchResults([]);
    setLiveSearchResults([]);
    setSearchQuery("");
  };

  // Generate Synthetic Board
  const getTerminalSchedule = React.useCallback((airportName: string) => {
    const airlines = ['EK', 'FZ', 'BA', 'LH', 'AF', 'SQ', 'QR', 'AA', 'UA', 'DL'];
    const cities = ['London', 'New York', 'Paris', 'Tokyo', 'Singapore', 'Mumbai', 'Frankfurt', 'Sydney', 'Cairo', 'Istanbul', 'Beijing'];
    // Use a pseudo-random seed based on name length to keep it somewhat stable during render
    let seed = airportName.length;
    const random = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    const s = [];
    const now = new Date();
    for (let i = 0; i < 15; i++) {
      const isArr = random() > 0.5;
      const time = new Date(now.getTime() + (random() * 86400000) - 43200000); // within +/- 12 hrs
      s.push({
        id: i,
        timeObj: time,
        time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        flight: airlines[Math.floor(random() * airlines.length)] + Math.floor(random() * 900 + 100),
        city: cities[Math.floor(random() * cities.length)],
        type: isArr ? "Arrival" : "Departure",
        status: random() > 0.85 ? "Delayed" : "On Time"
      });
    }
    return s.sort((a, b) => a.timeObj.getTime() - b.timeObj.getTime());
  }, []);

  return (
    <div className="app-layout">
      {/* Top Navigation */}
      <nav className="top-nav">
        <div className="brand">
          <ShieldAlert className="brand-icon" size={24} />
          SafeFlights Global | Tracking Radar
        </div>

        {/* Full-World Airport Search Bar */}
        <form onSubmit={handleAirportSearch} style={{ position: 'relative', flex: 1, maxWidth: '500px', margin: '0 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-focus)', borderRadius: '6px', padding: '0.4rem 0.8rem' }}>
            <Search size={16} color="var(--text-muted)" style={{ marginRight: '0.5rem' }} />
            <input
              type="text"
              placeholder="Search Aircraft Call-sign, Airline, or Airport..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ backgroundColor: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none', fontSize: '0.85rem' }}
            />
            {searchQuery && (
              <X size={16} color="var(--text-muted)" style={{ cursor: 'pointer' }} onClick={() => { setSearchQuery(""); setSearchResults([]); setLiveSearchResults([]); }} />
            )}
          </div>

          {/* Dropdown Results */}
          {(searchResults.length > 0 || liveSearchResults.length > 0) && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '0.5rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-focus)', borderRadius: '6px', zIndex: 2000, overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>

              {liveSearchResults.length > 0 && (
                <div>
                  <div style={{ padding: '0.5rem 1rem', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-blue)', backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>Live Aircraft In View</div>
                  {liveSearchResults.map(flight => (
                    <div
                      key={flight.id}
                      onClick={() => handleFlightSelect(flight)}
                      style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                      className="search-result-hover"
                    >
                      <Plane size={14} color="var(--text-muted)" />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{flight.num} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.7rem' }}>({flight.airline})</span></div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{flight.velocity} km/h • {flight.alt} ft</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.length > 0 && (
                <div>
                  <div style={{ padding: '0.5rem 1rem', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-orange)', backgroundColor: 'rgba(249, 115, 22, 0.1)' }}>Airports & Locations</div>
                  {searchResults.map((res: any) => (
                    <div
                      key={res.place_id}
                      onClick={() => flyToAirportResult(res.lat, res.lon, res.display_name)}
                      style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                      className="search-result-hover"
                    >
                      <MapIcon size={14} color="var(--text-muted)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.display_name.split(',')[0]}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.display_name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        <div className="nav-metrics">
          <div className="metric-pill">
            <Clock size={14} />
            {currentTime.toISOString().split('T')[1].substring(0, 8)} UTC
          </div>
          <div className="metric-pill" style={{ color: dataSource === 'OPENSKY' ? 'var(--color-green)' : dataSource === 'ADSB_LOL' ? 'var(--color-orange)' : 'var(--color-red)' }}>
            DATA: {dataSource}
          </div>
          <div className={`metric-pill ${isScanning ? 'scanning' : ''}`}>
            {isScanning ? <Activity size={14} /> : <SignalHigh size={14} />}
            {isScanning ? 'SCANNING' : 'ONLINE'}
          </div>
        </div>
      </nav>

      {/* Main Workspace */}
      <main className="main-workspace">

        {/* Left Side Panel */}
        <aside className="side-panel">
          {selectedAirportBoard ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-section" style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="panel-title" style={{ margin: 0 }}>
                  <MapIcon size={14} />
                  Terminal Schedule
                </div>
                <X size={16} color="var(--text-muted)" style={{ cursor: 'pointer' }} onClick={() => setSelectedAirportBoard(null)} />
              </div>
              <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)', fontSize: '1.2rem' }}>{selectedAirportBoard.name}</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '1.5rem', fontFamily: 'monospace' }}>
                  LAT: {selectedAirportBoard.lat.toFixed(4)} • LON: {selectedAirportBoard.lon.toFixed(4)}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'min-content 1fr', gap: '1rem' }}>
                  {getTerminalSchedule(selectedAirportBoard.name).map((s) => (
                    <React.Fragment key={s.id}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, paddingTop: '0.2rem' }}>{s.time}</div>
                      <div style={{ borderBottom: '1px solid var(--border-focus)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.2rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-blue)', fontFamily: 'monospace', fontSize: '0.9rem' }}>{s.flight}</span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', color: s.type === 'Arrival' ? 'var(--color-orange)' : 'var(--color-green)' }}>{s.type}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginBottom: '0.3rem' }}>{s.type === 'Arrival' ? 'From' : 'To'} {s.city}</div>
                        <div style={{ fontSize: '0.7rem', color: s.status === 'Delayed' ? 'var(--color-red)' : 'var(--text-muted)' }}>{s.status}</div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="panel-section" style={{ paddingBottom: 0, borderBottom: 'none' }}>
                <div className="panel-title">
                  <Plane size={14} />
                  Radar Feed ({flights.length})
                </div>
              </div>

              <div className="flight-feed">
                <AnimatePresence>
                  {flights.length === 0 && (
                    <div className="flight-empty">
                      <Activity size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                      {isScanning ? 'Scanning Airspace...' : 'No Aircraft in View'}
                    </div>
                  )}

                  {flights.map((flight) => {
                    const isActive = selectedFlight?.id === flight.id;
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={flight.id}
                        className="flight-card"
                        style={{ borderColor: isActive ? 'var(--color-blue)' : '' }}
                        onClick={() => handleFlightSelect(flight)}
                      >
                        <div className="fc-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {/* If it's the active card we show the logo if we have it, else fallback */}
                            {isActive && selectedFlightDetails?.OperatorFlagCode ? (
                              <img
                                src={`https://pics.avs.io/200/200/${selectedFlightDetails.OperatorFlagCode}.png`}
                                alt="Logo"
                                style={{ width: '32px', height: '32px', objectFit: 'contain', backgroundColor: '#fff', borderRadius: '4px', padding: '2px' }}
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <div style={{ width: '32px', height: '32px', backgroundColor: 'var(--bg-base)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Plane size={16} />
                              </div>
                            )}

                            <div>
                              <div className="fc-ident">{flight.num}</div>
                              <div className="fc-airline">
                                {isActive && selectedFlightDetails ? `${selectedFlightDetails.Type || ''} (${selectedFlightDetails.Registration || flight.id})` : flight.country}
                              </div>
                            </div>
                          </div>
                          <div className={`fc-status ${flight.onGround ? 'grounded' : ''}`}>
                            {flight.onGround ? 'Grounded' : 'Airborne'}
                          </div>
                        </div>

                        <div className="fc-metrics">
                          <div className="fc-metric-group">
                            <span className="fc-metric-label">Altitude</span>
                            <span className="fc-metric-value">
                              {flight.onGround ? '0' : flight.alt} ft
                            </span>
                          </div>
                          <div className="fc-metric-group">
                            <span className="fc-metric-label">Speed</span>
                            <span className="fc-metric-value">
                              {flight.velocity} km/h
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </>
          )}
        </aside>          {/* Live Map Area */}
        <section className="map-container">
          <MapContainer
            center={[CENTER_LAT, CENTER_LON]}
            zoom={6}
            zoomControl={false}
            style={{ width: '100%', height: '100%' }}
          >
            <MapBoundsFetcher boundsRef={boundsRef} />
            <MapUpdater flyToLocation={flyToLocation} />

            <TileLayer
              attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {selectedFlightTrack.length > 0 && (
              <Polyline
                positions={selectedFlightTrack}
                pathOptions={{ color: '#ef4444', weight: 4, opacity: 0.7 }}
              />
            )}

            {flights.map(flight => (
              <Marker
                key={flight.id}
                position={[flight.lat, flight.lon]}
                icon={createPlaneIcon(flight.heading, flight.id === selectedFlight?.id)}
                eventHandlers={{
                  click: () => handleFlightSelect(flight)
                }}
              >
                <Popup className="tactical-popup border border-zinc-700 rounded-md !bg-zinc-900 !text-zinc-100 p-0 shadow-xl overflow-hidden drop-shadow-lg" closeButton={false}>
                  <div className="p-3 min-w-[240px] font-sans">
                    <div className="flex gap-3 items-center mb-3 pb-3 border-b border-zinc-800">
                      <div className="bg-white rounded p-0.5 overflow-hidden flex items-center justify-center" style={{ width: '48px', height: '48px' }}>
                        <img
                          src={`https://pics.avs.io/200/200/${selectedFlightDetails?.OperatorFlagCode || flight.airline}.png`}
                          alt="Logo"
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                      <div>
                        <h3 className="font-mono font-bold text-xl text-blue-400 m-0 leading-none">{flight.num}</h3>
                        <div className="text-[10px] text-zinc-400 mt-1 uppercase tracking-wide">
                          {selectedFlightDetails?.Type || 'Aircraft Type Unknown'}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono tracking-wide">
                          REG: {selectedFlightDetails?.Registration || flight.id.toUpperCase()}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 font-mono text-xs">
                      <div>
                        <div className="text-zinc-500 uppercase text-[9px] mb-1">True Trk</div>
                        <div className="text-zinc-100 flex items-center gap-1">
                          <Compass size={12} className="text-zinc-400" />
                          {flight.heading}°
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500 uppercase text-[9px] mb-1">Gnd Speed</div>
                        <div className="text-zinc-100">{flight.velocity} km/h</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 uppercase text-[9px] mb-1">Baro Alt</div>
                        <div className="text-green-400">{flight.alt} ft</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 uppercase text-[9px] mb-1">Fl. Status</div>
                        <div className={flight.onGround ? "text-orange-400" : "text-blue-400"}>
                          {flight.onGround ? "GROUNDED" : "AIRBORNE"}
                        </div>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </section>

      </main>

      <style>{`
        .search-result-hover:hover {
          background-color: var(--border-focus);
        }
      `}</style>
    </div>
  );
};

export default SafeFlightsApp;
