
import React, { useState, useEffect, useMemo } from 'react';
import { ScheduleConfig, GeneratedSchedule, LunchConfig, TeamType, SideTaskRule, GreenRotation, GreenStation, ShiftException, GeneratedGreenSchedule, GreenNotification, ForcedAssignment } from './types';
import { generateSchedule } from './services/scheduler';
import { generateGreenSchedule, ROTATIONS_META } from './services/greenScheduler';
import { EmployeeCard } from './components/EmployeeCard';
import { analyzeScheduleWithGemini, generateLunchPlan } from './services/geminiService';
import { isAfter, isBefore, parse, startOfDay } from 'date-fns';
import { 
  AlertTriangle, 
  Sparkles, 
  Clock, 
  Users, 
  RefreshCw,
  LayoutGrid,
  Settings2,
  Wand2,
  CheckCircle2,
  UserCircle,
  X,
  ChevronDown,
  ChevronUp,
  Sandwich,
  Plus,
  Trash2,
  CalendarClock,
  Bell,
  Info,
  Lock,
  Unlock,
  GripHorizontal,
  AlertCircle,
  Timer,
  ArrowRight,
  RotateCcw,
  Eye,
  EyeOff
} from 'lucide-react';

// --- Local Storage Helpers ---
const STORAGE_KEYS = {
  BLUE_CONFIG: 'museum_blue_config',
  BLUE_NAMES: 'museum_blue_names',
  BLUE_SHIFTS: 'museum_blue_shifts',
  GREEN_COUNT: 'museum_green_count',
  GREEN_NAMES: 'museum_green_names',
  GREEN_TASKS: 'museum_green_tasks',
  GREEN_EXCEPTIONS: 'museum_green_exceptions',
  GREEN_FORCED: 'museum_green_forced',
  CURRENT_TEAM: 'museum_current_team'
};

const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn(`Failed to load state for ${key}`, e);
  }
  return fallback;
};

