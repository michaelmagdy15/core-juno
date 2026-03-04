import React, { useState, useEffect, useRef } from 'react';
import {
  Plane, AlertCircle, Clock, ShieldAlert, Activity,
  Map as MapIcon, SignalHigh, Compass, Search, X,
  History, ThermometerSun, AlertTriangle, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import GlobeComponent from 'react-globe.gl';
import { booleanPointInPolygon, point, polygon } from '@turf/turf';
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
  squawk?: string;
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

// GeoFence Polygons
const THREAT_ZONES = [
  {
    name: "Ukraine Airspace",
    color: "#ef4444",
    coords: [[52.0, 23.0], [52.0, 40.0], [44.0, 40.0], [44.0, 29.0], [48.0, 22.0]] as [number, number][]
  },
  {
    name: "Sudan Conflict Zone",
    color: "#ef4444",
    coords: [[22.0, 24.0], [22.0, 37.0], [9.0, 37.0], [9.0, 23.0]] as [number, number][]
  },
  {
    name: "Middle East Red Zone",
    color: "#f97316",
    coords: [[38.0, 42.0], [38.0, 62.0], [25.0, 62.0], [12.0, 52.0], [12.0, 42.0], [30.0, 38.0]] as [number, number][]
  }
];

const getHeatmapColor = (altitudeFt: number) => {
  if (altitudeFt < 5000) return '#ef4444'; // Red (Low)
  if (altitudeFt < 15000) return '#f97316'; // Orange
  if (altitudeFt < 25000) return '#eab308'; // Yellow
  if (altitudeFt < 35000) return '#22c55e'; // Green
  return '#3b82f6'; // Blue (Cruising)
};

const createPlaneIcon = (heading: number, isSelected: boolean, altitudeFt: number, isHeatmap: boolean, squawk?: string) => {
  const isEmergency = squawk === '7700' || squawk === '7600' || squawk === '7500';
  let bgColor = '#FFD700'; // Default Yellow

  if (isEmergency) bgColor = '#ff0000';
  else if (isSelected) bgColor = '#ffffff';
  else if (isHeatmap) bgColor = getHeatmapColor(altitudeFt);

  const filter = isEmergency ? 'drop-shadow(0 0 8px rgba(255,0,0,0.8))' : 'drop-shadow(0px 2px 3px rgba(0,0,0,0.6))';
  const size = isSelected ? 32 : 28;

  const html = `
    <div style="transform: rotate(${heading}deg); width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; filter: ${filter};">
      <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="${bgColor}" stroke="#000000" stroke-width="1">
        <path d="M21,16v-2l-8-5V3.5c0-0.83-0.67-1.5-1.5-1.5S10,2.67,10,3.5V9l-8,5v2l8-2.5V19l-2,1.5V22l3.5-1l3.5,1v-1.5L13,19v-5.5L21,16z"/>
      </svg>
    </div>
  `;
  return L.divIcon({ html, className: 'custom-plane-icon', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -10] });
};

const MapUpdater = ({ flyToLocation }: { flyToLocation: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => { if (flyToLocation) map.flyTo(flyToLocation, 7, { animate: true, duration: 1.5 }); }, [flyToLocation, map]);
  return null;
};

