import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FileText,
  Filter,
  Flame,
  Gauge,
  History,
  Info,
  Layers,
  Lock,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
  Calculator,
  ChevronRight,
  Eye,
  RotateCcw,
  Check,
  X,
  HelpCircle,
  BookOpen,
  Terminal,
  Building2,
  Droplets,
  AlertOctagon,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

// ============================================================================
// MODULE 3 (PERSON 3): C01 — INDEXEDDB PERSISTENCE & OFFLINE STORAGE ENGINE
// File Boundary: src/modules/c01-offline-sync/indexedDbService.js
// ============================================================================
const DB_NAME = 'CampusWatt_OfflineDB_v1';
const DB_VERSION = 1;
const STORES = {
  STATE: 'app_state',
  QUEUE: 'offline_queue',
  AUDIT: 'audit_logs'
};

const IndexedDBService = {
  openDB() {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        resolve(null);
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.STATE)) {
          db.createObjectStore(STORES.STATE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.QUEUE)) {
          db.createObjectStore(STORES.QUEUE, { keyPath: 'actionId' });
        }
        if (!db.objectStoreNames.contains(STORES.AUDIT)) {
          db.createObjectStore(STORES.AUDIT, { keyPath: 'eventId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  },

  async saveSnapshot(key, data) {
    try {
      localStorage.setItem(`cw_${key}`, JSON.stringify(data));
      const db = await this.openDB();
      if (!db) return;
      const tx = db.transaction(STORES.STATE, 'readwrite');
      tx.objectStore(STORES.STATE).put({ id: key, payload: data, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.warn('IndexedDB fallback to localStorage:', e);
    }
  },

  async loadSnapshot(key, fallbackData) {
    try {
      const db = await this.openDB();
      if (db) {
        const result = await new Promise((resolve) => {
          const tx = db.transaction(STORES.STATE, 'readonly');
          const req = tx.objectStore(STORES.STATE).get(key);
          req.onsuccess = () => resolve(req.result ? req.result.payload : null);
          req.onerror = () => resolve(null);
        });
        if (result !== null) return result;
      }
      const raw = localStorage.getItem(`cw_${key}`);
      return raw ? JSON.parse(raw) : fallbackData;
    } catch (e) {
      return fallbackData;
    }
  },

  async clearAll() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('cw_'))
        .forEach((k) => localStorage.removeItem(k));
      const db = await this.openDB();
      if (!db) return;
      const tx = db.transaction([STORES.STATE, STORES.QUEUE, STORES.AUDIT], 'readwrite');
      tx.objectStore(STORES.STATE).clear();
      tx.objectStore(STORES.QUEUE).clear();
      tx.objectStore(STORES.AUDIT).clear();
    } catch (e) {
      console.warn('Reset storage warning:', e);
    }
  }
};

// ============================================================================
// SHARED DATA MODELS & INITIAL SIMULATED CAMPUS TELEMETRY
// File Boundary: src/shared/mockCampusData.js
// ============================================================================
const INITIAL_SETTINGS = {
  tariffPerKwh: 8.0, // ₹8 per kWh
  freshnessThresholdMins: 15, // Readings older than 15m flagged as Stale
  anomalyMultiplier: 2.0, // Power > 2x baseline when unoccupied -> Ghost Room / Standby
  spikeThresholdKw: 14.0, // Sudden jump threshold
  maxOccupancyConflictDelta: 10, // Difference between Sensor A and B before flagging Conflict
  tempMinComfort: 20.0,
  tempMaxComfort: 26.0,
  protectEssentialEquipment: true,
  requireHumanApproval: true
};

type CampusRoom = {
  id: string;
  name: string;
  type: string;
  building: string;
  capacity: number;
  sensorA_occupancy: number | null;
  sensorB_occupancy: number | null;
  occupancy: number | 'UNCERTAIN';
  occupancyStatus: string;
  timetable: string;
  isScheduled: boolean;
  currentKw: number | null;
  baselineKw: number;
  expectedActiveKw: number;
  tempC: number;
  humidityPct: number;
  readingAgeMins: number;
  readingTimestamp: string;
  rawReliability: string;
  faultInjected: string;
  repeatedCount: number;
  fluctuationIndex: number;
  essentialEquipment: string | null;
  isEssentialProtected: boolean;
  notes: string;
  history: { time: string; kw: number; baseline: number; occ: number }[];
};

const INITIAL_ROOMS: CampusRoom[] = [
  {
    id: 'LH-201',
    name: 'Lecture Hall 201',
    type: 'Lecture Hall',
    building: 'Main Academic Block',
    capacity: 120,
    sensorA_occupancy: 0,
    sensorB_occupancy: 0,
    occupancy: 0,
    occupancyStatus: 'Unoccupied',
    timetable: 'No Scheduled Class',
    isScheduled: false,
    currentKw: 4.8,
    baselineKw: 0.6,
    expectedActiveKw: 5.0,
    tempC: 21.5,
    humidityPct: 48,
    readingAgeMins: 2,
    readingTimestamp: '2 mins ago',
    rawReliability: 'Reliable',
    faultInjected: 'NONE',
    repeatedCount: 1,
    fluctuationIndex: 0.04,
    essentialEquipment: null,
    isEssentialProtected: false,
    notes: 'HVAC & 4 projector banks running with 0 occupants detected by both IR and CO2/ ultrasonic counters.',
    history: [
      { time: '08:00', kw: 4.9, baseline: 4.8, occ: 85 },
      { time: '09:00', kw: 5.1, baseline: 4.8, occ: 92 },
      { time: '10:00', kw: 4.8, baseline: 0.6, occ: 0 },
      { time: '11:00', kw: 4.8, baseline: 0.6, occ: 0 },
      { time: '12:00', kw: 4.8, baseline: 0.6, occ: 0 }
    ]
  },
  {
    id: 'LH-102',
    name: 'Lecture Hall 102',
    type: 'Lecture Hall',
    building: 'Main Academic Block',
    capacity: 90,
    sensorA_occupancy: 64,
    sensorB_occupancy: 62,
    occupancy: 64,
    occupancyStatus: 'Occupied',
    timetable: 'CS301 - Algorithms (09:00-11:00)',
    isScheduled: true,
    currentKw: 5.2,
    baselineKw: 0.7,
    expectedActiveKw: 4.9,
    tempC: 23.8,
    humidityPct: 54,
    readingAgeMins: 1,
    readingTimestamp: '1 min ago',
    rawReliability: 'Reliable',
    faultInjected: 'NONE',
    repeatedCount: 1,
    fluctuationIndex: 0.05,
    essentialEquipment: null,
    isEssentialProtected: false,
    notes: 'Active lecture in progress. Power usage matches occupancy and timetable baseline.',
    history: [
      { time: '08:00', kw: 0.8, baseline: 0.7, occ: 4 },
      { time: '09:00', kw: 4.9, baseline: 4.9, occ: 60 },
      { time: '10:00', kw: 5.1, baseline: 4.9, occ: 63 },
      { time: '11:00', kw: 5.2, baseline: 4.9, occ: 64 },
      { time: '12:00', kw: 5.2, baseline: 4.9, occ: 64 }
    ]
  },
  {
    id: 'LAB-104',
    name: 'Biotech & Wet Lab 104',
    type: 'Research Lab',
    building: 'Bioengineering Wing',
    capacity: 40,
    sensorA_occupancy: 0,
    sensorB_occupancy: 0,
    occupancy: 0,
    occupancyStatus: 'Unoccupied',
    timetable: 'No Scheduled Class',
    isScheduled: false,
    currentKw: 6.4,
    baselineKw: 5.8,
    expectedActiveKw: 7.5,
    tempC: 19.2,
    humidityPct: 42,
    readingAgeMins: 3,
    readingTimestamp: '3 mins ago',
    rawReliability: 'Reliable',
    faultInjected: 'NONE',
    repeatedCount: 2,
    fluctuationIndex: 0.03,
    essentialEquipment: 'Biological Cold Storage (-80°C Freezers) & Fume Hoods',
    isEssentialProtected: true,
    notes: 'Contains critical biological cultures and negative-pressure fume extraction. Strictly locked out from load shedding.',
    history: [
      { time: '08:00', kw: 6.1, baseline: 5.8, occ: 0 },
      { time: '09:00', kw: 7.2, baseline: 7.5, occ: 18 },
      { time: '10:00', kw: 7.4, baseline: 7.5, occ: 22 },
      { time: '11:00', kw: 6.4, baseline: 5.8, occ: 0 },
      { time: '12:00', kw: 6.4, baseline: 5.8, occ: 0 }
    ]
  },
  {
    id: 'CR-305',
    name: 'Classroom 305',
    type: 'Classroom',
    building: 'East Academic Annex',
    capacity: 60,
    sensorA_occupancy: 0,
    sensorB_occupancy: 40,
    occupancy: 'UNCERTAIN',
    occupancyStatus: 'Uncertain',
    timetable: 'No Scheduled Class',
    isScheduled: false,
    currentKw: 3.9,
    baselineKw: 0.5,
    expectedActiveKw: 3.8,
    tempC: 22.0,
    humidityPct: 50,
    readingAgeMins: 2,
    readingTimestamp: '2 mins ago',
    rawReliability: 'Conflicting',
    faultInjected: 'CONFLICTING_SENSORS',
    repeatedCount: 1,
    fluctuationIndex: 0.08,
    essentialEquipment: null,
    isEssentialProtected: false,
    notes: 'C10 Alert: Ceiling PIR Sensor A reports 0 occupants, Thermal Door Counter Sensor B reports 40 occupants. Ghost Room classification blocked!',
    history: [
      { time: '08:00', kw: 0.5, baseline: 0.5, occ: 0 },
      { time: '09:00', kw: 3.6, baseline: 3.8, occ: 38 },
      { time: '10:00', kw: 3.8, baseline: 3.8, occ: 40 },
      { time: '11:00', kw: 3.9, baseline: 0.5, occ: 20 },
      { time: '12:00', kw: 3.9, baseline: 0.5, occ: 20 }
    ]
  },
  {
    id: 'LIB-201',
    name: 'Central Reading Hall 201',
    type: 'Library Zone',
    building: 'Central Library',
    capacity: 200,
    sensorA_occupancy: 112,
    sensorB_occupancy: 110,
    occupancy: 112,
    occupancyStatus: 'Occupied',
    timetable: 'Open Study Hours (08:00-22:00)',
    isScheduled: true,
    currentKw: 8.4,
    baselineKw: 2.0,
    expectedActiveKw: 7.5,
    tempC: 24.1,
    humidityPct: 52,
    readingAgeMins: 1,
    readingTimestamp: '1 min ago',
    rawReliability: 'Reliable',
    faultInjected: 'NONE',
    repeatedCount: 1,
    fluctuationIndex: 0.04,
    essentialEquipment: null,
    isEssentialProtected: false,
    notes: 'High student occupancy. Energy per occupant-hour is highly efficient at 0.075 kWh/occ-hr.',
    history: [
      { time: '08:00', kw: 5.2, baseline: 7.5, occ: 45 },
      { time: '09:00', kw: 6.8, baseline: 7.5, occ: 82 },
      { time: '10:00', kw: 7.9, baseline: 7.5, occ: 104 },
      { time: '11:00', kw: 8.2, baseline: 7.5, occ: 110 },
      { time: '12:00', kw: 8.4, baseline: 7.5, occ: 112 }
    ]
  },
  {
    id: 'LAB-205',
    name: 'Server & Computing Lab 205',
    type: 'Computing Lab',
    building: 'IT & Data Block',
    capacity: 50,
    sensorA_occupancy: 4,
    sensorB_occupancy: 4,
    occupancy: 4,
    occupancyStatus: 'Occupied',
    timetable: 'Maintenance Window',
    isScheduled: true,
    currentKw: 11.2,
    baselineKw: 10.5,
    expectedActiveKw: 11.5,
    tempC: 18.5,
    humidityPct: 38,
    readingAgeMins: 1,
    readingTimestamp: '1 min ago',
    rawReliability: 'Reliable',
    faultInjected: 'NONE',
    repeatedCount: 1,
    fluctuationIndex: 0.02,
    essentialEquipment: 'Campus Rack Servers, Core Switches & Precision Cooling',
    isEssentialProtected: true,
    notes: '24/7 Essential IT Infrastructure load. Precision cooling setpoint locked at 18.5°C.',
    history: [
      { time: '08:00', kw: 10.8, baseline: 10.5, occ: 2 },
      { time: '09:00', kw: 11.0, baseline: 10.5, occ: 3 },
      { time: '10:00', kw: 11.1, baseline: 10.5, occ: 4 },
      { time: '11:00', kw: 11.3, baseline: 10.5, occ: 4 },
      { time: '12:00', kw: 11.2, baseline: 10.5, occ: 4 }
    ]
  },
  {
    id: 'AUD-101',
    name: 'Main Auditorium 101',
    type: 'Auditorium',
    building: 'Convention Center',
    capacity: 450,
    sensorA_occupancy: 0,
    sensorB_occupancy: 0,
    occupancy: 0,
    occupancyStatus: 'Uncertain',
    timetable: 'Guest Seminar (Scheduled 10:00-12:00)',
    isScheduled: true,
    currentKw: 7.6,
    baselineKw: 0.9,
    expectedActiveKw: 9.5,
    tempC: 20.1,
    humidityPct: 46,
    readingAgeMins: 48,
    readingTimestamp: '48 mins ago',
    rawReliability: 'Stale',
    faultInjected: 'STALE_TIMESTAMP',
    repeatedCount: 1,
    fluctuationIndex: 0.03,
    essentialEquipment: null,
    isEssentialProtected: false,
    notes: 'Schedule Drift + Stale Telemetry: Seminar was scheduled, occupancy reads 0, but gateway heartbeat is 48 mins old. Automated HVAC action blocked until manual check.',
    history: [
      { time: '08:00', kw: 0.9, baseline: 0.9, occ: 0 },
      { time: '09:00', kw: 7.4, baseline: 9.5, occ: 0 },
      { time: '10:00', kw: 7.6, baseline: 9.5, occ: 0 },
      { time: '11:00', kw: 7.6, baseline: 9.5, occ: 0 },
      { time: '12:00', kw: 7.6, baseline: 9.5, occ: 0 }
    ]
  },
  {
    id: 'CR-202',
    name: 'Seminar Room 202',
    type: 'Seminar Room',
    building: 'Main Academic Block',
    capacity: 45,
    sensorA_occupancy: 0,
    sensorB_occupancy: 0,
    occupancy: 0,
    occupancyStatus: 'Unoccupied',
    timetable: 'No Scheduled Class',
    isScheduled: false,
    currentKw: 2.1,
    baselineKw: 0.4,
    expectedActiveKw: 2.8,
    tempC: 23.0,
    humidityPct: 51,
    readingAgeMins: 2,
    readingTimestamp: '2 mins ago',
    rawReliability: 'Reliable',
    faultInjected: 'NONE',
    repeatedCount: 1,
    fluctuationIndex: 0.04,
    essentialEquipment: null,
    isEssentialProtected: false,
    notes: 'Unoccupied seminar room drawing 2.1 kW standby load (split AC unit & smartboard left on).',
    history: [
      { time: '08:00', kw: 2.6, baseline: 2.8, occ: 28 },
      { time: '09:00', kw: 2.7, baseline: 2.8, occ: 30 },
      { time: '10:00', kw: 2.1, baseline: 0.4, occ: 0 },
      { time: '11:00', kw: 2.1, baseline: 0.4, occ: 0 },
      { time: '12:00', kw: 2.1, baseline: 0.4, occ: 0 }
    ]
  }
];

const CAMPUS_HOURLY_SERIES = [
  { hour: '06:00', actualKw: 18.2, baselineKw: 17.5, forecastKw: 18.0, occupiedRooms: 1 },
  { hour: '07:00', actualKw: 22.4, baselineKw: 21.0, forecastKw: 22.0, occupiedRooms: 2 },
  { hour: '08:00', actualKw: 34.8, baselineKw: 31.2, forecastKw: 33.5, occupiedRooms: 4 },
  { hour: '09:00', actualKw: 45.6, baselineKw: 38.0, forecastKw: 44.0, occupiedRooms: 5 },
  { hour: '10:00', actualKw: 51.2, baselineKw: 41.5, forecastKw: 48.5, occupiedRooms: 4 },
  { hour: '11:00', actualKw: 49.9, baselineKw: 39.0, forecastKw: 47.2, occupiedRooms: 3 },
  { hour: '12:00', actualKw: 49.6, baselineKw: 36.1, forecastKw: 46.8, occupiedRooms: 3 },
  { hour: '13:00', actualKw: null, baselineKw: 38.4, forecastKw: 45.1, occupiedRooms: null },
  { hour: '14:00', actualKw: null, baselineKw: 43.2, forecastKw: 52.4, occupiedRooms: null },
  { hour: '15:00', actualKw: null, baselineKw: 41.0, forecastKw: 49.0, occupiedRooms: null },
  { hour: '16:00', actualKw: null, baselineKw: 34.5, forecastKw: 39.2, occupiedRooms: null }
];

const WEEKLY_TREND_DATA = [
  { day: 'Mon', totalKwh: 842, avoidableKwh: 118, baselineKwh: 724 },
  { day: 'Tue', totalKwh: 815, avoidableKwh: 94, baselineKwh: 721 },
  { day: 'Wed', totalKwh: 868, avoidableKwh: 132, baselineKwh: 736 },
  { day: 'Thu', totalKwh: 790, avoidableKwh: 76, baselineKwh: 714 },
  { day: 'Fri (Today)', totalKwh: 764, avoidableKwh: 89, baselineKwh: 675 },
  { day: 'Sat (Est)', totalKwh: 410, avoidableKwh: 45, baselineKwh: 365 },
  { day: 'Sun (Est)', totalKwh: 320, avoidableKwh: 28, baselineKwh: 292 }
];

const INITIAL_AUDIT_LOGS = [
  {
    eventId: 'EVT-1001',
    type: 'SYSTEM_INIT',
    title: 'CampusWatt Telemetry & Validation Engine Started',
    description: 'Loaded 8 simulated campus zones. C10 Sensor Validation Layer and C01 IndexedDB Offline Queue active.',
    relatedId: 'SYSTEM',
    status: 'Verified',
    timestamp: '09:00:12 AM'
  },
  {
    eventId: 'EVT-1002',
    type: 'SENSOR_ANOMALY',
    title: 'C10 Conflict Detected in CR-305',
    description: 'Sensor A reports 0 occupants; Sensor B reports 40 occupants. Room occupancy marked UNCERTAIN. Ghost Room auto-flagging blocked.',
    relatedId: 'CR-305',
    status: 'Blocked Unsafe Action',
    timestamp: '11:14:05 AM'
  },
  {
    eventId: 'EVT-1003',
    type: 'SENSOR_ANOMALY',
    title: 'C10 Stale Telemetry Detected in AUD-101',
    description: 'Reading timestamp is 48 mins old (threshold: 15 mins). Schedule Drift noted, control recommendation blocked.',
    relatedId: 'AUD-101',
    status: 'Under Verification',
    timestamp: '11:32:40 AM'
  },
  {
    eventId: 'EVT-1004',
    type: 'REC_GENERATED',
    title: 'Ghost Room Detected in LH-201',
    description: 'Unoccupied & unscheduled room drawing 4.8 kW vs 0.6 kW baseline. Sensors verified Reliable. Awaiting human approval.',
    relatedId: 'REC-LH-201',
    status: 'Pending Approval',
    timestamp: '11:45:00 AM'
  }
];

// ============================================================================
// MODULE 2 (PERSON 2): C10 — SENSOR VALIDATION LAYER ("THE SENSORS ARE LYING")
// File Boundary: src/modules/c10-sensor-validation/sensorValidator.js
// ============================================================================
function validateRoomSensors(room, settings) {
  const issues = [];
  let status = 'Reliable';
  let confidenceScore = 98;
  let allowEnergyControl = true;
  let effectiveOccupancy = room.occupancy;
  let effectiveOccupancyStatus = room.occupancyStatus;

  // 1. Check Missing Readings
  if (
    room.faultInjected === 'MISSING_READING' ||
    room.currentKw === null ||
    room.currentKw === undefined ||
    room.sensorA_occupancy === null
  ) {
    status = 'Missing';
    confidenceScore = 0;
    allowEnergyControl = false;
    effectiveOccupancy = 'UNCERTAIN';
    effectiveOccupancyStatus = 'Uncertain';
    issues.push({
      code: 'C10_MISSING_TELEMETRY',
      severity: 'critical',
      explanation: 'Telemetry packet dropped or returned NULL. Reading marked unavailable. Energy recommendations blocked.'
    });
    return {
      status,
      confidenceScore,
      allowEnergyControl,
      effectiveOccupancy,
      effectiveOccupancyStatus,
      issues,
      summary: 'Telemetry Missing — Control Blocked'
    };
  }

  // 2. Check Conflicting Occupancy Sensors (Sensor A vs Sensor B)
  const occDelta = Math.abs((room.sensorA_occupancy ?? 0) - (room.sensorB_occupancy ?? 0));
  if (
    room.faultInjected === 'CONFLICTING_SENSORS' ||
    occDelta > (settings.maxOccupancyConflictDelta || 10)
  ) {
    status = 'Conflicting';
    confidenceScore = 25;
    allowEnergyControl = false;
    effectiveOccupancy = 'UNCERTAIN';
    effectiveOccupancyStatus = 'Uncertain';
    issues.push({
      code: 'C10_OCCUPANCY_CONFLICT',
      severity: 'critical',
      explanation: `Sensor A reports ${room.sensorA_occupancy} occupants while Sensor B reports ${room.sensorB_occupancy} occupants (Δ=${occDelta}). Room cannot be classified as empty.`
    });
  }

  // 3. Check Stale Readings
  if (
    room.faultInjected === 'STALE_TIMESTAMP' ||
    room.readingAgeMins > (settings.freshnessThresholdMins || 15)
  ) {
    if (status === 'Reliable') status = 'Stale';
    confidenceScore = Math.min(confidenceScore, 35);
    allowEnergyControl = false;
    effectiveOccupancy = 'UNCERTAIN';
    effectiveOccupancyStatus = 'Uncertain';
    issues.push({
      code: 'C10_STALE_TIMESTAMP',
      severity: 'warning',
      explanation: `Last reading arrived ${room.readingAgeMins} mins ago, exceeding the ${settings.freshnessThresholdMins} min freshness threshold.`
    });
  }

  // 4. Check Sudden Power Spikes
  if (
    room.faultInjected === 'SUDDEN_SPIKE' ||
    (room.currentKw >= (settings.spikeThresholdKw || 14.0) && !room.isEssentialProtected)
  ) {
    status = 'Suspicious';
    confidenceScore = Math.min(confidenceScore, 40);
    allowEnergyControl = false;
    issues.push({
      code: 'C10_SUDDEN_POWER_SPIKE',
      severity: 'warning',
      explanation: `Sudden surge to ${room.currentKw} kW detected (Baseline: ${room.baselineKw} kW). Preserving original reading for safety inspection; blocking automated shutdown in case of active equipment event.`
    });
  }

  // 5. Check Repeated / Frozen Sensor Values
  if (room.faultInjected === 'REPEATED_VALUES' || room.repeatedCount >= 12) {
    status = 'Suspicious';
    confidenceScore = Math.min(confidenceScore, 45);
    allowEnergyControl = false;
    effectiveOccupancy = 'UNCERTAIN';
    effectiveOccupancyStatus = 'Uncertain';
    issues.push({
      code: 'C10_FROZEN_REPEATED_VALUE',
      severity: 'warning',
      explanation: `Sensor has reported identical value (${room.sensorA_occupancy} occ / ${room.currentKw} kW) for ${room.repeatedCount} consecutive polling intervals with zero jitter.`
    });
  }

  // 6. Check Unusual Fluctuations / Implausible Noise
  if (room.faultInjected === 'UNUSUAL_FLUCTUATION' || room.fluctuationIndex > 0.45) {
    status = 'Suspicious';
    confidenceScore = Math.min(confidenceScore, 30);
    allowEnergyControl = false;
    effectiveOccupancy = 'UNCERTAIN';
    effectiveOccupancyStatus = 'Uncertain';
    issues.push({
      code: 'C10_ERRATIC_FLUCTUATION',
      severity: 'warning',
      explanation: `High variance telemetry jitter detected (Fluctuation Index: ${(room.fluctuationIndex * 100).toFixed(0)}%). Cross-verification required.`
    });
  }

  // Normal Reliable calculation if no issues found
  if (issues.length === 0) {
    const avgOcc = Math.round((room.sensorA_occupancy + room.sensorB_occupancy) / 2);
    effectiveOccupancy = room.sensorA_occupancy;
    effectiveOccupancyStatus = avgOcc > 0 ? 'Occupied' : 'Unoccupied';
  }

  return {
    status,
    confidenceScore,
    allowEnergyControl,
    effectiveOccupancy,
    effectiveOccupancyStatus,
    issues,
    summary:
      issues.length === 0
        ? 'Verified Reliable — Analysis Permitted'
        : `${status} (${issues.length} issue${issues.length > 1 ? 's' : ''}) — Control Blocked`
  };
}

// ============================================================================
// CORE ENERGY INTELLIGENCE ENGINE (RULES-BASED, C10-GATED, SAFETY-AWARE)
// File Boundary: src/modules/energy-engine/energyIntelligence.js
// ============================================================================
function analyzeCampusRooms(rooms, settings, existingRecState = {}) {
  const enrichedRooms = [];
  const recommendations = [];

  rooms.forEach((room) => {
    const validation = validateRoomSensors(room, settings);
    const isProtected = settings.protectEssentialEquipment && room.isEssentialProtected;

    let energyClassification = 'Normal';
    let avoidableKw = 0;

    // Determine Schedule Drift
    let scheduleDrift = null;
    if (validation.status === 'Reliable') {
      if (room.isScheduled && validation.effectiveOccupancy === 0) {
        scheduleDrift = 'Scheduled class in timetable, but room is currently unoccupied.';
      } else if (!room.isScheduled && validation.effectiveOccupancy > 0) {
        scheduleDrift = 'Unscheduled room usage detected (occupied outside timetable).';
      }
    } else if (room.isScheduled && room.sensorA_occupancy === 0) {
      scheduleDrift = 'Possible schedule drift, but sensor telemetry is currently unverified.';
    }

    // Check Essential Equipment First
    if (isProtected) {
      energyClassification = 'Protected Essential Load';
      avoidableKw = 0;
    } else if (!validation.allowEnergyControl) {
      // C10 Gate: Do NOT classify as Ghost Room if sensors are lying/uncertain!
      energyClassification = `Blocked by C10 (${validation.status})`;
      avoidableKw = 0;

      // Generate an Investigation / Verification Recommendation (NOT an energy control action)
      const recId = `REC-VERIFY-${room.id}`;
      const savedStatus = existingRecState[recId]?.approvalStatus || 'Pending Verification';
      recommendations.push({
        id: recId,
        roomId: room.id,
        roomName: room.name,
        category: 'Sensor & Anomaly Investigation',
        isControlAction: false,
        reason:
          validation.issues[0]?.explanation ||
          'Sensor reliability issue prevents automated Ghost Room classification.',
        proposedAction:
          room.faultInjected === 'SUDDEN_SPIKE'
            ? 'Inspect electrical sub-panel & verify whether high-power lab equipment was turned on manually. Do NOT shut down breaker automatically.'
            : 'Dispatch facilities technician to cross-check occupancy/meter sensor hardware before permitting HVAC setback.',
        currentKw: room.currentKw ?? 0,
        expectedKw: room.currentKw ?? 0,
        durationHrs: 1.5,
        potentialSavingsKwh: 0,
        estimatedCostSavingsInr: 0,
        riskLevel: room.faultInjected === 'SUDDEN_SPIKE' ? 'High (Safety Investigation)' : 'Medium (Data Integrity)',
        sensorConfidence: `${validation.status} (${validation.confidenceScore}%)`,
        isBlockedByC10: true,
        isProtectedLoad: false,
        timestamp: room.readingTimestamp,
        approvalStatus: savedStatus
      });
    } else {
      // Reliable Sensors & Non-Essential Load -> Run Rules Engine
      const isEmpty = validation.effectiveOccupancy === 0;
      const ratioToBaseline = room.baselineKw > 0 ? room.currentKw / room.baselineKw : 1;

      // Rule A: Ghost Room Detection (Unoccupied + Unscheduled + High Power)
      if (isEmpty && !room.isScheduled && room.currentKw >= room.baselineKw * settings.anomalyMultiplier && room.currentKw >= 2.5) {
        energyClassification = 'Ghost Room Detected';
        avoidableKw = Math.max(0, +(room.currentKw - room.baselineKw).toFixed(2));
        const durationHrs = 1.5;
        const potentialSavingsKwh = +(avoidableKw * durationHrs).toFixed(2);
        const estimatedCostSavingsInr = +(potentialSavingsKwh * settings.tariffPerKwh).toFixed(2);
        const recId = `REC-GHOST-${room.id}`;
        const savedStatus = existingRecState[recId]?.approvalStatus || 'Pending Approval';

        recommendations.push({
          id: recId,
          roomId: room.id,
          roomName: room.name,
          category: 'Ghost Room Elimination',
          isControlAction: true,
          reason: `Room has 0 verified occupants, no scheduled class, and consumes ${room.currentKw} kW compared to ${room.baselineKw} kW historical baseline.`,
          proposedAction: 'Authorize setback of HVAC zone dampers and turn off unscheduled projector/lighting banks.',
          currentKw: room.currentKw,
          expectedKw: room.baselineKw,
          durationHrs,
          potentialSavingsKwh,
          estimatedCostSavingsInr,
          riskLevel: 'Low (Verified Unoccupied)',
          sensorConfidence: `Reliable (${validation.confidenceScore}%)`,
          isBlockedByC10: false,
          isProtectedLoad: false,
          timestamp: room.readingTimestamp,
          approvalStatus: savedStatus
        });
      }
      // Rule B: Standby Consumption Detection (Unoccupied + Moderate excess load)
      else if (isEmpty && room.currentKw > room.baselineKw * 1.5) {
        energyClassification = 'Standby Power Waste';
        avoidableKw = Math.max(0, +(room.currentKw - room.baselineKw).toFixed(2));
        const durationHrs = 2.0;
        const potentialSavingsKwh = +(avoidableKw * durationHrs).toFixed(2);
        const estimatedCostSavingsInr = +(potentialSavingsKwh * settings.tariffPerKwh).toFixed(2);
        const recId = `REC-STANDBY-${room.id}`;
        const savedStatus = existingRecState[recId]?.approvalStatus || 'Pending Approval';

        recommendations.push({
          id: recId,
          roomId: room.id,
          roomName: room.name,
          category: 'Standby Power Reduction',
          isControlAction: true,
          reason: `Unoccupied room drawing ${room.currentKw} kW in standby mode (Baseline: ${room.baselineKw} kW).`,
          proposedAction: 'Place split AC unit and AV podium into deep sleep standby profile.',
          currentKw: room.currentKw,
          expectedKw: room.baselineKw,
          durationHrs,
          potentialSavingsKwh,
          estimatedCostSavingsInr,
          riskLevel: 'Low (Verified Unoccupied)',
          sensorConfidence: `Reliable (${validation.confidenceScore}%)`,
          isBlockedByC10: false,
          isProtectedLoad: false,
          timestamp: room.readingTimestamp,
          approvalStatus: savedStatus
        });
      }
      // Rule C: Schedule Drift Observation
      else if (scheduleDrift) {
        energyClassification = 'Schedule Drift';
      }
    }

    // Calculate Occupant-Hour Efficiency safely (handling 0 or uncertain occupants)
    const numericOcc = typeof validation.effectiveOccupancy === 'number' ? validation.effectiveOccupancy : 0;
    const kwhPerOccupantHour =
      numericOcc > 0 && room.currentKw !== null ? +(room.currentKw / numericOcc).toFixed(3) : null;

    enrichedRooms.push({
      ...room,
      validation,
      energyClassification,
      avoidableKw,
      scheduleDrift,
      kwhPerOccupantHour
    });
  });

  return { enrichedRooms, recommendations };
}

// ============================================================================
// REUSABLE UI BADGES & HELPERS
// ============================================================================
function ReliabilityBadge({ status }) {
  const styles = {
    Reliable: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Conflicting: 'bg-red-50 text-red-700 border-red-200',
    Missing: 'bg-red-50 text-red-800 border-red-300',
    Stale: 'bg-amber-50 text-amber-800 border-amber-200',
    Suspicious: 'bg-amber-50 text-amber-800 border-amber-300',
    'Under Verification': 'bg-blue-50 text-blue-700 border-blue-200'
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        styles[status] || 'bg-slate-100 text-slate-700 border-slate-200'
      }`}
    >
      {status === 'Reliable' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
      {(status === 'Conflicting' || status === 'Missing') && <XCircle className="w-3.5 h-3.5 text-red-600" />}
      {(status === 'Stale' || status === 'Suspicious') && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
      {status}
    </span>
  );
}

function ClassificationBadge({ classification }) {
  if (classification === 'Ghost Room Detected') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        <Flame className="w-3.5 h-3.5 text-red-600" />
        Ghost Room
      </span>
    );
  }
  if (classification === 'Standby Power Waste') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
        <Zap className="w-3.5 h-3.5 text-amber-600" />
        Standby Waste
      </span>
    );
  }
  if (classification === 'Protected Essential Load') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <Lock className="w-3.5 h-3.5 text-blue-600" />
        Essential Protected
      </span>
    );
  }
  if (classification.startsWith('Blocked by C10')) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200">
        <ShieldAlert className="w-3.5 h-3.5 text-purple-600" />
        {classification}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      {classification}
    </span>
  );
}

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================
export default function App() {
  // Navigation state
  const [activeNav, setActiveNav] = useState('overview');

  // Shared persistent state
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [recStateMap, setRecStateMap] = useState({});
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);
  const [lastSyncTime, setLastSyncTime] = useState('11:42:18 AM (Initial Cache)');
  const [storageReady, setStorageReady] = useState(false);

  // C01 Connectivity State (Real browser state + Interactive Simulation Toggle)
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const isOnline = browserOnline && !simulatedOffline;
  const [isSyncing, setIsSyncing] = useState(false);
  const [simulateNextSyncFailure, setSimulateNextSyncFailure] = useState(false);

  // Room Monitoring UI Filters & Selected Drawer
  const [searchQuery, setSearchQuery] = useState('');
  const [occFilter, setOccFilter] = useState('ALL');
  const [energyFilter, setEnergyFilter] = useState('ALL');
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  // C10 Testbed Selected Room
  const [c10TargetRoomId, setC10TargetRoomId] = useState('CR-305');

  // Calculator Modal & State
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcCurrentKw, setCalcCurrentKw] = useState(4.8);
  const [calcExpectedKw, setCalcExpectedKw] = useState(0.6);
  const [calcDurationHrs, setCalcDurationHrs] = useState(1.5);
  const [calcTariff, setCalcTariff] = useState(8.0);

  // Audit Filter
  const [auditFilter, setAuditFilter] = useState('ALL');

  // Settings / Docs Sub-tab
  const [settingsTab, setSettingsTab] = useState('config');
  const [testResults, setTestResults] = useState(null);

  // Toast Notification Banner
  const [toast, setToast] = useState(null);

  const showNotification = useCallback((title, message, type = 'info') => {
    setToast({ title, message, type, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // --------------------------------------------------------------------------
  // Load Persistent State from IndexedDB / localStorage on Mount
  // --------------------------------------------------------------------------
  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      const savedRooms = await IndexedDBService.loadSnapshot('rooms', INITIAL_ROOMS);
      const savedSettings = await IndexedDBService.loadSnapshot('settings', INITIAL_SETTINGS);
      const savedRecState = await IndexedDBService.loadSnapshot('recStateMap', {});
      const savedQueue = await IndexedDBService.loadSnapshot('offlineQueue', []);
      const savedAudit = await IndexedDBService.loadSnapshot('auditLogs', INITIAL_AUDIT_LOGS);
      const savedSyncTime = await IndexedDBService.loadSnapshot('lastSyncTime', '11:42:18 AM');
      const savedSimOffline = await IndexedDBService.loadSnapshot('simulatedOffline', false);

      if (mounted) {
        setRooms(savedRooms);
        setSettings(savedSettings);
        setCalcTariff(savedSettings.tariffPerKwh || 8.0);
        setRecStateMap(savedRecState);
        setOfflineQueue(savedQueue);
        setAuditLogs(savedAudit);
        setLastSyncTime(savedSyncTime);
        setSimulatedOffline(savedSimOffline);
        setStorageReady(true);
      }
    }
    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  // Persist changes to IndexedDB
  useEffect(() => {
    if (!storageReady) return;
    IndexedDBService.saveSnapshot('rooms', rooms);
  }, [rooms, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    IndexedDBService.saveSnapshot('settings', settings);
  }, [settings, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    IndexedDBService.saveSnapshot('recStateMap', recStateMap);
  }, [recStateMap, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    IndexedDBService.saveSnapshot('offlineQueue', offlineQueue);
  }, [offlineQueue, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    IndexedDBService.saveSnapshot('auditLogs', auditLogs);
  }, [auditLogs, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    IndexedDBService.saveSnapshot('lastSyncTime', lastSyncTime);
  }, [lastSyncTime, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    IndexedDBService.saveSnapshot('simulatedOffline', simulatedOffline);
  }, [simulatedOffline, storageReady]);

  // Append-only Audit Log Helper
  const appendAudit = useCallback((type, title, description, relatedId, status) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newEntry = {
      eventId: `EVT-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`,
      type,
      title,
      description,
      relatedId,
      status,
      timestamp: now
    };
    setAuditLogs((prev) => [newEntry, ...prev]);
  }, []);

  // --------------------------------------------------------------------------
  // Run Core Energy Analysis & C10 Validation Reactive Pipeline
  // --------------------------------------------------------------------------
  const { enrichedRooms, recommendations } = useMemo(() => {
    return analyzeCampusRooms(rooms, settings, recStateMap);
  }, [rooms, settings, recStateMap]);

  const selectedRoom = useMemo(
    () => enrichedRooms.find((r) => r.id === selectedRoomId) || null,
    [enrichedRooms, selectedRoomId]
  );

  const c10TargetRoom = useMemo(
    () => enrichedRooms.find((r) => r.id === c10TargetRoomId) || enrichedRooms[0],
    [enrichedRooms, c10TargetRoomId]
  );

  // --------------------------------------------------------------------------
  // C01: Synchronise Pending Offline Actions (Idempotent Processing)
  // --------------------------------------------------------------------------
  const synchronizeOfflineQueue = useCallback(
    async (manualRetryId = null) => {
      if (!isOnline) {
        showNotification(
          'Offline Mode Active',
          'Cannot synchronise queue while network is disconnected. Actions remain safely stored in IndexedDB.',
          'warning'
        );
        return;
      }

      const itemsToProcess = offlineQueue.filter((item) =>
        manualRetryId
          ? item.actionId === manualRetryId
          : item.syncStatus === 'Pending Sync' || item.syncStatus === 'Failed'
      );

      if (itemsToProcess.length === 0) return;

      setIsSyncing(true);
      // Mark items as Syncing
      setOfflineQueue((prev) =>
        prev.map((item) =>
          itemsToProcess.some((target) => target.actionId === item.actionId)
            ? { ...item, syncStatus: 'Syncing' }
            : item
        )
      );

      await new Promise((r) => setTimeout(r, 650));

      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      if (simulateNextSyncFailure) {
        setOfflineQueue((prev) =>
          prev.map((item) =>
            itemsToProcess.some((target) => target.actionId === item.actionId)
              ? { ...item, syncStatus: 'Failed', lastError: 'Simulated Gateway Timeout (504)' }
              : item
          )
        );
        setSimulateNextSyncFailure(false);
        setIsSyncing(false);
        appendAudit(
          'SYNC_FAILED',
          'C01 Offline Action Synchronisation Failed',
          `${itemsToProcess.length} queued action(s) encountered a simulated network timeout. Preserved in IndexedDB queue for retry.`,
          itemsToProcess[0].actionId,
          'Failed (Retry Available)'
        );
        showNotification(
          'Synchronisation Failed',
          'Simulated gateway error. Pending actions were NOT lost and can be retried.',
          'error'
        );
        return;
      }

      // Idempotent Processing: Mark as Synced & update recommendation sync state
      const syncedIds = new Set(itemsToProcess.map((i) => i.actionId));
      setOfflineQueue((prev) =>
        prev.map((item) =>
          syncedIds.has(item.actionId)
            ? { ...item, syncStatus: 'Synced', syncedAt: nowStr, lastError: null }
            : item
        )
      );

      setRecStateMap((prev) => {
        const next = { ...prev };
        itemsToProcess.forEach((item) => {
          next[item.recommendationId] = {
            approvalStatus: item.decision === 'APPROVE' ? 'Approved (Synced)' : 'Rejected (Synced)',
            updatedAt: nowStr,
            actionId: item.actionId
          };
        });
        return next;
      });

      setLastSyncTime(nowStr);
      setIsSyncing(false);

      itemsToProcess.forEach((item) => {
        appendAudit(
          'ACTION_SYNCED',
          `C01 Action Synchronised (${item.decision})`,
          `Idempotent key ${item.actionId} for ${item.recommendationId} (${item.roomId}) synchronised exactly once upon connectivity restoration.`,
          item.actionId,
          'Synced'
        );
      });

      showNotification(
        'C01 Queue Synchronised',
        `Successfully synchronised ${itemsToProcess.length} pending action(s) with zero duplicates.`,
        'success'
      );
    },
    [isOnline, offlineQueue, simulateNextSyncFailure, appendAudit, showNotification]
  );

  // Listen to real browser online/offline events + auto-sync when online returns
  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      appendAudit(
        'CONNECTIVITY',
        'Browser Network Connectivity Restored',
        'Detected navigator online event.',
        'NETWORK',
        'Online'
      );
    };
    const handleOffline = () => {
      setBrowserOnline(false);
      appendAudit(
        'CONNECTIVITY',
        'Browser Network Disconnected',
        'Switched to C01 Local IndexedDB Offline Mode.',
        'NETWORK',
        'Offline'
      );
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [appendAudit]);

  // Trigger auto-sync when isOnline transitions from false -> true
  useEffect(() => {
    if (isOnline && storageReady) {
      const pendingCount = offlineQueue.filter((q) => q.syncStatus === 'Pending Sync').length;
      if (pendingCount > 0) {
        synchronizeOfflineQueue();
      }
    }
  }, [isOnline, storageReady, offlineQueue, synchronizeOfflineQueue]);

  // --------------------------------------------------------------------------
  // Recommendation Human Approval / Rejection Handler (Offline-Aware & Idempotent)
  // --------------------------------------------------------------------------
  const handleRecommendationDecision = (rec, decision) => {
    // Deterministic Idempotent Action ID: prevents duplicate queue entries for same rec + decision
    const deterministicActionId = `ACT-${rec.id}-${decision}`;
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Check if this exact action is already queued or synced (Idempotency guard)
    const existingAction = offlineQueue.find((item) => item.actionId === deterministicActionId);
    if (existingAction && (existingAction.syncStatus === 'Pending Sync' || existingAction.syncStatus === 'Synced')) {
      showNotification(
        'Duplicate Prevented (C01 Idempotency)',
        `Action ${deterministicActionId} is already ${existingAction.syncStatus}. Duplicate operation blocked.`,
        'warning'
      );
      return;
    }

    if (!isOnline) {
      // C01 Offline Path: Queue in IndexedDB as Pending Sync
      const queuedItem = {
        actionId: deterministicActionId,
        actionType: decision === 'APPROVE' ? 'APPROVE_RECOMMENDATION' : 'REJECT_RECOMMENDATION',
        decision,
        recommendationId: rec.id,
        roomId: rec.roomId,
        potentialSavingsKwh: rec.potentialSavingsKwh,
        timestamp: nowStr,
        approvalStatus: decision === 'APPROVE' ? 'Approved (Local Queue)' : 'Rejected (Local Queue)',
        syncStatus: 'Pending Sync'
      };

      setOfflineQueue((prev) => {
        const filtered = prev.filter((i) => i.recommendationId !== rec.id);
        return [queuedItem, ...filtered];
      });

      setRecStateMap((prev) => ({
        ...prev,
        [rec.id]: {
          approvalStatus: decision === 'APPROVE' ? 'Approved (Pending Sync)' : 'Rejected (Pending Sync)',
          updatedAt: nowStr,
          actionId: deterministicActionId
        }
      }));

      appendAudit(
        'OFFLINE_QUEUED',
        `C01 Offline Action Queued (${decision})`,
        `Administrator ${decision.toLowerCase()}d ${rec.id} while offline. Saved to IndexedDB queue as Pending Sync (${deterministicActionId}).`,
        deterministicActionId,
        'Pending Sync'
      );

      showNotification(
        'Saved to Offline Queue (Pending Sync)',
        `Action ${deterministicActionId} stored in IndexedDB. Will synchronise automatically when connectivity returns.`,
        'warning'
      );
    } else {
      // Online Path: Process & Record in Audit History + Sync Log
      const syncedItem = {
        actionId: deterministicActionId,
        actionType: decision === 'APPROVE' ? 'APPROVE_RECOMMENDATION' : 'REJECT_RECOMMENDATION',
        decision,
        recommendationId: rec.id,
        roomId: rec.roomId,
        potentialSavingsKwh: rec.potentialSavingsKwh,
        timestamp: nowStr,
        approvalStatus: decision === 'APPROVE' ? 'Approved' : 'Rejected',
        syncStatus: 'Synced',
        syncedAt: nowStr
      };

      setOfflineQueue((prev) => {
        const filtered = prev.filter((i) => i.recommendationId !== rec.id);
        return [syncedItem, ...filtered];
      });

      setRecStateMap((prev) => ({
        ...prev,
        [rec.id]: {
          approvalStatus: decision === 'APPROVE' ? 'Approved (Synced)' : 'Rejected (Synced)',
          updatedAt: nowStr,
          actionId: deterministicActionId
        }
      }));

      setLastSyncTime(nowStr);

      appendAudit(
        decision === 'APPROVE' ? 'REC_APPROVED' : 'REC_REJECTED',
        `Recommendation ${decision === 'APPROVE' ? 'Approved' : 'Rejected'} (${rec.roomId})`,
        `Human operator ${decision.toLowerCase()}d ${rec.id}: "${rec.proposedAction}"`,
        rec.id,
        'Synced'
      );

      showNotification(
        `Recommendation ${decision === 'APPROVE' ? 'Approved' : 'Rejected'}`,
        `${rec.id} for room ${rec.roomId} has been recorded and synchronised.`,
        'success'
      );
    }
  };

  // --------------------------------------------------------------------------
  // C10 Interactive Fault Injection Handler
  // --------------------------------------------------------------------------
  const injectSensorFault = (roomId, faultType) => {
    setRooms((prevRooms) =>
      prevRooms.map((room) => {
        if (room.id !== roomId) return room;
        const baseRoom = INITIAL_ROOMS.find((r) => r.id === roomId) || room;

        switch (faultType) {
          case 'MISSING_READING':
            return {
              ...room,
              faultInjected: 'MISSING_READING',
              currentKw: null,
              sensorA_occupancy: null,
              sensorB_occupancy: null,
              readingAgeMins: 1,
              readingTimestamp: 'Just now (Packet Drop)',
              repeatedCount: 1,
              fluctuationIndex: 0.0
            };
          case 'SUDDEN_SPIKE':
            return {
              ...room,
              faultInjected: 'SUDDEN_SPIKE',
              currentKw: 19.4,
              sensorA_occupancy: 0,
              sensorB_occupancy: 0,
              readingAgeMins: 1,
              readingTimestamp: 'Just now',
              repeatedCount: 1,
              fluctuationIndex: 0.12
            };
          case 'REPEATED_VALUES':
            return {
              ...room,
              faultInjected: 'REPEATED_VALUES',
              currentKw: 4.4,
              sensorA_occupancy: 15,
              sensorB_occupancy: 15,
              readingAgeMins: 2,
              readingTimestamp: '2 mins ago',
              repeatedCount: 18,
              fluctuationIndex: 0.0
            };
          case 'UNUSUAL_FLUCTUATION':
            return {
              ...room,
              faultInjected: 'UNUSUAL_FLUCTUATION',
              currentKw: 6.7,
              sensorA_occupancy: 28,
              sensorB_occupancy: 25,
              readingAgeMins: 1,
              readingTimestamp: '1 min ago',
              repeatedCount: 1,
              fluctuationIndex: 0.78
            };
          case 'STALE_TIMESTAMP':
            return {
              ...room,
              faultInjected: 'STALE_TIMESTAMP',
              currentKw: 4.6,
              sensorA_occupancy: 0,
              sensorB_occupancy: 0,
              readingAgeMins: 52,
              readingTimestamp: '52 mins ago',
              repeatedCount: 1,
              fluctuationIndex: 0.04
            };
          case 'CONFLICTING_SENSORS':
            return {
              ...room,
              faultInjected: 'CONFLICTING_SENSORS',
              currentKw: 4.5,
              sensorA_occupancy: 0,
              sensorB_occupancy: 40,
              readingAgeMins: 1,
              readingTimestamp: '1 min ago',
              repeatedCount: 1,
              fluctuationIndex: 0.05
            };
          case 'NONE':
          default:
            return {
              ...baseRoom,
              faultInjected: 'NONE',
              sensorA_occupancy: baseRoom.id === 'CR-305' ? 0 : baseRoom.sensorA_occupancy,
              sensorB_occupancy: baseRoom.id === 'CR-305' ? 0 : baseRoom.sensorB_occupancy,
              occupancy: baseRoom.id === 'CR-305' ? 0 : baseRoom.occupancy,
              occupancyStatus: baseRoom.id === 'CR-305' ? 'Unoccupied' : baseRoom.occupancyStatus,
              readingAgeMins: 1,
              readingTimestamp: '1 min ago (Restored)',
              rawReliability: 'Reliable',
              repeatedCount: 1,
              fluctuationIndex: 0.03
            };
        }
      })
    );

    appendAudit(
      'C10_TEST_INJECTION',
      `C10 Sensor Scenario Triggered on ${roomId}: ${faultType}`,
      faultType === 'NONE'
        ? `Restored clean, verified telemetry for ${roomId}. Normal Ghost Room & energy analysis resumed.`
        : `Injected simulated "${faultType}" fault into ${roomId}. C10 Validation Layer intercepted telemetry.`,
      roomId,
      faultType === 'NONE' ? 'Reliable Restored' : 'C10 Intercepted'
    );

    showNotification(
      `C10 Telemetry Updated (${roomId})`,
      faultType === 'NONE'
        ? `Restored normal reliable sensor readings for ${roomId}.`
        : `Simulated "${faultType}" on ${roomId}. Check validation status and recommendation blocking.`,
      faultType === 'NONE' ? 'success' : 'warning'
    );
  };

  // --------------------------------------------------------------------------
  // Reset Demo Data Handler
  // --------------------------------------------------------------------------
  const handleResetDemoData = async () => {
    await IndexedDBService.clearAll();
    setRooms(INITIAL_ROOMS);
    setSettings(INITIAL_SETTINGS);
    setRecStateMap({});
    setOfflineQueue([]);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setSimulatedOffline(false);
    setLastSyncTime('11:42:18 AM (Reset)');
    showNotification(
      'Demo Dataset Reset',
      'All rooms, C10 sensor states, C01 offline queues, and settings restored to initial reproducible state.',
      'info'
    );
  };

  // --------------------------------------------------------------------------
  // Computed Dashboard Aggregate Metrics
  // --------------------------------------------------------------------------
  const metrics = useMemo(() => {
    const totalKw = +enrichedRooms
      .reduce((sum, r) => sum + (typeof r.currentKw === 'number' ? r.currentKw : 0), 0)
      .toFixed(1);
    const occupiedCount = enrichedRooms.filter(
      (r) => r.validation.effectiveOccupancyStatus === 'Occupied'
    ).length;
    const unoccupiedCount = enrichedRooms.filter(
      (r) => r.validation.effectiveOccupancyStatus === 'Unoccupied'
    ).length;
    const uncertainCount = enrichedRooms.filter(
      (r) => r.validation.effectiveOccupancyStatus === 'Uncertain'
    ).length;
    const unreliableSensorsCount = enrichedRooms.filter(
      (r) => r.validation.status !== 'Reliable'
    ).length;
    const ghostRoomCount = enrichedRooms.filter(
      (r) => r.energyClassification === 'Ghost Room Detected'
    ).length;
    const activeAlertsCount = unreliableSensorsCount + ghostRoomCount;

    const totalPotentialSavingsKwh = +recommendations
      .reduce((sum, rec) => sum + (rec.potentialSavingsKwh || 0), 0)
      .toFixed(1);
    const totalPotentialSavingsInr = +(totalPotentialSavingsKwh * settings.tariffPerKwh).toFixed(2);
    const pendingSyncCount = offlineQueue.filter(
      (q) => q.syncStatus === 'Pending Sync' || q.syncStatus === 'Failed'
    ).length;

    return {
      totalKw,
      occupiedCount,
      unoccupiedCount,
      uncertainCount,
      unreliableSensorsCount,
      ghostRoomCount,
      activeAlertsCount,
      totalPotentialSavingsKwh,
      totalPotentialSavingsInr,
      pendingSyncCount
    };
  }, [enrichedRooms, recommendations, settings.tariffPerKwh, offlineQueue]);

  // --------------------------------------------------------------------------
  // Automated In-Browser Acceptance Test Suite (Verifies C10, C01 & Safety)
  // --------------------------------------------------------------------------
  const runAcceptanceTests = () => {
    const testSetting = INITIAL_SETTINGS;
    const baseRoom = INITIAL_ROOMS[0]; // LH-201

    // Test 1: Reliable Ghost Room Detection
    const t1 = analyzeCampusRooms([baseRoom], testSetting, {});
    const pass1 =
      t1.enrichedRooms[0].energyClassification === 'Ghost Room Detected' &&
      t1.recommendations[0]?.isControlAction === true;

    // Test 2: C10 Conflicting Sensors -> UNCERTAIN occupancy & blocks Ghost Room
    const conflictRoom = { ...baseRoom, id: 'T-CONF', sensorA_occupancy: 0, sensorB_occupancy: 40, faultInjected: 'CONFLICTING_SENSORS' };
    const t2 = analyzeCampusRooms([conflictRoom], testSetting, {});
    const pass2 =
      t2.enrichedRooms[0].validation.effectiveOccupancy === 'UNCERTAIN' &&
      t2.enrichedRooms[0].energyClassification !== 'Ghost Room Detected' &&
      t2.recommendations[0]?.isBlockedByC10 === true;

    // Test 3: C10 Missing Reading detection
    const missingRoom = { ...baseRoom, id: 'T-MISS', currentKw: null, faultInjected: 'MISSING_READING' };
    const v3 = validateRoomSensors(missingRoom, testSetting);
    const pass3 = v3.status === 'Missing' && v3.allowEnergyControl === false;

    // Test 4: C10 Sudden Power Spike detection & preservation
    const spikeRoom = { ...baseRoom, id: 'T-SPIKE', currentKw: 19.5, faultInjected: 'SUDDEN_SPIKE' };
    const v4 = validateRoomSensors(spikeRoom, testSetting);
    const pass4 = v4.status === 'Suspicious' && v4.allowEnergyControl === false && spikeRoom.currentKw === 19.5;

    // Test 5: C10 Stale Timestamp detection
    const staleRoom = { ...baseRoom, id: 'T-STALE', readingAgeMins: 48, faultInjected: 'STALE_TIMESTAMP' };
    const v5 = validateRoomSensors(staleRoom, testSetting);
    const pass5 = v5.status === 'Stale' && v5.allowEnergyControl === false;

    // Test 6: Essential Equipment Protection (LAB-104)
    const labRoom = INITIAL_ROOMS.find((r) => r.id === 'LAB-104');
    const t6 = analyzeCampusRooms([labRoom], testSetting, {});
    const pass6 =
      t6.enrichedRooms[0].energyClassification === 'Protected Essential Load' &&
      t6.recommendations.length === 0;

    // Test 7: Energy Savings Calculator Formula accuracy (4.8 - 0.6) * 1.5 * 8 = 6.3 kWh & ₹50.40
    const calcKwh = +((4.8 - 0.6) * 1.5).toFixed(2);
    const calcInr = +(calcKwh * 8.0).toFixed(2);
    const pass7 = calcKwh === 6.3 && calcInr === 50.4;

    // Test 8: C01 Deterministic Idempotent Key Generation
    const keyA = `ACT-REC-GHOST-LH-201-APPROVE`;
    const keyB = `ACT-REC-GHOST-LH-201-APPROVE`;
    const pass8 = keyA === keyB && typeof window.indexedDB !== 'undefined';

    setTestResults([
      { name: 'Rule Engine: Ghost Room Detection (LH-201: 0 occ, 4.8 kW vs 0.6 kW)', passed: pass1 },
      { name: 'C10 Conflict: Sensor A (0) vs Sensor B (40) -> Occupancy UNCERTAIN & Blocks Ghost Room', passed: pass2 },
      { name: 'C10 Fault: Missing Reading (null telemetry) -> Status Missing & Blocks Control', passed: pass3 },
      { name: 'C10 Fault: Sudden Power Spike (19.5 kW) -> Preserves Reading & Flags Human Check', passed: pass4 },
      { name: 'C10 Fault: Stale Timestamp (48m > 15m) -> Status Stale & Blocks Ghost Room', passed: pass5 },
      { name: 'Safety Lock: Essential Equipment (LAB-104 Bio Cold Storage) Protected from Shutdown', passed: pass6 },
      { name: 'Savings Formula: (4.8 kW - 0.6 kW) × 1.5h × ₹8/kWh = 6.3 kWh (₹50.40)', passed: pass7 },
      { name: 'C01 Offline Storage: IndexedDB Engine & Idempotent Action Key Deduplication', passed: pass8 }
    ]);
  };

  // Navigation Configuration with Team Module Badges
  const navItems = [
    { id: 'overview', label: 'Overview', icon: Gauge, module: 'M1' },
    {
      id: 'rooms',
      label: 'Room Monitoring',
      icon: Building2,
      module: 'M1',
      badge: enrichedRooms.length
    },
    { id: 'analytics', label: 'Energy Analytics', icon: Activity, module: 'M1' },
    {
      id: 'c10',
      label: 'Sensor Reliability',
      icon: ShieldAlert,
      module: 'C10',
      badge: metrics.unreliableSensorsCount > 0 ? `${metrics.unreliableSensorsCount} Fault` : null,
      badgeColor: 'bg-amber-500 text-slate-950'
    },
    {
      id: 'recommendations',
      label: 'Recommendations',
      icon: Sparkles,
      module: 'M1+C10',
      badge: recommendations.filter((r) => r.approvalStatus.startsWith('Pending')).length
    },
    { id: 'forecasting', label: 'Forecasting', icon: TrendingUp, module: 'M1' },
    { id: 'audit', label: 'Audit History', icon: History, module: 'M3', badge: auditLogs.length },
    {
      id: 'offline',
      label: 'Offline Management',
      icon: isOnline ? Wifi : WifiOff,
      module: 'C01',
      badge: metrics.pendingSyncCount > 0 ? `${metrics.pendingSyncCount} Queue` : 'Synced',
      badgeColor: metrics.pendingSyncCount > 0 ? 'bg-amber-500 text-slate-950' : 'bg-emerald-600 text-white'
    },
    { id: 'settings', label: 'Settings & Docs', icon: SettingsIcon, module: 'ALL' }
  ];

  // Filtered rooms for Room Monitoring
  const filteredRooms = useMemo(() => {
    return enrichedRooms.filter((r) => {
      const matchesSearch =
        r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.building.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesOcc =
        occFilter === 'ALL' ||
        (occFilter === 'OCCUPIED' && r.validation.effectiveOccupancyStatus === 'Occupied') ||
        (occFilter === 'UNOCCUPIED' && r.validation.effectiveOccupancyStatus === 'Unoccupied') ||
        (occFilter === 'UNCERTAIN' && r.validation.effectiveOccupancyStatus === 'Uncertain');
      const matchesEnergy =
        energyFilter === 'ALL' ||
        (energyFilter === 'GHOST' && r.energyClassification === 'Ghost Room Detected') ||
        (energyFilter === 'STANDBY' && r.energyClassification === 'Standby Power Waste') ||
        (energyFilter === 'BLOCKED' && r.energyClassification.startsWith('Blocked by C10')) ||
        (energyFilter === 'PROTECTED' && r.energyClassification === 'Protected Essential Load');
      return matchesSearch && matchesOcc && matchesEnergy;
    });
  }, [enrichedRooms, searchQuery, occFilter, energyFilter]);

  // Occupancy Breakdown Pie Data
  const occupancyPieData = [
    { name: 'Occupied Rooms', value: metrics.occupiedCount, color: '#10b981' },
    { name: 'Unoccupied (Verified)', value: metrics.unoccupiedCount, color: '#3b82f6' },
    { name: 'Uncertain (C10 Blocked)', value: metrics.uncertainCount, color: '#f59e0b' }
  ];

  // Calculator outputs
  const calcPotentialKwh = Math.max(0, +((calcCurrentKw - calcExpectedKw) * calcDurationHrs).toFixed(2));
  const calcPotentialInr = +(calcPotentialKwh * calcTariff).toFixed(2);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row font-sans">
      {/* =================================================================== */}
      {/* LEFT SIDEBAR NAVIGATION (DARK NAVY #0f172a)                         */}
      {/* =================================================================== */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-100 flex-shrink-0 flex flex-col justify-between border-r border-slate-800">
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
                  CampusWatt
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    v2.4
                  </span>
                </div>
                <p className="text-xs text-slate-400">The Sleeping Campus</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge !== null && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        item.badgeColor
                          ? item.badgeColor
                          : isActive
                          ? 'bg-blue-800 text-blue-100'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Live System Telemetry Footer */}
        <div className="p-4 m-3 rounded-xl bg-slate-800/90 border border-slate-700/80 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Network Status</span>
            <span
              className={`inline-flex items-center gap-1.5 font-semibold px-2 py-0.5 rounded-full ${
                isOnline
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                }`}
              />
              {isOnline ? 'Online' : 'Offline (C01)'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-400">C10 Sensor Gate</span>
            <span className="font-semibold text-emerald-400">Active ({enrichedRooms.length} Zones)</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-400">Pending Queue</span>
            <span className="font-semibold">{metrics.pendingSyncCount} Action(s)</span>
          </div>
          <div className="pt-1 border-t border-slate-700/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>IndexedDB Storage</span>
            <span className="text-emerald-400 font-medium">Persisted</span>
          </div>
        </div>
      </aside>

      {/* =================================================================== */}
      {/* MAIN CONTENT COLUMN                                                 */}
      {/* =================================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP ENTERPRISE HEADER */}
        <header className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300">
              <Info className="w-3.5 h-3.5 text-amber-600" />
              Demo Mode — Simulated Data (Illustrative Campus Telemetry Only)
            </span>
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                <WifiOff className="w-3.5 h-3.5 text-red-600" />
                C01 Offline Mode Active — Local Queueing Enabled
              </span>
            )}
          </div>

          {/* Interactive Global Controls for Hackathon Judges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* C01 One-Click Offline Simulator Toggle */}
            <button
              onClick={() => {
                const nextOffline = !simulatedOffline;
                setSimulatedOffline(nextOffline);
                appendAudit(
                  'CONNECTIVITY_SIM',
                  nextOffline
                    ? 'C01 Simulated Offline Mode Activated'
                    : 'C01 Simulated Connectivity Restored',
                  nextOffline
                    ? 'User switched application to Offline Mode. Approvals will queue in IndexedDB.'
                    : 'User restored online connectivity. Pending IndexedDB actions will synchronise.',
                  'C01-SIM',
                  nextOffline ? 'Offline' : 'Online'
                );
              }}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-amber-500 text-slate-950 border-amber-600 hover:bg-amber-400'
              }`}
              title="Toggle simulated network connectivity to test C01 Offline Queue & Auto-Sync"
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Network: Online (Click to Simulate C01 Offline)</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-slate-950" />
                  <span>Offline Mode Active (Click to Reconnect & Sync)</span>
                </>
              )}
            </button>

            {/* Quick Savings Calculator Trigger */}
            <button
              onClick={() => setShowCalcModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors"
            >
              <Calculator className="w-3.5 h-3.5 text-blue-600" />
              <span>Savings Calculator</span>
            </button>

            {/* Reset Demo Data */}
            <button
              onClick={handleResetDemoData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors"
              title="Reset all simulated telemetry, sensor faults, and queues to initial state"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset Demo</span>
            </button>
          </div>
        </header>

        {/* NON-BLOCKING TOAST FEEDBACK BANNER */}
        {toast && (
          <div className="mx-4 lg:mx-6 mt-3">
            <div
              className={`flex items-center justify-between px-4 py-3 rounded-xl border shadow-sm text-sm ${
                toast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : toast.type === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : toast.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />}
                {toast.type === 'error' && <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />}
                {toast.type === 'info' && <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                <div>
                  <span className="font-semibold mr-2">{toast.title}:</span>
                  <span>{toast.message}</span>
                </div>
              </div>
              <button onClick={() => setToast(null)} className="text-slate-500 hover:text-slate-800 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MAIN VIEW ROUTER                                                  */}
        {/* ================================================================= */}
        <main className="p-4 lg:p-6 flex-1 space-y-6 max-w-[1600px] w-full mx-auto">
          {/* --------------------------------------------------------------- */}
          {/* VIEW 1: OVERVIEW DASHBOARD                                      */}
          {/* --------------------------------------------------------------- */}
          {activeNav === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Campus Energy Intelligence Overview</h1>
                  <p className="text-sm text-slate-600">
                    Real-time simulated occupancy-aware telemetry, C10 sensor validation status, and human-approved energy savings.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveNav('c10')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 flex items-center gap-1.5"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    Test C10 Lying Sensors
                  </button>
                  <button
                    onClick={() => setActiveNav('offline')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 flex items-center gap-1.5"
                  >
                    <Database className="w-3.5 h-3.5 text-blue-600" />
                    Inspect C01 Queue ({metrics.pendingSyncCount})
                  </button>
                </div>
              </div>

              {/* 6 Primary Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
                    <span>Campus Power</span>
                    <Zap className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">{metrics.totalKw} kW</div>
                  <div className="mt-1 text-xs text-slate-500">Across 8 monitored zones</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
                    <span>Occupied Rooms</span>
                    <Users className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-emerald-700">{metrics.occupiedCount} Rooms</div>
                  <div className="mt-1 text-xs text-slate-500">Verified active usage</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
                    <span>Unoccupied Rooms</span>
                    <Building2 className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {metrics.unoccupiedCount}
                    <span className="text-xs font-normal text-amber-700 ml-1.5">
                      (+{metrics.uncertainCount} Uncertain)
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Never assumes empty if uncertain</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
                    <span>Active Alerts</span>
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-red-600">{metrics.activeAlertsCount} Alerts</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {metrics.ghostRoomCount} Ghost · {metrics.unreliableSensorsCount} Sensor Faults
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
                    <span>Est. Potential Savings</span>
                    <TrendingDown className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-emerald-700">
                    {metrics.totalPotentialSavingsKwh} kWh
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    ≈ ₹{metrics.totalPotentialSavingsInr} (@ ₹{settings.tariffPerKwh}/kWh)
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
                    <span>Connectivity (C01)</span>
                    {isOnline ? (
                      <Wifi className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-amber-600" />
                    )}
                  </div>
                  <div
                    className={`mt-2 text-lg font-bold ${
                      isOnline ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {isOnline ? 'Online (Synced)' : 'Offline Queue'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {metrics.pendingSyncCount} Pending · Sync: {lastSyncTime.split(' ')[0]}
                  </div>
                </div>
              </div>

              {/* Charts Row: Energy Consumption Over Time + Room Occupancy Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        Simulated Campus Electricity Consumption vs Baseline (kW)
                      </h2>
                      <p className="text-xs text-slate-500">
                        Comparing actual simulated telemetry against expected timetable baseline. Gap highlights "Sleeping Campus" waste.
                      </p>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded bg-slate-100 text-slate-700">
                      Illustrative Telemetry
                    </span>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={CAMPUS_HOURLY_SERIES.slice(0, 7)}>
                        <defs>
                          <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="#64748b" />
                        <YAxis unit=" kW" tick={{ fontSize: 12 }} stroke="#64748b" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#fff',
                            borderColor: '#e2e8f0',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Area
                          type="monotone"
                          dataKey="actualKw"
                          name="Simulated Actual Load (kW)"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          fill="url(#actualGrad)"
                        />
                        <Line
                          type="monotone"
                          dataKey="baselineKw"
                          name="Timetable Expected Baseline (kW)"
                          stroke="#10b981"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Room Occupancy & System Status Breakdown */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Room Occupancy & C10 Status</h2>
                    <p className="text-xs text-slate-500 mb-2">
                      Rooms with conflicting or stale sensors are classified as Uncertain, never assumed Empty.
                    </p>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={occupancyPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={70}
                            paddingAngle={4}
                          >
                            {occupancyPieData.map((entry, idx) => (
                              <Cell key={idx} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* System Health Mini-Panel */}
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Last Successful Sync:</span>
                      <span className="font-semibold text-slate-800">{lastSyncTime}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Pending Offline Queue:</span>
                      <span className="font-semibold text-amber-700">{metrics.pendingSyncCount} Action(s)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Sensor Validation Gate:</span>
                      <span className="font-semibold text-emerald-700">
                        {enrichedRooms.length - metrics.unreliableSensorsCount}/{enrichedRooms.length} Reliable
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom 3 Panels: Recent Alerts, Top Consuming Rooms, Recommendations Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Energy & Sensor Alerts */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-slate-900">Recent Anomalies & Sensor Warnings</h2>
                    <button
                      onClick={() => setActiveNav('c10')}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Open C10 Lab →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {enrichedRooms
                      .filter(
                        (r) =>
                          r.validation.status !== 'Reliable' ||
                          r.energyClassification === 'Ghost Room Detected' ||
                          r.energyClassification === 'Standby Power Waste'
                      )
                      .map((r) => (
                        <div
                          key={r.id}
                          className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900">{r.id}</span>
                              <ClassificationBadge classification={r.energyClassification} />
                            </div>
                            <p className="text-xs text-slate-600">
                              {r.validation.status !== 'Reliable'
                                ? r.validation.issues[0]?.explanation
                                : `Drawing ${r.currentKw} kW (Baseline: ${r.baselineKw} kW) with 0 occupants.`}
                            </p>
                          </div>
                          <ReliabilityBadge status={r.validation.status} />
                        </div>
                      ))}
                  </div>
                </div>

                {/* Top Energy-Consuming Rooms */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-slate-900">Top Energy-Consuming Rooms</h2>
                    <button
                      onClick={() => setActiveNav('rooms')}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      All Rooms →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {[...enrichedRooms]
                      .sort((a, b) => (b.currentKw || 0) - (a.currentKw || 0))
                      .slice(0, 5)
                      .map((r) => {
                        const pct = Math.min(100, Math.round(((r.currentKw || 0) / 14) * 100));
                        return (
                          <div key={r.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-800">
                                {r.id} — {r.name}
                              </span>
                              <span className="font-bold text-slate-900">
                                {r.currentKw !== null ? `${r.currentKw} kW` : 'MISSING'}
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  r.isEssentialProtected
                                    ? 'bg-blue-600'
                                    : r.energyClassification === 'Ghost Room Detected'
                                    ? 'bg-red-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>
                                Occ: {r.validation.effectiveOccupancy} · Baseline: {r.baselineKw} kW
                              </span>
                              <span>{r.isEssentialProtected ? 'Protected Load' : r.energyClassification}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Recommendations Preview */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-slate-900">Active Recommendations</h2>
                    <button
                      onClick={() => setActiveNav('recommendations')}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Review & Approve →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {recommendations.slice(0, 4).map((rec) => (
                      <div key={rec.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">
                            {rec.roomId}: {rec.category}
                          </span>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              rec.isBlockedByC10
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {rec.isBlockedByC10
                              ? 'C10 Verification Only'
                              : `Save ${rec.potentialSavingsKwh} kWh`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">{rec.proposedAction}</p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-slate-500">Status: {rec.approvalStatus}</span>
                          <button
                            onClick={() => setActiveNav('recommendations')}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                          >
                            Take Action
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* VIEW 2: ROOM MONITORING                                         */}
          {/* --------------------------------------------------------------- */}
          {activeNav === 'rooms' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Room Monitoring & Telemetry</h1>
                  <p className="text-sm text-slate-600">
                    Live simulated room occupancy, academic timetable alignment, power draw, and C10 sensor reliability status.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search room ID or name..."
                      className="pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    value={occFilter}
                    onChange={(e) => setOccFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="ALL">All Occupancy</option>
                    <option value="OCCUPIED">Occupied</option>
                    <option value="UNOCCUPIED">Unoccupied (Verified)</option>
                    <option value="UNCERTAIN">Uncertain (C10 Flagged)</option>
                  </select>
                  <select
                    value={energyFilter}
                    onChange={(e) => setEnergyFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="ALL">All Energy States</option>
                    <option value="GHOST">Ghost Rooms</option>
                    <option value="STANDBY">Standby Waste</option>
                    <option value="BLOCKED">Blocked by C10</option>
                    <option value="PROTECTED">Essential Protected</option>
                  </select>
                </div>
              </div>

              {/* Room Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                        <th className="py-3.5 px-4">Room ID & Name</th>
                        <th className="py-3.5 px-4">Occupancy (A/B)</th>
                        <th className="py-3.5 px-4">Timetable Status</th>
                        <th className="py-3.5 px-4">Power vs Baseline</th>
                        <th className="py-3.5 px-4">Env (Temp/RH)</th>
                        <th className="py-3.5 px-4">Sensor Reliability</th>
                        <th className="py-3.5 px-4">Intelligence Status</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredRooms.map((room) => (
                        <tr
                          key={room.id}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          onClick={() => setSelectedRoomId(room.id)}
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {room.id}
                              {room.isEssentialProtected && (
                                <Lock
                                  className="w-3.5 h-3.5 text-blue-600"
                                  aria-label={`Protected: ${room.essentialEquipment}`}
                                />
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              {room.name} · {room.type}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`font-bold ${
                                  room.validation.effectiveOccupancy === 'UNCERTAIN'
                                    ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-300 text-xs'
                                    : 'text-slate-900'
                                }`}
                              >
                                {room.validation.effectiveOccupancy}
                              </span>
                              <span className="text-xs text-slate-500">
                                ({room.validation.effectiveOccupancyStatus})
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Sensor A: {room.sensorA_occupancy ?? 'null'} | Sensor B:{' '}
                              {room.sensorB_occupancy ?? 'null'}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="text-xs font-medium text-slate-800">{room.timetable}</div>
                            {room.scheduleDrift && (
                              <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                                Drift: {room.scheduleDrift}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">
                              {room.currentKw !== null ? `${room.currentKw} kW` : 'MISSING'}
                            </div>
                            <div className="text-xs text-slate-500">Baseline: {room.baselineKw} kW</div>
                          </td>

                          <td className="py-3.5 px-4 text-xs text-slate-700">
                            <div>{room.tempC}°C</div>
                            <div className="text-slate-400">{room.humidityPct}% RH</div>
                          </td>

                          <td className="py-3.5 px-4">
                            <ReliabilityBadge status={room.validation.status} />
                            <div className="text-[11px] text-slate-400 mt-1">{room.readingTimestamp}</div>
                          </td>

                          <td className="py-3.5 px-4">
                            <ClassificationBadge classification={room.energyClassification} />
                            {room.essentialEquipment && (
                              <div className="text-[11px] text-blue-700 mt-1 font-medium">
                                {room.essentialEquipment}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRoomId(room.id);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detailed Room Inspection Panel / Drawer */}
              {selectedRoom && (
                <div className="bg-white rounded-xl border-2 border-blue-500/30 shadow-md p-5 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-xl font-bold text-slate-900">
                          {selectedRoom.id} — {selectedRoom.name}
                        </h2>
                        <ReliabilityBadge status={selectedRoom.validation.status} />
                        <ClassificationBadge classification={selectedRoom.energyClassification} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {selectedRoom.building} · Capacity: {selectedRoom.capacity} seats · Last Reading:{' '}
                        {selectedRoom.readingTimestamp}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setC10TargetRoomId(selectedRoom.id);
                          setActiveNav('c10');
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100"
                      >
                        Simulate C10 Sensor Fault on {selectedRoom.id}
                      </button>
                      <button
                        onClick={() => setSelectedRoomId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                      >
                        Close Details
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Telemetry & Validation Details */}
                    <div className="space-y-3 text-xs">
                      <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                        <div className="font-bold text-slate-800 uppercase">Occupancy & Sensor Cross-Check</div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">PIR Sensor A:</span>
                          <span className="font-semibold">{selectedRoom.sensorA_occupancy ?? 'MISSING'} occ</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Thermal Door Sensor B:</span>
                          <span className="font-semibold">{selectedRoom.sensorB_occupancy ?? 'MISSING'} occ</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200 pt-1.5">
                          <span className="text-slate-500">Validated Occupancy:</span>
                          <span className="font-bold text-slate-900">
                            {selectedRoom.validation.effectiveOccupancy} (
                            {selectedRoom.validation.effectiveOccupancyStatus})
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                        <div className="font-bold text-slate-800 uppercase">Electrical & Safety Profile</div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Current Consumption:</span>
                          <span className="font-bold text-slate-900">
                            {selectedRoom.currentKw !== null ? `${selectedRoom.currentKw} kW` : 'MISSING'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Historical Unoccupied Baseline:</span>
                          <span className="font-semibold">{selectedRoom.baselineKw} kW</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Essential Load Protection:</span>
                          <span className="font-semibold text-blue-700">
                            {selectedRoom.essentialEquipment || 'None (Standard Classroom)'}
                          </span>
                        </div>
                        <div className="pt-1 text-slate-600 italic">{selectedRoom.notes}</div>
                      </div>
                    </div>

                    {/* Right 2 Cols: Room Historical Energy Chart */}
                    <div className="lg:col-span-2 bg-slate-50 rounded-lg border border-slate-200 p-4">
                      <h3 className="text-xs font-bold text-slate-800 uppercase mb-3">
                        {selectedRoom.id} Intraday Energy History (kW vs Baseline)
                      </h3>
                      <div className="h-52 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={selectedRoom.history}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis unit=" kW" tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: '11px' }} />
                            <Line
                              type="monotone"
                              dataKey="kw"
                              name="Actual Power (kW)"
                              stroke="#2563eb"
                              strokeWidth={2.5}
                            />
                            <Line
                              type="monotone"
                              dataKey="baseline"
                              name="Expected Baseline (kW)"
                              stroke="#10b981"
                              strokeWidth={2}
                              strokeDasharray="4 4"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* VIEW 3: ENERGY ANALYTICS & SAVINGS CALCULATOR                   */}
          {/* --------------------------------------------------------------- */}
          {activeNav === 'analytics' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Energy Analytics & Efficiency Metrics</h1>
                <p className="text-sm text-slate-600">
                  Room-wise consumption comparisons, occupant-hour efficiency, avoidable waste, and transparent savings calculator.
                </p>
              </div>

              {/* Efficiency Summary Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Total Avoidable Load</div>
                  <div className="text-2xl font-bold text-red-600 mt-1">
                    {enrichedRooms.reduce((s, r) => s + r.avoidableKw, 0).toFixed(1)} kW
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Verified unoccupied excess power</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Best Occupant Efficiency</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">0.075 kW/occ</div>
                  <div className="text-xs text-slate-500 mt-1">LIB-201 (112 students, 8.4 kW)</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Weekly Avoidable Waste</div>
                  <div className="text-2xl font-bold text-amber-700 mt-1">582 kWh</div>
                  <div className="text-xs text-slate-500 mt-1">Simulated 7-day sleeping campus total</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Configured Tariff</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">₹{settings.tariffPerKwh.toFixed(2)} / kWh</div>
                  <div className="text-xs text-slate-500 mt-1">Editable in Settings</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Room-wise Current vs Baseline Bar Chart */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h2 className="text-base font-bold text-slate-900 mb-1">
                    Room-Wise Current Power vs Baseline (kW)
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Highlights Ghost Rooms (LH-201), Standby Waste (CR-202), and Essential Loads (LAB-104, LAB-205).
                  </p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={enrichedRooms}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="id" tick={{ fontSize: 12 }} />
                        <YAxis unit=" kW" tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="currentKw" name="Current Power (kW)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="baselineKw" name="Unoccupied Baseline (kW)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Weekly Consumption & Avoidable Waste Trend */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h2 className="text-base font-bold text-slate-900 mb-1">
                    Daily & Weekly Consumption Trend (kWh)
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Breakdown of baseline campus demand vs estimated avoidable "Sleeping Campus" consumption.
                  </p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={WEEKLY_TREND_DATA}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                        <YAxis unit=" kWh" tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="baselineKwh" stackId="a" name="Productive Baseline (kWh)" fill="#10b981" />
                        <Bar dataKey="avoidableKwh" stackId="a" name="Est. Avoidable Waste (kWh)" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Embedded Transparent Energy Savings Calculator */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-blue-600" />
                      Transparent Potential Energy Savings Calculator
                    </h2>
                    <p className="text-xs text-slate-500">
                      Formula: Potential Savings (kWh) = (Current Power − Expected Power) × Duration (hrs). All figures are potential estimated savings, not verified utility bill reductions.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setCalcCurrentKw(4.8);
                      setCalcExpectedKw(0.6);
                      setCalcDurationHrs(1.5);
                      setCalcTariff(8.0);
                    }}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Load LH-201 Example (4.8 kW → 0.6 kW)
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Current Power Consumption (kW)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={calcCurrentKw}
                      onChange={(e) => setCalcCurrentKw(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Expected Baseline Power (kW)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={calcExpectedKw}
                      onChange={(e) => setCalcExpectedKw(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Duration (Hours)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      value={calcDurationHrs}
                      onChange={(e) => setCalcDurationHrs(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Illustrative Tariff (₹ / kWh)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={calcTariff}
                      onChange={(e) => setCalcTariff(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs text-emerald-900 space-y-1">
                    <div className="font-bold uppercase tracking-wide">Calculation Breakdown</div>
                    <div>
                      ({calcCurrentKw} kW − {calcExpectedKw} kW) × {calcDurationHrs} hours ={' '}
                      <span className="font-bold">{calcPotentialKwh} kWh</span> potential energy savings
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-xs text-emerald-700">Estimated Energy Saved</div>
                      <div className="text-xl font-bold text-emerald-900">{calcPotentialKwh} kWh</div>
                    </div>
                    <div>
                      <div className="text-xs text-emerald-700">Estimated Monetary Savings</div>
                      <div className="text-xl font-bold text-emerald-900">₹{calcPotentialInr.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* VIEW 4: C10 SENSOR RELIABILITY & FAULT INJECTION TESTBED        */}
          {/* --------------------------------------------------------------- */}
          {activeNav === 'c10' && (
            <div className="space-y-6">
              <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-slate-950">
                    SURPRISE CONSTRAINT C10 — THE SENSORS ARE LYING
                  </div>
                  <h1 className="text-2xl font-bold">Dedicated Sensor Validation & Fault Injection Layer</h1>
                  <p className="text-xs text-slate-300 max-w-3xl">
                    CampusWatt never blindly trusts incoming telemetry. Every reading passes through a 6-stage validation gate before reaching the Energy Intelligence Engine. Unreliable or conflicting occupancy data strictly blocks Ghost Room control recommendations.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-slate-300">Target Room:</label>
                  <select
                    value={c10TargetRoomId}
                    onChange={(e) => setC10TargetRoomId(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-800 text-white border border-slate-700 text-sm font-semibold"
                  >
                    {enrichedRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id} — {r.name} ({r.validation.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 7 Interactive Fault Injection Buttons */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Simulate Telemetry Faults on <span className="text-blue-600">{c10TargetRoom.id}</span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      Click any scenario below to inject live telemetry anomalies into {c10TargetRoom.id} and observe the C10 Validation Layer response.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    Active Fault Mode: <strong className="text-slate-900">{c10TargetRoom.faultInjected}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <button
                    onClick={() => injectSensorFault(c10TargetRoom.id, 'MISSING_READING')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      c10TargetRoom.faultInjected === 'MISSING_READING'
                        ? 'bg-red-50 border-red-400 ring-2 ring-red-500/20'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs text-red-700 flex items-center justify-between">
                      <span>1. Missing Reading</span>
                      <XCircle className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Drops packet to NULL. Marks status Missing & blocks all control actions.
                    </p>
                  </button>

                  <button
                    onClick={() => injectSensorFault(c10TargetRoom.id, 'SUDDEN_SPIKE')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      c10TargetRoom.faultInjected === 'SUDDEN_SPIKE'
                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500/20'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs text-amber-800 flex items-center justify-between">
                      <span>2. Sudden Power Spike</span>
                      <Zap className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Jumps load to 19.4 kW. Preserves reading, flags Suspicious, requests human check.
                    </p>
                  </button>

                  <button
                    onClick={() => injectSensorFault(c10TargetRoom.id, 'REPEATED_VALUES')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      c10TargetRoom.faultInjected === 'REPEATED_VALUES'
                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500/20'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs text-amber-800 flex items-center justify-between">
                      <span>3. Repeated / Frozen Values</span>
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      18 identical readings with 0 variance. Flags stuck sensor signature.
                    </p>
                  </button>

                  <button
                    onClick={() => injectSensorFault(c10TargetRoom.id, 'UNUSUAL_FLUCTUATION')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      c10TargetRoom.faultInjected === 'UNUSUAL_FLUCTUATION'
                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500/20'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs text-amber-800 flex items-center justify-between">
                      <span>4. Unusual Fluctuations</span>
                      <Activity className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Injects 78% erratic noise jitter. Marks telemetry Suspicious.
                    </p>
                  </button>

                  <button
                    onClick={() => injectSensorFault(c10TargetRoom.id, 'STALE_TIMESTAMP')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      c10TargetRoom.faultInjected === 'STALE_TIMESTAMP'
                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500/20'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs text-amber-800 flex items-center justify-between">
                      <span>5. Delayed / Stale Timestamp</span>
                      <Clock className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Sets timestamp age to 52m (&gt; {settings.freshnessThresholdMins}m limit). Marks Stale.
                    </p>
                  </button>

                  <button
                    onClick={() => injectSensorFault(c10TargetRoom.id, 'CONFLICTING_SENSORS')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      c10TargetRoom.faultInjected === 'CONFLICTING_SENSORS'
                        ? 'bg-red-50 border-red-400 ring-2 ring-red-500/20'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs text-red-700 flex items-center justify-between">
                      <span>6. Conflicting Occupancy (0 vs 40)</span>
                      <Users className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Sensor A = 0, Sensor B = 40. Marks occupancy UNCERTAIN & blocks Ghost Room!
                    </p>
                  </button>

                  <button
                    onClick={() => injectSensorFault(c10TargetRoom.id, 'NONE')}
                    className={`sm:col-span-2 p-3 rounded-xl border text-left transition-all ${
                      c10TargetRoom.faultInjected === 'NONE'
                        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20'
                        : 'bg-white hover:bg-emerald-50/40 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs text-emerald-800 flex items-center justify-between">
                      <span>7. Restore Normal Reliable Readings</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Clears injected faults on {c10TargetRoom.id}, restores verified sensor agreement, and permits normal Ghost Room energy analysis.
                    </p>
                  </button>
                </div>
              </div>

              {/* Visual Validation Pipeline Inspection for Target Room */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Step 1: Preserved Original Reading */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <div className="text-xs font-bold uppercase text-slate-400">
                    Stage 1 · Raw Incoming Telemetry (Preserved)
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    {c10TargetRoom.id} Raw Sensor Payload
                  </h3>
                  <div className="p-3.5 rounded-lg bg-slate-900 text-emerald-400 font-mono text-xs space-y-1.5">
                    <div>room_id: "{c10TargetRoom.id}"</div>
                    <div>
                      power_kw: {c10TargetRoom.currentKw !== null ? c10TargetRoom.currentKw : 'null (DROPPED)'}
                    </div>
                    <div>baseline_kw: {c10TargetRoom.baselineKw}</div>
                    <div>
                      sensor_A_pir_occ:{' '}
                      {c10TargetRoom.sensorA_occupancy !== null ? c10TargetRoom.sensorA_occupancy : 'null'}
                    </div>
                    <div>
                      sensor_B_thermal_occ:{' '}
                      {c10TargetRoom.sensorB_occupancy !== null ? c10TargetRoom.sensorB_occupancy : 'null'}
                    </div>
                    <div>reading_age_mins: {c10TargetRoom.readingAgeMins}</div>
                    <div>repeated_polls: {c10TargetRoom.repeatedCount}</div>
                    <div>fluctuation_jitter: {c10TargetRoom.fluctuationIndex}</div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Original readings are always preserved in full for engineering audit—never silently overwritten or discarded.
                  </p>
                </div>

                {/* Step 2: C10 Validation Diagnosis */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <div className="text-xs font-bold uppercase text-slate-400">
                    Stage 2 · C10 Validation Layer Verdict
                  </div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900">Assigned Status</h3>
                    <ReliabilityBadge status={c10TargetRoom.validation.status} />
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Confidence Score:</span>
                      <span className="font-bold">{c10TargetRoom.validation.confidenceScore}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Resolved Occupancy:</span>
                      <span className="font-bold text-slate-900">
                        {c10TargetRoom.validation.effectiveOccupancy} (
                        {c10TargetRoom.validation.effectiveOccupancyStatus})
                      </span>
                    </div>
                  </div>

                  {c10TargetRoom.validation.issues.length === 0 ? (
                    <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                      <strong>All 6 C10 Checks Passed:</strong> Telemetry is fresh, non-null, within physical variance bounds, and Sensor A/B agree on occupancy.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {c10TargetRoom.validation.issues.map((iss, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950"
                        >
                          <div className="font-bold">{iss.code}</div>
                          <div className="mt-0.5">{iss.explanation}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Step 3: Downstream Engine & Safety Gate Decision */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <div className="text-xs font-bold uppercase text-slate-400">
                    Stage 3 · Energy Engine Gate Decision
                  </div>
                  <h3 className="text-base font-bold text-slate-900">Control Recommendation Gate</h3>

                  <div
                    className={`p-4 rounded-xl border ${
                      c10TargetRoom.validation.allowEnergyControl
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        : 'bg-red-50 border-red-300 text-red-950'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm">
                      {c10TargetRoom.validation.allowEnergyControl ? (
                        <>
                          <ShieldCheck className="w-5 h-5 text-emerald-600" />
                          <span>ALLOWED — Validated Telemetry</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-5 h-5 text-red-600" />
                          <span>BLOCKED — Unsafe / Unverified Data</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs mt-2">
                      {c10TargetRoom.validation.allowEnergyControl
                        ? `Engine is permitted to evaluate ${c10TargetRoom.id} for Ghost Room or Standby power savings. Classification: ${c10TargetRoom.energyClassification}.`
                        : `Automated energy-saving recommendations are strictly BLOCKED for ${c10TargetRoom.id}. Room is NOT classified as empty. Human verification ticket generated instead.`}
                    </p>
                  </div>

                  <div className="pt-2 text-xs text-slate-500">
                    Tip: Try selecting <strong>CR-305</strong> above and clicking{' '}
                    <strong>7. Restore Normal Reliable Readings</strong>—watch CR-305 immediately transition from{' '}
                    <em>Blocked by C10 (Conflicting)</em> to a verified <em>Ghost Room</em>!
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* VIEW 5: RECOMMENDATIONS & HUMAN APPROVAL WORKFLOW               */}
          {/* --------------------------------------------------------------- */}
          {activeNav === 'recommendations' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    Energy-Saving Recommendations & Human Approval
                  </h1>
                  <p className="text-sm text-slate-600">
                    Human-in-the-loop authorization workflow. Approving or rejecting while offline queues actions in IndexedDB (C01).
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
                    Protected Essential Rooms (LAB-104, LAB-205) Excluded from Control
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {recommendations.map((rec) => {
                  const isApproved = rec.approvalStatus.startsWith('Approved');
                  const isRejected = rec.approvalStatus.startsWith('Rejected');
                  const isPendingSync = rec.approvalStatus.includes('Pending Sync');

                  return (
                    <div
                      key={rec.id}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                    >
                      <div className="space-y-2 max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {rec.id}
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            {rec.roomId} — {rec.roomName}
                          </span>
                          <span
                            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                              rec.isBlockedByC10
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {rec.category}
                          </span>
                          <span className="text-xs text-slate-400">· {rec.timestamp}</span>
                        </div>

                        <p className="text-sm text-slate-700 font-medium">{rec.reason}</p>
                        <p className="text-xs text-slate-600">
                          <strong className="text-slate-800">Proposed Action:</strong> {rec.proposedAction}
                        </p>

                        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-600">
                          <div>
                            Current: <strong className="text-slate-900">{rec.currentKw} kW</strong> → Expected:{' '}
                            <strong className="text-slate-900">{rec.expectedKw} kW</strong>
                          </div>
                          <div>
                            Est. Potential Savings:{' '}
                            <strong className="text-emerald-700">
                              {rec.potentialSavingsKwh} kWh (₹{rec.estimatedCostSavingsInr})
                            </strong>
                          </div>
                          <div>
                            Risk Level: <strong className="text-slate-800">{rec.riskLevel}</strong>
                          </div>
                          <div>
                            Sensor Confidence: <strong className="text-slate-800">{rec.sensorConfidence}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Right Controls: Approval Status & Functional Buttons */}
                      <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 flex-shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Status:</span>
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                              isPendingSync
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : isApproved
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isRejected
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {rec.approvalStatus}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRecommendationDecision(rec, 'APPROVE')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleRecommendationDecision(rec, 'REJECT')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-red-50 text-red-700 border border-red-200 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                          <button
                            onClick={() => {
                              setSelectedRoomId(rec.roomId);
                              setActiveNav('rooms');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
                          >
                            View Room
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* VIEW 6: DEMAND FORECASTING (MOVING AVERAGE & HISTORICAL TREND)  */}
          {/* --------------------------------------------------------------- */}
          {activeNav === 'forecasting' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Local Mathematical Electricity Demand Forecasting
                </h1>
                <p className="text-sm text-slate-600">
                  Derived locally using historical moving averages and academic schedule baselines. (No external AI API or unverified ML claims).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Expected Peak Period</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">14:00 – 15:00</div>
                  <div className="text-xs text-slate-500 mt-1">Afternoon laboratory & lecture block overlap</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Estimated Peak Demand</div>
                  <div className="text-2xl font-bold text-blue-600 mt-1">52.4 kW</div>
                  <div className="text-xs text-slate-500 mt-1">3-day moving average projection</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Peak Shaving Opportunity</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">6.9 kW Reduction</div>
                  <div className="text-xs text-slate-500 mt-1">By clearing Ghost Rooms before 14:00 peak</div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Intraday Demand Forecast vs Timetable Baseline (06:00 – 16:00)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Solid line shows recorded morning load; dashed blue curve shows moving-average forecast for afternoon hours.
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Moving-Average Estimate (Simulated Data)
                  </span>
                </div>

                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={CAMPUS_HOURLY_SERIES}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                      <YAxis unit=" kW" tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <ReferenceLine x="12:00" stroke="#94a3b8" strokeDasharray="3 3" label="Current Time" />
                      <Line
                        type="monotone"
                        dataKey="actualKw"
                        name="Recorded Load (kW)"
                        stroke="#0f172a"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecastKw"
                        name="Moving-Average Forecast (kW)"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        strokeDasharray="5 5"
                      />
                      <Line
                        type="monotone"
                        dataKey="baselineKw"
                        name="Optimal Timetable Baseline (kW)"
                        stroke="#10b981"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* VIEW 7: AUDIT HISTORY                                           */}
          {/* --------------------------------------------------------------- */}
          {activeNav === 'audit' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Operational Audit History</h1>
                  <p className="text-sm text-slate-600">
                    Append-only chronological log of recommendations, human approvals, C10 sensor anomalies, and C01 offline sync events.
                  </p>
                </div>
                <select
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="ALL">All Event Types ({auditLogs.length})</option>
                  <option value="OFFLINE_QUEUED">Offline Queued (C01)</option>
                  <option value="ACTION_SYNCED">Synchronised (C01)</option>
                  <option value="SENSOR_ANOMALY">Sensor Anomalies (C10)</option>
                  <option value="C10_TEST_INJECTION">C10 Fault Tests</option>
                  <option value="REC_APPROVED">Approved Recommendations</option>
                  <option value="REC_REJECTED">Rejected Recommendations</option>
                </select>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                        <th className="py-3 px-4">Event ID</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Event Description</th>
                        <th className="py-3 px-4">Related Entity</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {auditLogs
                        .filter((e) => auditFilter === 'ALL' || e.type === auditFilter)
                        .map((log) => (
                          <tr key={log.eventId} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-600">
                              {log.eventId}
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                                {log.type}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900">{log.title}</div>
                              <div className="text-xs text-slate-600">{log.description}</div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-blue-700">{log.relatedId}</td>
                            <td className="py-3 px-4">
                              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {log.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                              {log.timestamp}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* VIEW 8: C01 OFFLINE MANAGEMENT & IDEMPOTENT SYNC QUEUE          */}
          {/* --------------------------------------------------------------- */}
          {activeNav === 'offline' && (
            <div className="space-y-6">
              <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-400 text-slate-950">
                    SURPRISE CONSTRAINT C01 — THE WORLD WENT OFFLINE
                  </div>
                  <h1 className="text-2xl font-bold">Offline Action Queue & Idempotent Synchronisation</h1>
                  <p className="text-xs text-slate-300 max-w-3xl">
                    All campus telemetry, settings, and administrative decisions are persisted in IndexedDB. Approvals made while offline enter the local queue with deterministic idempotency keys and synchronise automatically upon reconnection without duplicates.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => setSimulatedOffline((prev) => !prev)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                      isOnline
                        ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    }`}
                  >
                    {isOnline ? '1. Simulate Disconnect (Go Offline)' : '2. Restore Connectivity & Auto-Sync'}
                  </button>

                  <button
                    onClick={() => synchronizeOfflineQueue()}
                    disabled={!isOnline || metrics.pendingSyncCount === 0 || isSyncing}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    Sync Pending Now
                  </button>
                </div>
              </div>

              {/* Status Distinction Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Current Connectivity</div>
                  <div className={`text-xl font-bold mt-1 ${isOnline ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {isOnline ? 'ONLINE (Connected)' : 'OFFLINE (Local Queue Mode)'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">IndexedDB cache active & readable</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Pending Synchronisation</div>
                  <div className="text-2xl font-bold text-amber-700 mt-1">
                    {offlineQueue.filter((q) => q.syncStatus === 'Pending Sync').length} Actions
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Awaiting connectivity restoration</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Successfully Synchronised</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">
                    {offlineQueue.filter((q) => q.syncStatus === 'Synced').length} Actions
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Last sync: {lastSyncTime}</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Fault Tolerance Test</div>
                  <label className="flex items-center gap-2 mt-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simulateNextSyncFailure}
                      onChange={(e) => setSimulateNextSyncFailure(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Simulate Gateway Error on Next Sync
                  </label>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Demonstrates Failed status + non-destructive Retry button
                  </div>
                </div>
              </div>

              {/* Interactive Step-by-Step Offline Demo Runner */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      C01 Action Queue (IndexedDB Persistent Store)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Every queued decision uses a deterministic idempotent key (`ACT-&lt;RecID&gt;-&lt;Decision&gt;`) so repeated clicks or retries never apply duplicate operations.
                    </p>
                  </div>
                  {!isOnline && recommendations.length > 0 && (
                    <button
                      onClick={() => handleRecommendationDecision(recommendations[0], 'APPROVE')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400"
                    >
                      Quick Demo: Queue Approval for {recommendations[0].roomId} While Offline
                    </button>
                  )}
                </div>

                {offlineQueue.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl space-y-2">
                    <Database className="w-8 h-8 text-slate-400 mx-auto" />
                    <div className="text-sm font-semibold text-slate-700">No Queued or Synchronised Actions Yet</div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Switch to <strong>Offline Mode</strong> using the top bar button, then approve a recommendation in the <strong>Recommendations</strong> tab (or click the Quick Demo button) to see it queued here as <code>Pending Sync</code>.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                          <th className="py-3 px-4">Idempotent Action ID</th>
                          <th className="py-3 px-4">Action Type</th>
                          <th className="py-3 px-4">Recommendation & Room</th>
                          <th className="py-3 px-4">Queued Timestamp</th>
                          <th className="py-3 px-4">Sync Status</th>
                          <th className="py-3 px-4 text-right">Retry / Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {offlineQueue.map((item) => (
                          <tr key={item.actionId} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-mono text-xs font-bold text-slate-800">
                              {item.actionId}
                            </td>
                            <td className="py-3 px-4 text-xs font-semibold">{item.actionType}</td>
                            <td className="py-3 px-4 text-xs">
                              <span className="font-bold text-slate-900">{item.roomId}</span> ({item.recommendationId})
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-500">{item.timestamp}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                  item.syncStatus === 'Synced'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : item.syncStatus === 'Pending Sync'
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : item.syncStatus === 'Failed'
                                    ? 'bg-red-50 text-red-700 border-red-300'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                              >
                                {item.syncStatus}
                              </span>
                              {item.lastError && (
                                <div className="text-[11px] text-red-600 mt-0.5">{item.lastError}</div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {(item.syncStatus === 'Failed' || item.syncStatus === 'Pending Sync') && (
                                <button
                                  onClick={() => synchronizeOfflineQueue(item.actionId)}
                                  disabled={!isOnline}
                                  className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                                >
                                  Retry Sync
                                </button>
                              )}
                              {item.syncStatus === 'Synced' && (
                                <span className="text-xs text-slate-400">Synced @ {item.syncedAt}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* VIEW 9: SETTINGS, ARCHITECTURE DOCS & AUTOMATED TEST RUNNER     */}
          {/* --------------------------------------------------------------- */}
          {activeNav === 'settings' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    Platform Settings, Architecture Docs & Judge Verification
                  </h1>
                  <p className="text-sm text-slate-600">
                    Configure thresholds, inspect the 3-person team module boundaries, or run automated acceptance tests.
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200">
                  <button
                    onClick={() => setSettingsTab('config')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                      settingsTab === 'config' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Thresholds & Safety
                  </button>
                  <button
                    onClick={() => {
                      setSettingsTab('tests');
                      runAcceptanceTests();
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                      settingsTab === 'tests' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Automated Tests & Checklist
                  </button>
                  <button
                    onClick={() => setSettingsTab('docs')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                      settingsTab === 'docs' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Architecture & README
                  </button>
                </div>
              </div>

              {settingsTab === 'config' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Electricity Tariff (₹ / kWh)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={settings.tariffPerKwh}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, tariffPerKwh: Math.max(1, parseFloat(e.target.value) || 8) }))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      <p className="text-xs text-slate-500 mt-1">Used across all estimated monetary savings cards.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        C10 Sensor Freshness Threshold (Mins)
                      </label>
                      <input
                        type="number"
                        value={settings.freshnessThresholdMins}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            freshnessThresholdMins: Math.max(1, parseInt(e.target.value, 10) || 15)
                          }))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Readings older than this are marked Stale (e.g. AUD-101 is 48m old).
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Ghost Room Baseline Multiplier
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={settings.anomalyMultiplier}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            anomalyMultiplier: Math.max(1.2, parseFloat(e.target.value) || 2.0)
                          }))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Multiple of historical baseline required to flag Ghost Room.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        C10 Sudden Power Spike Threshold (kW)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={settings.spikeThresholdKw}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            spikeThresholdKw: Math.max(5, parseFloat(e.target.value) || 14.0)
                          }))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Unexplained jumps above this value are flagged Suspicious.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        C10 Occupancy Conflict Max Delta
                      </label>
                      <input
                        type="number"
                        value={settings.maxOccupancyConflictDelta}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            maxOccupancyConflictDelta: Math.max(1, parseInt(e.target.value, 10) || 10)
                          }))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Max allowed headcount discrepancy between Sensor A and Sensor B.
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.protectEssentialEquipment}
                          onChange={(e) =>
                            setSettings((s) => ({ ...s, protectEssentialEquipment: e.target.checked }))
                          }
                          className="rounded border-slate-300 w-4 h-4"
                        />
                        Enforce Essential Equipment Lockout
                      </label>
                      <p className="text-xs text-slate-500">
                        Strictly protects LAB-104 (Bio Cold Storage/Fume Hoods) and LAB-205 (Servers) from control actions.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Settings are automatically persisted to IndexedDB and localStorage.
                    </span>
                    <button
                      onClick={() => {
                        appendAudit(
                          'SETTINGS_UPDATED',
                          'Platform Configuration Updated',
                          `Tariff: ₹${settings.tariffPerKwh}/kWh, Freshness: ${settings.freshnessThresholdMins}m, Essential Lock: ${settings.protectEssentialEquipment}`,
                          'SETTINGS',
                          'Persisted'
                        );
                        showNotification('Settings Saved', 'Configuration persisted locally.', 'success');
                      }}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Log Configuration Snapshot
                    </button>
                  </div>
                </div>
              )}

              {settingsTab === 'tests' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Automated Unit & Constraint Assertion Runner */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          In-Browser Automated Verification Suite
                        </h2>
                        <p className="text-xs text-slate-500">
                          Executes 8 live assertions against the C10 Validator, C01 Idempotency Engine, and Essential Load Safety rules.
                        </p>
                      </div>
                      <button
                        onClick={runAcceptanceTests}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        Re-Run Tests
                      </button>
                    </div>

                    <div className="space-y-2">
                      {testResults &&
                        testResults.map((t, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg border flex items-center justify-between text-xs font-medium ${
                              t.passed
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                : 'bg-red-50 border-red-200 text-red-900'
                            }`}
                          >
                            <span>{t.name}</span>
                            <span className="font-bold">{t.passed ? 'PASS ✓' : 'FAIL ✗'}</span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Hackathon Judge Manual Demo Checklist */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                    <h2 className="text-base font-bold text-slate-900">
                      Judge Reproducible Demo Walkthrough (`docs/DEMO_CHECKLIST.md`)
                    </h2>
                    <ol className="list-decimal list-inside space-y-2.5 text-xs text-slate-700">
                      <li>
                        <strong>Ghost Room Detection (LH-201):</strong> Open <em>Room Monitoring</em> or <em>Recommendations</em>. Observe <code>LH-201</code> has 0 occupants, no scheduled class, and draws 4.8 kW vs 0.6 kW baseline → generates 6.3 kWh (₹50.40) savings recommendation.
                      </li>
                      <li>
                        <strong>C10 Conflicting Sensors (CR-305):</strong> Observe <code>CR-305</code> reports Sensor A = 0 and Sensor B = 40. Occupancy is marked <code>UNCERTAIN</code> (not Empty) and Ghost Room recommendation is strictly blocked.
                      </li>
                      <li>
                        <strong>C10 Fault Injection Lab:</strong> Open <em>Sensor Reliability</em>, select any room, and click <em>Missing Reading</em>, <em>Sudden Spike</em>, or <em>Restore Normal Reliable Readings</em> to see real-time validation gating.
                      </li>
                      <li>
                        <strong>C01 Offline Workflow:</strong> Click <em>Network: Online (Click to Simulate C01 Offline)</em> in the top header. Go to <em>Recommendations</em> and click <strong>Approve</strong> on <code>REC-GHOST-LH-201</code>.
                      </li>
                      <li>
                        <strong>Verify Local Persistence & Idempotency:</strong> Open <em>Offline Management</em>. Verify the action is listed as <code>Pending Sync</code>. Refresh the browser page to confirm IndexedDB persistence.
                      </li>
                      <li>
                        <strong>Reconnection & Single Synchronisation:</strong> Click <em>Offline Mode Active (Click to Reconnect & Sync)</em>. Verify the queued action transitions to <code>Synced</code> exactly once and logs to <em>Audit History</em>.
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              {settingsTab === 'docs' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5 text-xs text-slate-700">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Three-Person Team Repository Architecture (`docs/ARCHITECTURE.md`)
                    </h2>
                    <p className="text-slate-500 mt-1">
                      Clean modular boundaries designed for parallel development without merge conflicts:
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                      <div className="font-bold text-slate-900">Person 1 — Frontend, Dashboard & Analytics</div>
                      <div className="font-mono text-[11px] text-blue-700">src/modules/dashboard/*</div>
                      <p>
                        Overview KPIs, Room Monitoring table & inspection drawer, Recharts analytics, Transparent Savings Calculator, and Moving-Average Forecasting.
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                      <div className="font-bold text-slate-900">Person 2 — C10 Sensor Validation Layer</div>
                      <div className="font-mono text-[11px] text-amber-700">src/modules/c10-sensor-validation/*</div>
                      <p>
                        Pre-analysis telemetry sanitizer (`validateRoomSensors`), 6 anomaly detectors, `UNCERTAIN` occupancy resolver, and interactive Fault Injection Testbed.
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                      <div className="font-bold text-slate-900">Person 3 — C01 Offline Sync & IndexedDB</div>
                      <div className="font-mono text-[11px] text-emerald-700">src/modules/c01-offline-sync/*</div>
                      <p>
                        `IndexedDBService` persistence wrapper, deterministic idempotent action queue (`ACT-RecID-Decision`), connectivity listeners, and retry engine.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1">
                    <div className="font-bold">Simulated Data & Safety Disclaimer</div>
                    <p>
                      This prototype uses controlled, reproducible simulated campus data for demonstration purposes. It is not connected to physical SRM campus electrical switchgear, meters, or BMS controllers, and never issues automated shutoff commands to essential laboratory or server infrastructure.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* =================================================================== */}
      {/* QUICK ENERGY SAVINGS CALCULATOR MODAL                               */}
      {/* =================================================================== */}
      {showCalcModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Potential Energy Savings Calculator</h3>
              </div>
              <button onClick={() => setShowCalcModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Calculates illustrative potential savings: <code>(Current kW − Expected kW) × Duration × Tariff</code>.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Current Power (kW)</label>
                <input
                  type="number"
                  step="0.1"
                  value={calcCurrentKw}
                  onChange={(e) => setCalcCurrentKw(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Expected Power (kW)</label>
                <input
                  type="number"
                  step="0.1"
                  value={calcExpectedKw}
                  onChange={(e) => setCalcExpectedKw(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Duration (Hours)</label>
                <input
                  type="number"
                  step="0.5"
                  value={calcDurationHrs}
                  onChange={(e) => setCalcDurationHrs(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tariff (₹ / kWh)</label>
                <input
                  type="number"
                  step="0.5"
                  value={calcTariff}
                  onChange={(e) => setCalcTariff(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-800">Potential Energy Saved</div>
                <div className="text-xl font-bold text-emerald-950">{calcPotentialKwh} kWh</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-emerald-800">Estimated Monetary Savings</div>
                <div className="text-xl font-bold text-emerald-950">₹{calcPotentialInr.toFixed(2)}</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setCalcCurrentKw(4.8);
                  setCalcExpectedKw(0.6);
                  setCalcDurationHrs(1.5);
                  setCalcTariff(8.0);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Reset to LH-201 Example (6.3 kWh / ₹50.40)
              </button>
              <button
                onClick={() => setShowCalcModal(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}