const saveState = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Failed to save state for ${key}`, e);
  }
};

// Initial default config
const DEFAULT_CONFIG: ScheduleConfig = {
  frequency: 20,
  firstShowTime: "09:20",
  numEmployees: 4,
  lastShowTime: "16:40",
  durationOcean: 20,
  durationFloor: 20
};

const App: React.FC = () => {
  // --- Global State ---
  const [currentTeam, setCurrentTeam] = useState<TeamType>(() => loadState(STORAGE_KEYS.CURRENT_TEAM, TeamType.BLUE));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [fadePastEvents, setFadePastEvents] = useState(true);

  // --- Blue Team State ---
  const [config, setConfig] = useState<ScheduleConfig>(() => loadState(STORAGE_KEYS.BLUE_CONFIG, DEFAULT_CONFIG));
  // Keep lunch config in state but we removed the UI for it per previous request, keeping code minimal
  const [lunchConfig, setLunchConfig] = useState<LunchConfig>({ windowStart: "12:00", windowEnd: "14:00", duration: 35 });
  
  const [employeeOffsets, setEmployeeOffsets] = useState<Record<string, number>>({});
  
  const [employeeShifts, setEmployeeShifts] = useState<Record<string, { start: string, end: string }>>(() => 
    loadState(STORAGE_KEYS.BLUE_SHIFTS, {})
  );
  
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>(() => 
    loadState(STORAGE_KEYS.BLUE_NAMES, {})
  );

  const [schedule, setSchedule] = useState<GeneratedSchedule | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lunchAnalysis, setLunchAnalysis] = useState<string>("");
  const [isPlanningLunch, setIsPlanningLunch] = useState(false);
  const [showAllIssues, setShowAllIssues] = useState(false);

  // --- Green Team State ---
  const [numGreenEmployees, setNumGreenEmployees] = useState(() => loadState(STORAGE_KEYS.GREEN_COUNT, 6));
  const [greenEmployeeNames, setGreenEmployeeNames] = useState<Record<string, string>>(() => 
    loadState(STORAGE_KEYS.GREEN_NAMES, {})
  );
  
  const [sideTasks, setSideTasks] = useState<SideTaskRule[]>(() => 
    loadState(STORAGE_KEYS.GREEN_TASKS, [])
  );
  
  const [shiftExceptions, setShiftExceptions] = useState<ShiftException[]>(() => 
    loadState(STORAGE_KEYS.GREEN_EXCEPTIONS, [])
  );
  
  const [forcedAssignments, setForcedAssignments] = useState<ForcedAssignment[]>(() => 
    loadState(STORAGE_KEYS.GREEN_FORCED, [])
  );

  const [greenData, setGreenData] = useState<GeneratedGreenSchedule>({ rotations: [], notifications: [] });
  const [greenRefreshTrigger, setGreenRefreshTrigger] = useState(0); // To force re-shuffle

  // --- Persistence Effects ---
  useEffect(() => saveState(STORAGE_KEYS.CURRENT_TEAM, currentTeam), [currentTeam]);
  useEffect(() => saveState(STORAGE_KEYS.BLUE_CONFIG, config), [config]);
  useEffect(() => saveState(STORAGE_KEYS.BLUE_NAMES, employeeNames), [employeeNames]);
  useEffect(() => saveState(STORAGE_KEYS.BLUE_SHIFTS, employeeShifts), [employeeShifts]);
  useEffect(() => saveState(STORAGE_KEYS.GREEN_COUNT, numGreenEmployees), [numGreenEmployees]);
  useEffect(() => saveState(STORAGE_KEYS.GREEN_NAMES, greenEmployeeNames), [greenEmployeeNames]);
  useEffect(() => saveState(STORAGE_KEYS.GREEN_TASKS, sideTasks), [sideTasks]);
  useEffect(() => saveState(STORAGE_KEYS.GREEN_EXCEPTIONS, shiftExceptions), [shiftExceptions]);
  useEffect(() => saveState(STORAGE_KEYS.GREEN_FORCED, forcedAssignments), [forcedAssignments]);


  // --- Effects (Time) ---
  useEffect(() => {
    // Update time every minute
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // --- Effects (Blue) ---
  useEffect(() => {
    const offsets = { ...employeeOffsets };
    let changed = false;
    for (let i = 1; i <= config.numEmployees; i++) {
      const id = `A${i}`;
      if (offsets[id] === undefined) {
        offsets[id] = i - 1; // Default staggered start
        changed = true;
      }
    }
    if (changed) {
      setEmployeeOffsets(offsets);
    }
    
    if (!changed) {
      // Pass the employeeShifts to the generator
      const newSchedule = generateSchedule(config, employeeOffsets, employeeShifts);
      setSchedule(newSchedule);
    }
  }, [config, employeeOffsets, employeeShifts]);

  // --- Effects (Green) ---
  useEffect(() => {
    const gd = generateGreenSchedule(numGreenEmployees, sideTasks, shiftExceptions, forcedAssignments);
    setGreenData(gd);
  }, [numGreenEmployees, sideTasks, shiftExceptions, forcedAssignments, greenRefreshTrigger]);

  // --- Handlers (Blue) ---
  const handleAnalyze = async () => {
    if (!schedule) return;
    setIsAnalyzing(true);
    const configSummary = `Freq: ${config.frequency}m, Start: ${config.firstShowTime}, End: ${config.lastShowTime}, Staff: ${config.numEmployees}, Ocean: ${config.durationOcean}m, Floor: ${config.durationFloor}m`;
    const result = await analyzeScheduleWithGemini(schedule, configSummary, employeeNames);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  const employeeIds = useMemo(() => {
    if (!schedule) return [];
    return Array.from(new Set(schedule.blocks.map(b => b.employeeId))).sort();
  }, [schedule]);

  const applySmartDurations = () => {
    setConfig(prev => ({
      ...prev,
      durationOcean: Math.max(prev.frequency, prev.durationOcean),
      durationFloor: Math.max(prev.frequency, 10)
    }));
  };

  // Filter out issues that are in the past
  const visibleIssues = useMemo(() => {
    if (!schedule) return [];
    
    // Filter out past issues based on currentTime
    const relevantIssues = schedule.issues.filter(i => isAfter(i.endTime, currentTime));
    
    return showAllIssues ? relevantIssues : relevantIssues.slice(0, 4);
  }, [schedule, showAllIssues, currentTime]);

  const totalCurrentIssues = useMemo(() => {
     if (!schedule) return 0;
     return schedule.issues.filter(i => isAfter(i.endTime, currentTime)).length;
  }, [schedule, currentTime]);

  const handleTimeChange = (val: string, field: keyof ScheduleConfig | 'lunchStart' | 'lunchEnd') => {
    if (/^[0-9:]*$/.test(val) && val.length <= 5) {
       if (field === 'lunchStart') {
         setLunchConfig(prev => ({ ...prev, windowStart: val }));
       } else if (field === 'lunchEnd') {
         setLunchConfig(prev => ({ ...prev, windowEnd: val }));
       } else {
         setConfig(prev => ({ ...prev, [field]: val }));
       }
    }
  };

  const updateEmployeeShift = (id: string, type: 'start' | 'end', val: string) => {
    setEmployeeShifts(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [type]: val
      }
    }));
  };

  // --- Handlers (Green) ---
  const addSideTask = () => {
    const id = Date.now().toString();
    setSideTasks(prev => [...prev, { id, rotationId: 1, employeeId: 'B1' }]);
  };

  const removeSideTask = (id: string) => {
    setSideTasks(prev => prev.filter(t => t.id !== id));
  };

  const updateSideTask = (id: string, field: keyof SideTaskRule, value: any) => {
    setSideTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const addShiftException = () => {
    const id = Date.now().toString();
    setShiftExceptions(prev => [...prev, { id, employeeId: 'B1', startTime: '10:00', endTime: '14:00' }]);
  };

  const removeShiftException = (id: string) => {
    setShiftExceptions(prev => prev.filter(t => t.id !== id));
  };

  const updateShiftException = (id: string, field: keyof ShiftException, value: any) => {
    setShiftExceptions(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const clearForcedAssignments = () => {
    setForcedAssignments([]);
  };

  const toggleForce = (rotationId: number, station: GreenStation, employeeId: string) => {
    setForcedAssignments(prev => {
        const exists = prev.find(f => f.rotationId === rotationId && f.employeeId === employeeId && f.station === station);
        if (exists) {
            return prev.filter(f => f !== exists);
        }
        return [...prev, { rotationId, station, employeeId }];
    });
  };

  // --- Reset Handler ---
  const handleResetSystem = () => {
    if (window.confirm("Are you sure you want to RESTART the system? \n\nThis will clear all staff names, shifts, and settings to default.")) {
        // 1. Clear Local Storage
        Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));

        // 2. Reset React State immediately to defaults
        setConfig(DEFAULT_CONFIG);
        setEmployeeNames({});
        setEmployeeShifts({});
        setEmployeeOffsets({});
        setSchedule(null);
        
        setNumGreenEmployees(6);
        setGreenEmployeeNames({});
        setSideTasks([]);
        setShiftExceptions([]);
        setForcedAssignments([]);
        
        // 3. Optional: Reload to be absolutely sure
        setTimeout(() => window.location.reload(), 100);
    }
  };

  // --- Drag and Drop Handlers (Green) ---
  const handleDragStart = (e: React.DragEvent, employeeId: string, rotationId: number, currentStation: GreenStation) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ employeeId, rotationId, currentStation }));
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('dragging-active');
  };

  const handleDragEnd = () => {
    document.body.classList.remove('dragging-active');
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetRotationId: number, targetStation: GreenStation) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { employeeId, rotationId } = data;

      if (rotationId === targetRotationId) {
        setForcedAssignments(prev => {
          const clean = prev.filter(f => !(f.rotationId === rotationId && f.employeeId === employeeId));
          return [...clean, { rotationId, station: targetStation, employeeId }];
        });
      }
    } catch (err) {
      console.error("Drop failed", err);
    }
  };

  // --- Render Helpers ---
  const getGreenEmployeeName = (id: string) => greenEmployeeNames[id] || id;

  const isRotationPast = (rotationId: number) => {
     const meta = ROTATIONS_META.find(r => r.id === rotationId);
     if (!meta) return false;
     
     // Parse end time for today
     const [endH, endM] = meta.end.split(':').map(Number);
     const endDate = startOfDay(new Date());
     endDate.setHours(endH, endM, 0, 0);

     return isAfter(currentTime, endDate);
  };

  // Filter Green notifications to only show relevant/future ones or non-rotation specific
  const activeGreenNotifications = useMemo(() => {
     return greenData.notifications.filter(n => {
        if (!n.rotationId) return true; // Show global infos
        // Hide alerts for past rotations
        return !isRotationPast(n.rotationId);
     });
  }, [greenData.notifications, currentTime]);

  const getStationStyle = (station: GreenStation) => {
    switch (station) {
      case GreenStation.TICKET: return 'bg-amber-50 text-amber-900 border-amber-200';
      case GreenStation.GREETER: return 'bg-orange-50 text-orange-900 border-orange-200';
      case GreenStation.PLANETARIUM: return 'bg-emerald-50 text-emerald-900 border-emerald-200';
      case GreenStation.MUSEUM: return 'bg-indigo-50 text-indigo-900 border-indigo-200';
      case GreenStation.SIDE_TASK: return 'bg-slate-50 text-slate-600 border-slate-200 italic';
      case GreenStation.OFF_SHIFT: return 'bg-slate-50 text-slate-400 border-slate-100 border-dashed';
      default: return 'bg-white';
    }
  };

  const getStationLabelColor = (station: GreenStation) => {
    switch (station) {
      case GreenStation.TICKET: return 'bg-amber-100 text-amber-800';
      case GreenStation.GREETER: return 'bg-orange-100 text-orange-800';
      case GreenStation.PLANETARIUM: return 'bg-emerald-100 text-emerald-800';
      case GreenStation.MUSEUM: return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getShiftNotice = (empId: string, rotTimeRange: string) => {
    const exception = shiftExceptions.find(e => e.employeeId === empId);
    if (!exception) return null;

    const [rotStart, rotEnd] = rotTimeRange.split(' - ');
    const [rsH, rsM] = rotStart.split(':').map(Number);
    const [reH, reM] = rotEnd.split(':').map(Number);
    const rotStartMins = rsH * 60 + rsM;
    const rotEndMins = reH * 60 + reM;

    const [ssH, ssM] = exception.startTime.split(':').map(Number);
    const [seH, seM] = exception.endTime.split(':').map(Number);
    const shiftStartMins = ssH * 60 + ssM;
    const shiftEndMins = seH * 60 + seM;

    if (shiftEndMins < rotEndMins && shiftEndMins > rotStartMins) {
      return `Until ${exception.endTime}`;
    }
    if (shiftStartMins > rotStartMins && shiftStartMins < rotEndMins) {
      return `From ${exception.startTime}`;
    }
    return null;
  };

  const renderGreenEmployee = (id: string, rotTimeRange: string, rotationId: number, station: GreenStation) => {
    const name = getGreenEmployeeName(id);
    const notice = getShiftNotice(id, rotTimeRange);
    const isForced = forcedAssignments.some(f => f.rotationId === rotationId && f.employeeId === id && f.station === station);

    return (
      <div 
        className={`relative flex items-center justify-between min-w-[120px] max-w-full group transition-all duration-200 rounded-lg pl-2 pr-2 py-2.5 cursor-grab active:cursor-grabbing hover:bg-white hover:shadow-md border border-transparent hover:border-slate-200 ${isForced ? 'bg-white border-slate-200 shadow-sm ring-1 ring-slate-200' : ''}`}
        draggable
        onDragStart={(e) => handleDragStart(e, id, rotationId, station)}
        onDragEnd={handleDragEnd}
      >
        {/* Warning Indicator */}
        {notice && (
          <div className="absolute top-1 right-1 z-10 group/alert">
             <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm cursor-help"></div>
             <div className="absolute bottom-full right-0 mb-1 w-max bg-red-600 text-white text-[10px] px-2 py-1 rounded shadow-lg opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 font-bold whitespace-nowrap">
               {notice}
             </div>
          </div>
        )}

        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <div className="text-slate-300 group-hover:text-slate-400 cursor-grab flex-shrink-0">
            <GripHorizontal size={14} />
          </div>
          <span className="truncate font-bold text-xs text-slate-700 leading-tight">{name}</span>
        </div>
        
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
           {/* Lock / Unlock Control - ALWAYS VISIBLE NOW */}
           <button 
              onClick={() => toggleForce(rotationId, station, id)}
              className={`group/lock relative transition-colors p-0.5 rounded hover:bg-slate-100 ${isForced ? 'text-slate-600' : 'text-slate-300 hover:text-slate-400'}`}
           >
              {isForced ? <Lock size={12} /> : <Unlock size={12} />}
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 group-hover/lock:opacity-100 transition-opacity pointer-events-none z-50 text-center font-normal">
                 <strong className="block text-slate-300 mb-1">{isForced ? 'Position Locked' : 'Position Unlocked'}</strong>
                 <span className="opacity-75">{isForced ? 'Employee stays here. Click to unlock.' : 'Click to lock employee in this spot.'}</span>
              </div>
           </button>

           <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 min-w-[20px] text-center" title={`ID: ${id}`}>
             {id}
           </span>
        </div>
      </div>
    );
  };

  const StationDropZone = ({ children, rotationId, station, className, isMissing }: any) => {
    const [isOver, setIsOver] = useState(false);
    let statusClass = '';
    if (isOver) {
      statusClass = 'ring-2 ring-emerald-400 ring-offset-1 bg-emerald-50 scale-[1.01]';
    } else if (isMissing) {
      statusClass = 'ring-1 ring-red-300 bg-red-50'; 
    }
    return (
      <div 
        className={`${className} transition-all duration-200 ${statusClass}`}
        onDragOver={(e) => {
            handleDragOver(e);
            if (!isOver) setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
            setIsOver(false);
            handleDrop(e, rotationId, station);
        }}
      >
        {children}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans relative">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6 h-18 flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg transition-colors overflow-hidden ${currentTeam === TeamType.BLUE ? 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-blue-200' : 'bg-gradient-to-br from-emerald-600 to-teal-600 shadow-emerald-200'}`}>
              <LayoutGrid size={24} className="text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r tracking-tight ${currentTeam === TeamType.BLUE ? 'from-blue-800 to-indigo-800' : 'from-emerald-800 to-teal-800'}`}>
                Museum System
              </h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{currentTeam} Team Manager</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
             
             {/* Fade Toggle */}
             <button 
                onClick={() => setFadePastEvents(!fadePastEvents)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                  fadePastEvents 
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm' 
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
                title="Toggle fading for past events"
             >
                {fadePastEvents ? <EyeOff size={16} /> : <Eye size={16} />}
                {fadePastEvents ? 'Fading ON' : 'Fading OFF'}
             </button>

             {/* Restart System Button */}
             <button 
                onClick={handleResetSystem}
                className="group relative w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
             >
                <RotateCcw size={20} />
                <span className="absolute top-full right-0 mt-2 w-max px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 transform translate-y-1">
                    Restart System
                </span>
             </button>

             {/* Clock */}
             <div className="flex flex-col items-end mr-2 border-r border-slate-200 pr-6 h-10 justify-center">
                 <span className="text-xl font-bold text-slate-700 tracking-tight leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                   {currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                 </span>
                 <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Local Time</span>
             </div>

             {/* Team Toggle */}
             <div className="bg-slate-100 p-1 rounded-xl flex items-center">
                <button 
                  onClick={() => setCurrentTeam(TeamType.BLUE)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${currentTeam === TeamType.BLUE ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Blue Team
                </button>
                <button 
                  onClick={() => setCurrentTeam(TeamType.GREEN)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${currentTeam === TeamType.GREEN ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Green Team
                </button>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-6 py-8">
        
        {/* ================= BLUE TEAM ================= */}
        {currentTeam === TeamType.BLUE && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-3 space-y-6">
              {/* Configuration */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                  <Clock size={18} /> Configuration
                </h2>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Show Frequency (min)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={config.frequency}
                        onChange={(e) => setConfig({ ...config, frequency: parseInt(e.target.value) || 0 })}
                        className="w-full pl-10 pr-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium shadow-sm"
                      />
                      <Clock className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">First Show Start</label>
                    <input type="text" value={config.firstShowTime} onChange={(e) => handleTimeChange(e.target.value, 'firstShowTime')} className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl font-medium shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Employees (Count)</label>
                    <div className="relative">
                      <input type="number" value={config.numEmployees} onChange={(e) => setConfig({ ...config, numEmployees: parseInt(e.target.value) || 1 })} className="w-full pl-10 pr-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl font-medium shadow-sm" />
                      <Users className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Last Show Start</label>
                    <input type="text" value={config.lastShowTime} onChange={(e) => handleTimeChange(e.target.value, 'lastShowTime')} className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl font-medium shadow-sm" />
                  </div>
                </div>
              </div>

              {/* Staff Names - NEW GRID LAYOUT */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                  <UserCircle size={18} /> Staff & Availability
                </h2>
                {/* Changed to grid to avoid scrolling */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {Array.from({ length: config.numEmployees }).map((_, i) => {
                    const id = `A${i+1}`;
                    const shift = employeeShifts[id];
                    return (
                      <div key={id} className="flex flex-col gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-blue-300 transition-all group shadow-sm hover:shadow-md">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-500 text-xs shadow-sm shrink-0">{id}</div>
                            <div className="flex-1 min-w-0">
                                <input type="text" placeholder="Staff Name" value={employeeNames[id] || ''} onChange={(e) => setEmployeeNames(prev => ({ ...prev, [id]: e.target.value }))} className="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:ring-0" />
                                <div className="h-0.5 w-full bg-slate-200 mt-1 group-hover:bg-blue-400 transition-colors rounded-full"></div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 bg-white px-2 py-2 rounded-lg border border-slate-200 shadow-inner w-full">
                             <div className="flex flex-col gap-0.5 flex-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide text-center">Arrive</span>
                                <input type="text" placeholder="09:00" value={shift?.start || ''} onChange={(e) => updateEmployeeShift(id, 'start', e.target.value)} className="w-full text-center text-sm font-mono font-bold text-slate-700 bg-slate-50 rounded border border-slate-200 focus:border-blue-500 py-1" />
                             </div>
                             <ArrowRight className="text-slate-300 mt-3" size={14} />
                             <div className="flex flex-col gap-0.5 flex-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide text-center">Leave</span>
                                <input type="text" placeholder="17:00" value={shift?.end || ''} onChange={(e) => updateEmployeeShift(id, 'end', e.target.value)} className="w-full text-center text-sm font-mono font-bold text-slate-700 bg-slate-50 rounded border border-slate-200 focus:border-blue-500 py-1" />
                             </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Station Rules */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Settings2 size={18} /> Station Rules
                  </h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <label className="block text-sm font-bold text-teal-800">Ocean Duration</label>
                      <button onClick={() => setConfig(c => ({ ...c, durationOcean: Math.max(c.frequency, c.durationOcean) }))} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100">Rec: {Math.max(config.frequency, config.durationOcean)}m</button>
                    </div>
                    <input type="number" value={config.durationOcean} onChange={(e) => setConfig({ ...config, durationOcean: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-medium shadow-sm" />
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <label className="block text-sm font-bold text-rose-800">Floor -1 Duration</label>
                      <button onClick={() => setConfig(c => ({ ...c, durationFloor: Math.max(c.frequency, 10) }))} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100">Rec: {Math.max(config.frequency, 10)}m</button>
                    </div>
                    <input type="number" value={config.durationFloor} onChange={(e) => setConfig({ ...config, durationFloor: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-medium shadow-sm" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Vis */}
            <div className="lg:col-span-9 space-y-6">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-1">Schedule Analysis</h2>
                  <div className="text-sm flex items-center gap-2">
                    {totalCurrentIssues === 0 ? (
                      <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 border border-emerald-200">
                        <CheckCircle2 size={12} />
                        All Stations Covered
                      </span>
                    ) : (
                      <span className="bg-rose-100 text-rose-800 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 border border-rose-200">
                        <AlertTriangle size={12} />
                        {totalCurrentIssues} Issues Detected
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={handleAnalyze} disabled={isAnalyzing} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 transition-all disabled:opacity-70 transform hover:-translate-y-0.5">
                  {isAnalyzing ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
                  Analyze Schedule
                </button>
              </div>

              {/* Warnings */}
              {schedule && visibleIssues.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-sm flex flex-col lg:flex-row justify-between items-start gap-6">
                  <div className="flex-1 w-full">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-rose-900 font-bold text-sm flex items-center gap-2">
                          <AlertTriangle size={18} /> Coverage Gaps (Upcoming)
                        </h3>
                        {schedule.issues.length > 4 && (
                          <button onClick={() => setShowAllIssues(!showAllIssues)} className="text-[10px] font-bold text-rose-700 hover:text-rose-900 bg-white/50 hover:bg-white px-2 py-1 rounded border border-rose-100 flex items-center gap-1 transition-all">
                            {showAllIssues ? <><ChevronUp size={12} /></> : <><ChevronDown size={12} /></>}
                          </button>
                        )}
                      </div>
                      <ul className={`grid grid-cols-1 md:grid-cols-2 gap-2 transition-all duration-300 ${showAllIssues ? 'max-h-[300px] overflow-y-auto pr-2 custom-scrollbar' : ''}`}>
                        {visibleIssues.map((issue, idx) => (
                          <li key={idx} className="text-xs font-medium text-rose-700 flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-rose-100 shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0"></span>
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                  </div>
                  <div className="flex flex-col items-start gap-2 shrink-0">
                    <button onClick={applySmartDurations} className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-3 rounded-xl text-xs font-bold shadow-md shadow-rose-200 flex items-center gap-2 transition-all transform hover:scale-105 whitespace-nowrap">
                      <Wand2 size={16} /> Auto-Fix Gaps
                    </button>
                  </div>
                </div>
              )}

              {/* Cards - THIS REPLACES THE TIMELINE VISUALIZATION */}
              {schedule && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
                  {employeeIds.map(empId => (
                    <EmployeeCard 
                      key={empId}
                      employeeId={empId} 
                      employeeName={employeeNames[empId]}
                      blocks={schedule.blocks.filter(b => b.employeeId === empId)} 
                      className="h-[380px]" 
                      currentTime={currentTime}
                      fadePastEvents={fadePastEvents}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= GREEN TEAM ================= */}
        {currentTeam === TeamType.GREEN && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-3 space-y-6">
              {/* Green Config */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                 <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2"><Clock size={18} /> Green Config</h2>
                 <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Employees (Count)</label>
                      <div className="relative">
                        <input type="number" value={numGreenEmployees} onChange={(e) => setNumGreenEmployees(parseInt(e.target.value) || 4)} className="w-full pl-10 pr-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-medium shadow-sm" />
                        <Users className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setGreenRefreshTrigger(prev => prev + 1)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-emerald-200 shadow-md"><RefreshCw size={16} /> Re-Shuffle</button>
                      {forcedAssignments.length > 0 && (
                        <button onClick={clearForcedAssignments} className="bg-white border border-slate-300 text-slate-500 hover:text-slate-700 hover:bg-slate-50 p-3 rounded-xl transition-colors" title="Clear all manual overrides"><Unlock size={16} /></button>
                      )}
                    </div>
                 </div>
              </div>

               {/* Shift Exceptions */}
               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                 <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><CalendarClock size={18} /> Shift Exceptions</h2>
                    <button onClick={addShiftException} className="text-emerald-600 bg-emerald-50 p-1.5 rounded-lg hover:bg-emerald-100 transition-colors"><Plus size={16} /></button>
                 </div>
                 <div className="space-y-3">
                    {shiftExceptions.map(ex => (
                       <div key={ex.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                          <div className="flex justify-between items-center">
                             <span className="font-bold text-slate-600">Custom Hours</span>
                             <button onClick={() => removeShiftException(ex.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={14}/></button>
                          </div>
                          <div className="space-y-2">
                             <select value={ex.employeeId} onChange={(e) => updateShiftException(ex.id, 'employeeId', e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5">
                                {Array.from({length: numGreenEmployees}).map((_, i) => <option key={i} value={`B${i+1}`}>{getGreenEmployeeName(`B${i+1}`)}</option>)}
                             </select>
                             <div className="flex items-center gap-2">
                                <input type="text" value={ex.startTime} onChange={(e) => updateShiftException(ex.id, 'startTime', e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-center" />
                                <span className="text-slate-400">-</span>
                                <input type="text" value={ex.endTime} onChange={(e) => updateShiftException(ex.id, 'endTime', e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-center" />
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>

              {/* Side Tasks */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                 <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Settings2 size={18} /> Side Tasks</h2>
                    <button onClick={addSideTask} className="text-emerald-600 bg-emerald-50 p-1.5 rounded-lg hover:bg-emerald-100 transition-colors"><Plus size={16} /></button>
                 </div>
                 <div className="space-y-3">
                    {sideTasks.map(task => (
                       <div key={task.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                          <div className="flex justify-between items-center">
                             <span className="font-bold text-slate-600">Locked Out Task</span>
                             <button onClick={() => removeSideTask(task.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={14}/></button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                             <select value={task.rotationId} onChange={(e) => updateSideTask(task.id, 'rotationId', parseInt(e.target.value))} className="bg-white border border-slate-300 rounded p-1"> {[1,2,3,4,5].map(r => <option key={r} value={r}>Rot {r}</option>)} </select>
                             <select value={task.employeeId} onChange={(e) => updateSideTask(task.id, 'employeeId', e.target.value)} className="bg-white border border-slate-300 rounded p-1"> {Array.from({length: numGreenEmployees}).map((_, i) => <option key={i} value={`B${i+1}`}>{getGreenEmployeeName(`B${i+1}`)}</option>)} </select>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>

               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2"><UserCircle size={18} /> Green Team Names</h2>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {Array.from({ length: numGreenEmployees }).map((_, i) => {
                    const id = `B${i+1}`;
                    return (
                      <div key={id} className="flex items-center gap-3 text-sm p-1 rounded-lg hover:bg-slate-50 transition-colors">
                        <span className="font-bold text-slate-700 w-9 flex-shrink-0 bg-slate-100 py-2 rounded text-center shadow-sm border border-slate-200">{id}</span>
                        <input type="text" placeholder={`Name for ${id}`} value={greenEmployeeNames[id] || ''} onChange={(e) => setGreenEmployeeNames(prev => ({ ...prev, [id]: e.target.value }))} className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium placeholder:text-slate-400 text-xs" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="lg:col-span-9 space-y-6">
                 {activeGreenNotifications.length > 0 && (
                   <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 animate-fade-in">
                      <div className="flex items-center gap-2 mb-3">
                        <Bell size={18} className="text-slate-500" />
                        <h3 className="font-bold text-slate-700">Notifications & Insights</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                        {activeGreenNotifications.map((note) => (
                          <div key={note.id} className={`p-3 rounded-xl border flex items-start gap-3 text-xs shadow-sm ${note.type === 'critical' ? 'bg-red-50 border-red-200 text-red-800' : note.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-100 text-blue-800'}`}>
                             <div className="mt-0.5">
                               {note.type === 'critical' && <AlertTriangle size={14} className="text-red-500" />}
                               {note.type === 'warning' && <AlertTriangle size={14} className="text-amber-500" />}
                               {note.type === 'info' && <Info size={14} className="text-blue-500" />}
                             </div>
                             <div>
                               <span className="font-bold block uppercase tracking-wide opacity-70 mb-0.5 text-[9px]">{note.type}</span>
                               <p className="leading-snug">{note.message}</p>
                             </div>
                          </div>
                        ))}
                      </div>
                   </div>
                 )}

                 <div className="space-y-6">
                 {greenData.rotations.map((rot) => {
                    const isPast = isRotationPast(rot.id);
                    const shouldFade = isPast && fadePastEvents;
                    return (
                    <div key={rot.id} className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-500 ${shouldFade ? 'opacity-40 grayscale-[80%]' : ''}`}>
                       <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                          <div className="flex items-center gap-4">
                             <div className={`font-bold px-3 py-1 rounded-lg text-sm ${isPast ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-800'}`}>
                                Rotation {rot.id}
                             </div>
                             <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                                <Clock size={16} />
                                {rot.timeRange}
                             </div>
                             {isPast && <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-slate-300 px-2 py-0.5 rounded">Completed</span>}
                          </div>
                       </div>
                       <div className="p-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                             {/* Stations loop */}
                             {[GreenStation.TICKET, GreenStation.GREETER, GreenStation.PLANETARIUM, GreenStation.MUSEUM].map((station) => {
                                let minReq = 0;
                                if (station === GreenStation.TICKET) minReq = 2;
                                if (station === GreenStation.GREETER) minReq = 1;
                                if (station === GreenStation.PLANETARIUM) minReq = 1;
                                
                                // Do not show missing warning if in past
                                const showMissing = !isPast && rot.assignments[station].length < minReq && station !== GreenStation.MUSEUM;

                                return (
                                 <div key={station} className={`space-y-2 ${station === GreenStation.MUSEUM ? 'lg:col-span-2' : ''}`}>
                                    <div className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md inline-block ${getStationLabelColor(station)}`}>
                                      {rot.id === 3 && station === GreenStation.MUSEUM ? "Museum (Breaks)" : station}
                                    </div>
                                    <StationDropZone rotationId={rot.id} station={station} isMissing={showMissing} className="flex flex-wrap gap-2 min-h-[80px] rounded-xl bg-slate-50/50 p-2 border border-slate-100">
                                       {rot.assignments[station].map(id => (
                                          <div key={id} className={`rounded-lg border shadow-sm w-full md:w-auto min-w-[130px] ${getStationStyle(station)}`}>
                                             {renderGreenEmployee(id, rot.timeRange, rot.id, station)}
                                          </div>
                                       ))}
                                       {showMissing && <div className="p-3 rounded-lg border border-dashed border-red-200 bg-red-50/50 text-red-400 text-xs font-medium text-center w-full">Missing Staff</div>}
                                       {station === GreenStation.MUSEUM && rot.assignments[station].length === 0 && <div className="p-3 rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs text-center w-full flex items-center justify-center">No staff assigned</div>}
                                    </StationDropZone>
                                 </div>
                                )
                             })}
                          </div>
                          {(rot.assignments[GreenStation.SIDE_TASK].length > 0) && (
                            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                               {rot.assignments[GreenStation.SIDE_TASK].length > 0 && (
                                  <div>
                                     <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Busy (Side Task)</h4>
                                     <div className="flex flex-wrap gap-2">
                                        {rot.assignments[GreenStation.SIDE_TASK].map(id => (
                                           <span key={id} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs border border-slate-200 font-medium">
                                              {renderGreenEmployee(id, rot.timeRange, rot.id, GreenStation.SIDE_TASK)}
                                           </span>
                                        ))}
                                     </div>
                                  </div>
                               )}
                            </div>
                          )}
                       </div>
                    </div>
                  )})}
                 </div>
              </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