const MapBoundsFetcher = ({ boundsRef }: { boundsRef: React.MutableRefObject<[number, number, number, number] | null> }) => {
  const map = useMapEvents({ moveend: () => { const b = map.getBounds(); boundsRef.current = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]; } });
  useEffect(() => { const b = map.getBounds(); boundsRef.current = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]; }, [map, boundsRef]);
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

  // Search & UI Features State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [liveSearchResults, setLiveSearchResults] = useState<FlightState[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAirportBoard, setSelectedAirportBoard] = useState<{ name: string, lat: number, lon: number } | null>(null);

  // Pro Features State
  const [timeOffset, setTimeOffset] = useState(0); // 0 = Live, -24 to -1 hours
  const [isHeatmap, setIsHeatmap] = useState(false);
  const [viewMode, setViewMode] = useState<"2D" | "3D">("2D");
  const [emergencies, setEmergencies] = useState<FlightState[]>([]);
  const [geofenceAlerts, setGeofenceAlerts] = useState<{ flight: string, zone: string }[]>([]);

  // Time ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date(Date.now() + timeOffset * 3600000)), 1000);
    return () => clearInterval(timer);
  }, [timeOffset]);

  // Main Tracking Loop
  useEffect(() => {
    let active = true;

    const generateSyntheticFlights = (b: [number, number, number, number]) => {
      const [lamin, lomin, lamax, lomax] = b;
      const airlines = ['UAE', 'EY', 'FZ', 'G9', 'BAW', 'DLH', 'QFA', 'AFR', 'SIA', 'AIC', 'IGO'];
      const countries = ['UAE', 'UK', 'Germany', 'Australia', 'France', 'Singapore', 'India', 'USA'];
      const newFlights = [];
      const numToGen = Math.min(80, Math.floor(Math.abs((lamax - lamin) * (lomax - lomin)) * 10) + 10);

      for (let i = 0; i < numToGen; i++) {
        const alt = Math.floor(Math.random() * 35000) + 1000;
        const velocity = Math.floor(Math.random() * 500) + 200;
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
          onGround: isGrounded,
          squawk: Math.random() > 0.99 ? "7700" : "1000" // Rare synthetic emergency 
        });
      }
      return newFlights;
    };

    const fetchFlights = async () => {
      if (!boundsRef.current || viewMode === "3D") return;
      setIsScanning(true);
      const b = boundsRef.current;
      const [lamin, lomin, lamax, lomax] = b;

      try {
        let url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
        if (timeOffset < 0) {
          const targetTime = Math.floor(Date.now() / 1000) + (timeOffset * 3600);
          url += `&time=${targetTime}`;
        }

        const res = await fetch(url);

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
              alt: Math.round((state[7] || 0) * 3.28084),
              onGround: state[8],
              velocity: Math.round((state[9] || 0) * 3.6),
              heading: Math.round(state[10] || 0),
              squawk: state[14]
            })).filter((f: FlightState) => f.lat && f.lon);
            setFlights(parsed);
            setDataSource("OPENSKY");
            setIsScanning(false);
            processAlerts(parsed);
            return;
          }
        }
        throw new Error(`OpenSky status: ${res.status}`);
      } catch (err) {
        if (timeOffset < 0) {
          // APIs don't easily do historic radius without auth, jump to synthetic
          handleSyntheticFallback(b);
          return;
        }

        try {
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
                velocity: Math.round((ac.gs || 0) * 1.852),
                heading: Math.round(ac.track || ac.tru || ac.mag || 0),
                squawk: ac.squawk
              })).filter((f: FlightState) => f.lat && f.lon);

              const bounded = parsed2.filter((f: FlightState) => f.lat >= lamin && f.lat <= lamax && f.lon >= lomin && f.lon <= lomax);
              setFlights(bounded);
              setDataSource("ADSB_LOL");
              setIsScanning(false);
              processAlerts(bounded);
              return;
            }
          }
          throw new Error("ADSB.lol failed.");
        } catch (err2) {
          handleSyntheticFallback(b);
        }
      }
    };

    const handleSyntheticFallback = (b: [number, number, number, number]) => {
      const [lamin, lomin, lamax, lomax] = b;
      if (!active) return;
      setFlights(prev => {
        let nextFlights = [];
        if (prev.length > 0 && prev[0].id.startsWith('SYN')) {
          nextFlights = prev.map(f => {
            if (f.onGround) return f;
            const distanceMeters = (f.velocity * 1000 / 3600) * 10;
            const latDelta = (distanceMeters * Math.cos(f.heading * (Math.PI / 180))) / 111000;
            const lonDelta = (distanceMeters * Math.sin(f.heading * (Math.PI / 180))) / (111000 * Math.cos(f.lat * (Math.PI / 180)));
            return { ...f, lat: f.lat + latDelta, lon: f.lon + lonDelta };
          });
        } else {
          nextFlights = generateSyntheticFlights(b);
        }
        processAlerts(nextFlights);
        return nextFlights;
      });
      setDataSource("SYNTHETIC");
      setIsScanning(false);
    };

    const processAlerts = (activeFlights: FlightState[]) => {
      // Squawk Checks
      const emergenciesActive = activeFlights.filter(f => f.squawk === '7700' || f.squawk === '7600' || f.squawk === '7500');
      setEmergencies(emergenciesActive);

      // GeoFence Checks
      const geoViolations: { flight: string, zone: string }[] = [];
      activeFlights.forEach(f => {
        if (!f.lon || !f.lat) return;
        const pt = point([f.lon, f.lat]);
        THREAT_ZONES.forEach(zone => {
          // Turf requires longitude, latitude ordering and closed linear rings
          const coords = [...zone.coords, zone.coords[0]].map(c => [c[1], c[0]]);
          const poly = polygon([coords]);
          if (booleanPointInPolygon(pt, poly)) {
            geoViolations.push({ flight: f.num, zone: zone.name });
          }
        });
      });
      setGeofenceAlerts(geoViolations);
    };

    fetchFlights();
    const interval = setInterval(fetchFlights, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [timeOffset, viewMode]);

  useEffect(() => {
    if (!selectedFlight) {
      setSelectedFlightTrack([]);
      setSelectedFlightDetails(null);
      return;
    }

    const fetchDetails = async () => {
      try {
        const res = await fetch(`https://hexdb.io/api/v1/aircraft/${selectedFlight.id}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedFlightDetails(data);
        }
      } catch (err) { }
    };

    const fetchTrack = async () => {
      try {
        const url = timeOffset < 0
          ? `https://opensky-network.org/api/tracks/all?icao24=${selectedFlight.id}&time=${Math.floor(Date.now() / 1000) + (timeOffset * 3600)}`
          : `https://opensky-network.org/api/tracks/all?icao24=${selectedFlight.id}&time=0`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data && data.path) {
            const trackPositions: [number, number][] = data.path.map((p: any) => [p[1], p[2]]);
            setSelectedFlightTrack([...trackPositions, [selectedFlight.lat, selectedFlight.lon]]);
            return;
          }
        }
        throw new Error("OpenSky Track fallback");
      } catch (err) {
        if (timeOffset === 0) {
          try {
            const res2 = await fetch(`https://api.adsb.lol/v2/trace/${selectedFlight.id}`);
            if (res2.ok) {
              const data2 = await res2.json();
              if (data2 && data2.trace) {
                const trackPositions: [number, number][] = data2.trace.map((p: any) => [p[1], p[2]]);
                setSelectedFlightTrack([...trackPositions, [selectedFlight.lat, selectedFlight.lon]]);
                return;
              }
            }
          } catch (e) { }
        }
        setSelectedFlightTrack([]);
      }
    };

    fetchDetails();
    fetchTrack();
  }, [selectedFlight, timeOffset]);

  const handleAirportSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}+airport&format=json&limit=5`);
      const data = await response.json();
      setSearchResults(data);
    } catch (err) { }
    setIsSearching(false);
  };

  const flyToAirportResult = (lat: string, lon: string, name: string) => {
    setViewMode("2D");
    setFlyToLocation([parseFloat(lat), parseFloat(lon)]);
    setSelectedAirportBoard({ name: name.split(',')[0], lat: parseFloat(lat), lon: parseFloat(lon) });
    setSearchResults([]);
    setSearchQuery("");
  };

  const handleFlightSelect = (flight: FlightState) => {
    setViewMode("2D");
    setSelectedFlight(flight);
    setSelectedAirportBoard(null);
    setFlyToLocation([flight.lat, flight.lon]);
    setSearchResults([]);
    setLiveSearchResults([]);
    setSearchQuery("");
  };

  const getTerminalSchedule = React.useCallback((airportName: string) => {
    const airlines = ['EK', 'FZ', 'BA', 'LH', 'AF', 'SQ', 'QR', 'AA', 'UA', 'DL'];
    const cities = ['London', 'New York', 'Paris', 'Tokyo', 'Singapore', 'Mumbai', 'Frankfurt', 'Sydney', 'Cairo', 'Istanbul', 'Beijing'];
    let seed = airportName.length;
    const random = () => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };
    const s = [];
    const now = new Date();
    for (let i = 0; i < 15; i++) {
      const isArr = random() > 0.5;
      const time = new Date(now.getTime() + (random() * 86400000) - 43200000);
      s.push({
        id: i, timeObj: time, time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        flight: airlines[Math.floor(random() * airlines.length)] + Math.floor(random() * 900 + 100),
        city: cities[Math.floor(random() * cities.length)], type: isArr ? "Arrival" : "Departure", status: random() > 0.85 ? "Delayed" : "On Time"
      });
    }
    return s.sort((a, b) => a.timeObj.getTime() - b.timeObj.getTime());
  }, []);

  return (
    <div className="app-layout flex flex-col h-screen overflow-hidden">
      {/* Top Navigation */}
      <nav className={`top-nav flex items-center px-6 py-3 border-b ${emergencies.length > 0 ? 'bg-red-950/40 border-red-500/50' : 'bg-zinc-950 border-zinc-800'} transition-colors duration-500 z-50`}>
        <div className="brand flex items-center gap-3 text-lg font-bold">
          <ShieldAlert className={emergencies.length > 0 ? "text-red-500 animate-pulse" : "text-blue-500"} size={24} />
          <span>SafeFlights <span className="text-zinc-500 font-normal">Global Tracker</span></span>
        </div>

        <form onSubmit={handleAirportSearch} className="flex-1 max-w-lg mx-8 relative">
          <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 focus-within:border-blue-500 transition-colors">
            <Search size={16} className="text-zinc-400 mr-2" />
            <input type="text" placeholder="Search Callsign, Airline, or Airport..." value={searchQuery} onChange={(e) => {
              setSearchQuery(e.target.value);
              const q = e.target.value.toLowerCase();
              setLiveSearchResults(q ? flights.filter(f => f.num.toLowerCase().includes(q) || f.airline.toLowerCase().includes(q)).slice(0, 5) : []);
            }}
              className="bg-transparent border-none text-white w-full outline-none text-sm"
            />
            {searchQuery && <X size={16} className="text-zinc-400 cursor-pointer" onClick={() => { setSearchQuery(""); setSearchResults([]); setLiveSearchResults([]); }} />}
          </div>

          {(searchResults.length > 0 || liveSearchResults.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-md z-50 shadow-2xl overflow-hidden">
              {liveSearchResults.map(f => (
                <div key={f.id} onClick={() => handleFlightSelect(f)} className="px-4 py-3 hover:bg-zinc-800 cursor-pointer flex justify-between items-center border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-3"><Plane size={16} className="text-blue-400" /> <span className="font-mono font-bold">{f.num}</span></div>
                  <span className="text-xs text-zinc-400">{f.velocity} km/h • {f.alt} ft</span>
                </div>
              ))}
              {searchResults.map((res: any) => (
                <div key={res.place_id} onClick={() => flyToAirportResult(res.lat, res.lon, res.display_name)} className="px-4 py-3 hover:bg-zinc-800 cursor-pointer flex items-center gap-3 border-b border-zinc-800 last:border-0">
                  <MapIcon size={16} className="text-orange-400" /> <span className="truncate flex-1 text-sm">{res.display_name}</span>
                </div>
              ))}
            </div>
          )}
        </form>

        <div className="flex items-center gap-4 text-xs font-mono">
          <button onClick={() => setIsHeatmap(!isHeatmap)} className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${isHeatmap ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
            <ThermometerSun size={14} /> Altitude Heatmap
          </button>
          <button onClick={() => setViewMode(viewMode === "2D" ? "3D" : "2D")} className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${viewMode === "3D" ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
            <Globe size={14} /> {viewMode === "2D" ? "Enable 3D Globe" : "Return to 2D"}
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded text-zinc-300">
            <Clock size={14} /> {currentTime.toISOString().split('T')[1].substring(0, 8)} {timeOffset !== 0 && `(HISTORICAL)`}
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded font-bold" style={{ color: dataSource === 'OPENSKY' ? '#10b981' : dataSource === 'ADSB_LOL' ? '#f97316' : '#ef4444' }}>
            <Activity size={14} /> {dataSource}
          </div>
        </div>
      </nav>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Left Side Panel */}
        <aside className="w-80 bg-zinc-950 border-r border-zinc-800 flex flex-col z-40 shrink-0">

          {emergencies.length > 0 && (
            <div className="p-4 bg-red-950 border-b border-red-900">
              <div className="text-red-500 font-bold flex items-center gap-2 mb-2 uppercase text-xs tracking-wider">
                <AlertTriangle size={14} className="animate-pulse" /> Emergency Squawk
              </div>
              {emergencies.map(f => (
                <div key={f.id} className="text-sm cursor-pointer hover:bg-red-900/50 p-2 rounded transition-colors" onClick={() => handleFlightSelect(f)}>
                  <span className="font-mono font-bold mr-2">{f.num}</span>
                  Squawking {f.squawk} at {f.alt} ft
                </div>
              ))}
            </div>
          )}

          {geofenceAlerts.length > 0 && (
            <div className="p-4 bg-orange-950 border-b border-orange-900">
              <div className="text-orange-500 font-bold flex items-center gap-2 mb-2 uppercase text-xs tracking-wider">
                <ShieldAlert size={14} /> Restricted Airspace Violation
              </div>
              {geofenceAlerts.slice(0, 3).map((a, i) => (
                <div key={i} className="text-sm text-zinc-300 mb-1">
                  <span className="font-mono font-bold text-white mr-1">{a.flight}</span>
                  entered {a.zone}
                </div>
              ))}
            </div>
          )}

          {selectedAirportBoard ? (
            <div className="flex-1 flex flex-col p-5 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs uppercase tracking-wider text-zinc-500 font-bold flex items-center gap-2"><MapIcon size={14} /> Terminal Schedule</div>
                <X size={16} className="text-zinc-500 cursor-pointer hover:text-white" onClick={() => setSelectedAirportBoard(null)} />
              </div>
              <h2 className="text-xl font-bold text-white mb-6">{selectedAirportBoard.name}</h2>
              <div className="flex flex-col gap-4">
                {getTerminalSchedule(selectedAirportBoard.name).map(s => (
                  <div key={s.id} className="pb-4 border-b border-zinc-800 last:border-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-blue-400 font-mono font-bold">{s.flight}</span>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${s.type === 'Arrival' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>{s.type}</span>
                    </div>
                    <div className="text-sm text-zinc-300 mb-1">{s.type === 'Arrival' ? 'From' : 'To'} {s.city}</div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500 font-mono">{s.time}</span>
                      <span className={s.status === 'Delayed' ? 'text-red-400' : 'text-zinc-500'}>{s.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto">
              <div className="text-xs uppercase tracking-wider text-zinc-500 font-bold flex items-center gap-2 mb-4 pb-4 border-b border-zinc-800">
                <Plane size={14} /> Active Radar Feed ({flights.length})
              </div>
              <div className="flex flex-col gap-3">
                {flights.length === 0 ? (
                  <div className="text-center text-zinc-600 my-10"><Activity size={32} className="mx-auto mb-3 opacity-50" /> {isScanning ? 'Scanning...' : 'No Aircraft'}</div>
                ) : (
                  flights.slice(0, 50).map(flight => {
                    const isActive = selectedFlight?.id === flight.id;
                    const bColor = isActive ? 'border-blue-500 bg-blue-900/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600';
                    return (
                      <div key={flight.id} onClick={() => handleFlightSelect(flight)} className={`p-4 rounded-lg border ${bColor} cursor-pointer transition-all`}>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="font-mono font-bold text-white text-lg leading-none mb-1">{flight.num}</div>
                            <div className="text-xs text-zinc-500 uppercase tracking-widest">{flight.country}</div>
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${flight.onGround ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-800 text-zinc-300'}`}>
                            {flight.onGround ? 'GND' : 'AIR'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div><span className="text-zinc-600 mr-2">ALT</span><span className="text-green-400">{flight.alt} ft</span></div>
                          <div><span className="text-zinc-600 mr-2">SPD</span><span className="text-zinc-300">{flight.velocity} km</span></div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Cinematic Map / 3D Canvas area */}
        <section className="flex-1 relative bg-[#09090b]">
          {viewMode === "3D" ? (
            <div className="absolute inset-0 z-10 fade-in pointer-events-auto flex flex-col">
              <div className="absolute top-4 left-4 z-20 bg-black/50 backdrop-blur-md p-4 rounded-lg border border-zinc-800 text-white max-w-sm">
                <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Globe className="text-blue-400" /> Immersive 3D View</h3>
                <p className="text-sm text-zinc-400">Interact with the globe to explore the situational theater in full 3D space utilizing the Spline runtime engine. Drag to rotate, scroll to zoom.</p>
              </div>
              {/* Spline globe injection */}
              <div className="w-full h-full relative cursor-move">
                <GlobeComponent
                  globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
                  bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
                  backgroundImageUrl="https://unpkg.com/three-globe/example/img/night-sky.png"
                  pointsData={flights}
                  pointLat={d => (d as FlightState).lat}
                  pointLng={d => (d as FlightState).lon}
                  pointAltitude={d => ((d as FlightState).alt / 35000) * 0.1} // Scale altitude
                  pointColor={d => isHeatmap ? getHeatmapColor((d as FlightState).alt) : ((d as FlightState).squawk === '7700' ? '#ff0000' : '#FFD700')}
                  pointRadius={0.4}
                  pointsMerge={false}
                  onPointClick={(d) => handleFlightSelect(d as FlightState)}
                />
              </div>
            </div>
          ) : (
            <MapContainer center={[CENTER_LAT, CENTER_LON]} zoom={5} zoomControl={false} style={{ width: '100%', height: '100%', zIndex: 0 }}>
              <MapBoundsFetcher boundsRef={boundsRef} />
              <MapUpdater flyToLocation={flyToLocation} />
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

              {/* Restricted GeoFences */}
              {THREAT_ZONES.map(zone => (
                <Polygon key={zone.name} positions={zone.coords} pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.15, weight: 1 }}>
                  <Popup className="tactical-popup border-orange-500"><div className="font-bold text-orange-500 uppercase">{zone.name}</div></Popup>
                </Polygon>
              ))}

              {selectedFlightTrack.length > 0 && <Polyline positions={selectedFlightTrack} pathOptions={{ color: '#ef4444', weight: 4, opacity: 0.8 }} />}

              {flights.map(flight => (
                <Marker key={flight.id} position={[flight.lat, flight.lon]} icon={createPlaneIcon(flight.heading, flight.id === selectedFlight?.id, flight.alt, isHeatmap, flight.squawk)} eventHandlers={{ click: () => handleFlightSelect(flight) }}>
                  <Popup className="tactical-popup" closeButton={false}>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 shadow-2xl min-w-[260px]">
                      <div className="flex gap-4 items-center border-b border-zinc-800 pb-4 mb-4">
                        <div className="w-12 h-12 bg-white rounded flex items-center justify-center p-1 overflow-hidden shrink-0">
                          <img src={`https://flightaware.com/images/airline_logos/90p/${selectedFlightDetails?.OperatorFlagCode || flight.airline}.png`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        </div>
                        <div>
                          <div className="text-xl font-bold font-mono text-white leading-none mb-1">{flight.num}</div>
                          <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{selectedFlightDetails?.Type || 'AIRCRAFT UNKNOWN'}</div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-1">REG: {selectedFlightDetails?.Registration || flight.id.toUpperCase()}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs font-mono">
                        <div><div className="text-[9px] text-zinc-600 uppercase mb-1">True Track</div><div className="text-zinc-200 flex items-center gap-1"><Compass size={12} />{flight.heading}°</div></div>
                        <div><div className="text-[9px] text-zinc-600 uppercase mb-1">Gnd Speed</div><div className="text-zinc-200">{flight.velocity} km/h</div></div>
                        <div><div className="text-[9px] text-zinc-600 uppercase mb-1">Baro Alt</div><div className="text-green-400">{flight.alt} ft</div></div>
                        <div><div className="text-[9px] text-zinc-600 uppercase mb-1">Squawk</div><div className={flight.squawk === '7700' ? "text-red-500 font-bold animate-pulse" : "text-zinc-400"}>{flight.squawk || 'NONE'}</div></div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}

          {/* Timeline Replay Scrubber (Pinned to bottom of the map section) */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent z-40 pointer-events-auto">
            <div className="max-w-4xl mx-auto bg-zinc-950/80 backdrop-blur border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 shadow-2xl">
              <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                <span className="text-zinc-400 flex items-center gap-2"><History size={14} /> Historical Replay Timeframe</span>
                <span className={timeOffset === 0 ? "text-green-400" : "text-orange-400"}>
                  {timeOffset === 0 ? "LIVE" : `${Math.abs(timeOffset)} HOURS AGO`}
                </span>
              </div>
              <input
                type="range" min="-24" max="0" step="1"
                value={timeOffset}
                onChange={(e) => setTimeOffset(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-zinc-600 font-mono font-bold">
                <span>-24H</span><span>-18H</span><span>-12H</span><span>-6H</span><span>NOW</span>
              </div>
            </div>
          </div>
        </section>

      </main>

      <style>{`
        .search-result-hover:hover { background-color: var(--border-focus); }
        .fade-in { animation: fadeIn 1s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        /* Reset Leaflet popups */
        .leaflet-popup-content-wrapper { background: transparent !important; box-shadow: none !important; padding: 0 !important; border-radius: 0 !important; }
        .leaflet-popup-tip-container { display: none !important; }
      `}</style>
    </div>
  );
};

export default SafeFlightsApp;
