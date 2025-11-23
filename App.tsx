
import React, { useState, useEffect, useMemo } from 'react';
import { ScheduleConfig, GeneratedSchedule, LunchConfig, TeamType, SideTaskRule, GreenRotation, GreenStation, ShiftException, GeneratedGreenSchedule, GreenNotification } from './types';
import { generateSchedule } from './services/scheduler';
import { generateGreenSchedule } from './services/greenScheduler';
import { EmployeeCard } from './components/EmployeeCard';
import { analyzeScheduleWithGemini, generateLunchPlan } from './services/geminiService';
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
  Palette,
  Plus,
  Trash2,
  CalendarClock,
  Bell,
  Info
} from 'lucide-react';

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
  const [currentTeam, setCurrentTeam] = useState<TeamType>(TeamType.BLUE);

  // --- Blue Team State ---
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG);
  const [lunchConfig, setLunchConfig] = useState<LunchConfig>({ windowStart: "12:00", windowEnd: "14:00", duration: 35 });
  const [employeeOffsets, setEmployeeOffsets] = useState<Record<string, number>>({});
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState<GeneratedSchedule | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lunchAnalysis, setLunchAnalysis] = useState<string>("");
  const [isPlanningLunch, setIsPlanningLunch] = useState(false);
  const [showAllIssues, setShowAllIssues] = useState(false);

  // --- Green Team State ---
  const [numGreenEmployees, setNumGreenEmployees] = useState(6);
  const [greenEmployeeNames, setGreenEmployeeNames] = useState<Record<string, string>>({});
  const [sideTasks, setSideTasks] = useState<SideTaskRule[]>([]);
  const [shiftExceptions, setShiftExceptions] = useState<ShiftException[]>([]);
  const [greenData, setGreenData] = useState<GeneratedGreenSchedule>({ rotations: [], notifications: [] });
  const [greenRefreshTrigger, setGreenRefreshTrigger] = useState(0); // To force re-shuffle

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
      const newSchedule = generateSchedule(config, employeeOffsets);
      setSchedule(newSchedule);
    }
  }, [config, employeeOffsets]);

  // --- Effects (Green) ---
  useEffect(() => {
    const gd = generateGreenSchedule(numGreenEmployees, sideTasks, shiftExceptions);
    setGreenData(gd);
  }, [numGreenEmployees, sideTasks, shiftExceptions, greenRefreshTrigger]);

  // --- Handlers (Blue) ---
  const handleAnalyze = async () => {
    if (!schedule) return;
    setIsAnalyzing(true);
    const configSummary = `Freq: ${config.frequency}m, Start: ${config.firstShowTime}, End: ${config.lastShowTime}, Staff: ${config.numEmployees}, Ocean: ${config.durationOcean}m, Floor: ${config.durationFloor}m`;
    const result = await analyzeScheduleWithGemini(schedule, configSummary, employeeNames);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  const handleLunchPlan = async () => {
    if (!schedule) return;
    setIsPlanningLunch(true);
    const result = await generateLunchPlan(schedule, lunchConfig, config.numEmployees, employeeNames);
    setLunchAnalysis(result);
    setIsPlanningLunch(false);
  }

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

  const visibleIssues = useMemo(() => {
    if (!schedule) return [];
    return showAllIssues ? schedule.issues : schedule.issues.slice(0, 4);
  }, [schedule, showAllIssues]);

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

  // --- Render Helpers ---
  const getGreenEmployeeName = (id: string) => greenEmployeeNames[id] || id;

  const getStationStyle = (station: GreenStation) => {
    switch (station) {
      case GreenStation.TICKET: return 'bg-amber-100 text-amber-900 border-amber-200';
      case GreenStation.GREETER: return 'bg-orange-100 text-orange-900 border-orange-200';
      case GreenStation.PLANETARIUM: return 'bg-emerald-100 text-emerald-900 border-emerald-200';
      case GreenStation.MUSEUM: return 'bg-indigo-100 text-indigo-900 border-indigo-200';
      case GreenStation.SIDE_TASK: return 'bg-slate-100 text-slate-600 border-slate-200 italic';
      case GreenStation.OFF_SHIFT: return 'bg-slate-50 text-slate-400 border-slate-100 border-dashed';
      default: return 'bg-white';
    }
  };

  // Helper to get partial shift notice
  const getShiftNotice = (empId: string, rotTimeRange: string) => {
    const exception = shiftExceptions.find(e => e.employeeId === empId);
    if (!exception) return null;

    // rotTimeRange format "09:00 - 10:30"
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

  const renderGreenEmployee = (id: string, rotTimeRange: string) => {
    const notice = getShiftNotice(id, rotTimeRange);
    return (
      <div className="flex items-center justify-between w-full">
        <span>{getGreenEmployeeName(id)}</span>
        {notice && (
          <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full font-bold ml-2 whitespace-nowrap shadow-sm border border-amber-300">
            {notice}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans relative">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6 h-18 flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg transition-colors ${currentTeam === TeamType.BLUE ? 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-blue-200' : 'bg-gradient-to-br from-emerald-600 to-teal-600 shadow-emerald-200'}`}>
              <Palette size={22} />
            </div>
            <div>
              <h1 className={`text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r tracking-tight ${currentTeam === TeamType.BLUE ? 'from-blue-800 to-indigo-800' : 'from-emerald-800 to-teal-800'}`}>
                MuseumFlow
              </h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{currentTeam} Team Manager</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
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
        
        {/* ====================================================================================
                                          BLUE TEAM VIEW
           ==================================================================================== */}
        {currentTeam === TeamType.BLUE && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Controls */}
            <div className="lg:col-span-3 space-y-6">
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
                        className="w-full pl-10 pr-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium shadow-sm"
                      />
                      <Clock className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">First Show Start</label>
                    <input 
                      type="text" 
                      value={config.firstShowTime}
                      onChange={(e) => handleTimeChange(e.target.value, 'firstShowTime')}
                      placeholder="09:20"
                      className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Employees (Count)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={config.numEmployees}
                        onChange={(e) => setConfig({ ...config, numEmployees: parseInt(e.target.value) || 1 })}
                        className="w-full pl-10 pr-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium shadow-sm"
                      />
                      <Users className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Last Show Start</label>
                    <input 
                      type="text" 
                      value={config.lastShowTime}
                      onChange={(e) => handleTimeChange(e.target.value, 'lastShowTime')}
                      placeholder="16:40"
                      className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium shadow-sm"
                    />
                  </div>
                </div>
              </div>

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
                      <button 
                        onClick={() => setConfig(c => ({ ...c, durationOcean: Math.max(c.frequency, c.durationOcean) }))}
                        className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100"
                        title="Recommended to eliminate gaps"
                      >
                        Rec: {Math.max(config.frequency, config.durationOcean)}m
                      </button>
                    </div>
                    <input 
                      key={`ocean-${config.durationOcean}`}
                      type="number" 
                      value={config.durationOcean}
                      onChange={(e) => setConfig({ ...config, durationOcean: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-medium shadow-sm"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <label className="block text-sm font-bold text-rose-800">Floor -1 Duration</label>
                      <button 
                        onClick={() => setConfig(c => ({ ...c, durationFloor: Math.max(c.frequency, 10) }))}
                        className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100"
                        title="Recommended to eliminate gaps"
                      >
                        Rec: {Math.max(config.frequency, 10)}m
                      </button>
                    </div>
                    <input 
                      key={`floor-${config.durationFloor}`}
                      type="number" 
                      value={config.durationFloor}
                      onChange={(e) => setConfig({ ...config, durationFloor: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-medium shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                  <Sandwich size={18} /> Lunch Logistics
                </h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Start</label>
                        <input 
                          type="text" 
                          value={lunchConfig.windowStart}
                          onChange={(e) => handleTimeChange(e.target.value, 'lunchStart')}
                          placeholder="12:00"
                          className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">End</label>
                        <input 
                          type="text" 
                          value={lunchConfig.windowEnd}
                          onChange={(e) => handleTimeChange(e.target.value, 'lunchEnd')}
                          placeholder="14:00"
                          className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900"
                        />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Duration (incl. buffer)</label>
                    <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          value={lunchConfig.duration}
                          onChange={(e) => setLunchConfig({ ...lunchConfig, duration: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900"
                        />
                        <span className="text-xs text-slate-400 font-medium">min</span>
                    </div>
                  </div>
                  <button
                    onClick={handleLunchPlan}
                    disabled={isPlanningLunch}
                    className="w-full mt-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
                  >
                    {isPlanningLunch ? <RefreshCw className="animate-spin" size={14} /> : <Wand2 size={14} />}
                    Generate Lunch Plan
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                  <UserCircle size={18} /> Staff Names
                </h2>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {Array.from({ length: config.numEmployees }).map((_, i) => {
                    const id = `A${i+1}`;
                    return (
                      <div key={id} className="flex items-center gap-3 text-sm p-1 rounded-lg hover:bg-slate-50 transition-colors">
                        <span className="font-bold text-slate-700 w-9 flex-shrink-0 bg-slate-100 py-2 rounded text-center shadow-sm border border-slate-200">{id}</span>
                        <input 
                          type="text"
                          placeholder={`Name for ${id}`}
                          value={employeeNames[id] || ''}
                          onChange={(e) => setEmployeeNames(prev => ({ ...prev, [id]: e.target.value }))}
                          className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium placeholder:text-slate-400 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Center/Right: Visualization */}
            <div className="lg:col-span-9 space-y-6">
              
              {/* Status Bar */}
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-1">Blue Team Overview</h2>
                  <div className="text-sm flex items-center gap-2">
                    {schedule?.issues.length === 0 ? (
                      <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 border border-emerald-200">
                        <CheckCircle2 size={12} />
                        All Stations Covered
                      </span>
                    ) : (
                      <span className="bg-rose-100 text-rose-800 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 border border-rose-200">
                        <AlertTriangle size={12} />
                        {schedule?.issues.length} Issues Detected
                      </span>
                    )}
                  </div>
                </div>
                
                <button 
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 transition-all disabled:opacity-70 transform hover:-translate-y-0.5"
                >
                  {isAnalyzing ? (
                    <RefreshCw className="animate-spin" size={18} />
                  ) : (
                    <Sparkles size={18} />
                  )}
                  Analyze Schedule
                </button>
              </div>

              {/* Lunch Plan Result */}
              {lunchAnalysis && (
                <div className="bg-white border-l-4 border-emerald-500 rounded-xl p-6 shadow-md animate-fade-in relative overflow-hidden">
                  <button 
                    onClick={() => setLunchAnalysis("")} 
                    className="absolute top-4 right-4 text-emerald-300 hover:text-emerald-600 transition-colors z-20 p-1 rounded-full hover:bg-emerald-50"
                    title="Dismiss plan"
                  >
                    <X size={20} />
                  </button>
                  <h3 className="text-emerald-900 font-bold flex items-center gap-2 mb-3 text-lg relative z-10">
                    <Sandwich size={20} className="text-emerald-600" /> Lunch Logistics Plan
                  </h3>
                  <div className="prose prose-emerald max-w-none text-slate-700 relative z-10 leading-relaxed text-sm">
                    <div dangerouslySetInnerHTML={{ __html: lunchAnalysis.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-900">$1</strong>') }} />
                  </div>
                </div>
              )}

              {/* AI Analysis Result */}
              {aiAnalysis && (
                <div className="bg-white border-l-4 border-indigo-500 rounded-xl p-6 shadow-md animate-fade-in relative overflow-hidden">
                  <button 
                    onClick={() => setAiAnalysis("")} 
                    className="absolute top-4 right-4 text-indigo-300 hover:text-indigo-600 transition-colors z-20 p-1 rounded-full hover:bg-indigo-50"
                    title="Dismiss analysis"
                  >
                    <X size={20} />
                  </button>

                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Sparkles size={120} />
                  </div>
                  <h3 className="text-indigo-900 font-bold flex items-center gap-2 mb-3 text-lg relative z-10">
                    <Sparkles size={20} className="text-indigo-600" /> AI Assistant Analysis
                  </h3>
                  <div className="prose prose-indigo max-w-none text-slate-700 relative z-10 leading-relaxed text-sm">
                    <div dangerouslySetInnerHTML={{ __html: aiAnalysis.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong class="text-indigo-900">$1</strong>') }} />
                  </div>
                </div>
              )}

              {/* Warning List & Auto Fix */}
              {schedule && schedule.issues.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-sm flex flex-col lg:flex-row justify-between items-start gap-6">
                  <div className="flex-1 w-full">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-rose-900 font-bold text-sm flex items-center gap-2">
                          <AlertTriangle size={18} /> Critical Coverage Gaps Detected
                        </h3>
                        {schedule.issues.length > 4 && (
                          <button 
                            onClick={() => setShowAllIssues(!showAllIssues)}
                            className="text-[10px] font-bold text-rose-700 hover:text-rose-900 bg-white/50 hover:bg-white px-2 py-1 rounded border border-rose-100 flex items-center gap-1 transition-all"
                          >
                            {showAllIssues ? (
                              <>Show Less <ChevronUp size={12} /></>
                            ) : (
                              <>Show All ({schedule.issues.length}) <ChevronDown size={12} /></>
                            )}
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
                        {!showAllIssues && schedule.issues.length > 4 && (
                          <li 
                            onClick={() => setShowAllIssues(true)}
                            className="text-xs text-rose-700 pt-1 font-medium pl-2 cursor-pointer hover:underline"
                          >
                            + {schedule.issues.length - 4} more...
                          </li>
                        )}
                      </ul>
                  </div>
                  <div className="flex flex-col items-start gap-2 shrink-0">
                    <p className="text-[10px] text-rose-700 max-w-[200px] leading-tight opacity-80">
                      Fix gaps by syncing durations to frequency.
                    </p>
                    <button 
                        onClick={applySmartDurations}
                        className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-3 rounded-xl text-xs font-bold shadow-md shadow-rose-200 flex items-center gap-2 transition-all transform hover:scale-105 whitespace-nowrap"
                    >
                      <Wand2 size={16} />
                      Auto-Fix Gaps
                    </button>
                  </div>
                </div>
              )}

              {/* Staff Cards Grid */}
              {schedule && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
                  {employeeIds.map(empId => (
                    <EmployeeCard 
                      key={empId}
                      employeeId={empId} 
                      employeeName={employeeNames[empId]}
                      blocks={schedule.blocks.filter(b => b.employeeId === empId)} 
                      className="h-[380px]" 
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================================
                                          GREEN TEAM VIEW
           ==================================================================================== */}
        {currentTeam === TeamType.GREEN && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Col: Config */}
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                 <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                   <Clock size={18} /> Green Config
                 </h2>
                 <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Employees (Count)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          value={numGreenEmployees}
                          onChange={(e) => setNumGreenEmployees(parseInt(e.target.value) || 4)}
                          className="w-full pl-10 pr-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-medium shadow-sm"
                        />
                        <Users className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                      </div>
                    </div>
                    <button 
                      onClick={() => setGreenRefreshTrigger(prev => prev + 1)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-emerald-200 shadow-md"
                    >
                      <RefreshCw size={16} /> Re-Shuffle Rotation
                    </button>
                 </div>
              </div>

               {/* Shift Exceptions */}
               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                 <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                       <CalendarClock size={18} /> Shift Exceptions
                    </h2>
                    <button onClick={addShiftException} className="text-emerald-600 bg-emerald-50 p-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                       <Plus size={16} />
                    </button>
                 </div>
                 <div className="space-y-3">
                    {shiftExceptions.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">All staff working 9-17</p>}
                    {shiftExceptions.map(ex => (
                       <div key={ex.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                          <div className="flex justify-between items-center">
                             <span className="font-bold text-slate-600">Custom Hours</span>
                             <button onClick={() => removeShiftException(ex.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={14}/></button>
                          </div>
                          <div className="space-y-2">
                             <select 
                               value={ex.employeeId}
                               onChange={(e) => updateShiftException(ex.id, 'employeeId', e.target.value)}
                               className="w-full bg-white border border-slate-300 rounded p-1.5"
                             >
                                {Array.from({length: numGreenEmployees}).map((_, i) => (
                                   <option key={i} value={`B${i+1}`}>{getGreenEmployeeName(`B${i+1}`)}</option>
                                ))}
                             </select>
                             <div className="flex items-center gap-2">
                                <input 
                                  type="text" 
                                  value={ex.startTime} 
                                  onChange={(e) => updateShiftException(ex.id, 'startTime', e.target.value)}
                                  className="w-full bg-white border border-slate-300 rounded p-1.5 text-center"
                                  placeholder="10:00"
                                />
                                <span className="text-slate-400">-</span>
                                <input 
                                  type="text" 
                                  value={ex.endTime} 
                                  onChange={(e) => updateShiftException(ex.id, 'endTime', e.target.value)}
                                  className="w-full bg-white border border-slate-300 rounded p-1.5 text-center"
                                  placeholder="14:00"
                                />
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>

              {/* Side Tasks */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                 <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                       <Settings2 size={18} /> Side Tasks
                    </h2>
                    <button onClick={addSideTask} className="text-emerald-600 bg-emerald-50 p-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                       <Plus size={16} />
                    </button>
                 </div>
                 <div className="space-y-3">
                    {sideTasks.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">No side tasks configured.</p>}
                    {sideTasks.map(task => (
                       <div key={task.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                          <div className="flex justify-between items-center">
                             <span className="font-bold text-slate-600">Locked Out Task</span>
                             <button onClick={() => removeSideTask(task.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={14}/></button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                             <select 
                               value={task.rotationId}
                               onChange={(e) => updateSideTask(task.id, 'rotationId', parseInt(e.target.value))}
                               className="bg-white border border-slate-300 rounded p-1"
                             >
                                {[1,2,3,4,5].map(r => <option key={r} value={r}>Rot {r}</option>)}
                             </select>
                             <select 
                               value={task.employeeId}
                               onChange={(e) => updateSideTask(task.id, 'employeeId', e.target.value)}
                               className="bg-white border border-slate-300 rounded p-1"
                             >
                                {Array.from({length: numGreenEmployees}).map((_, i) => (
                                   <option key={i} value={`B${i+1}`}>{getGreenEmployeeName(`B${i+1}`)}</option>
                                ))}
                             </select>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>

               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                  <UserCircle size={18} /> Green Team Names
                </h2>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {Array.from({ length: numGreenEmployees }).map((_, i) => {
                    const id = `B${i+1}`;
                    return (
                      <div key={id} className="flex items-center gap-3 text-sm p-1 rounded-lg hover:bg-slate-50 transition-colors">
                        <span className="font-bold text-slate-700 w-9 flex-shrink-0 bg-slate-100 py-2 rounded text-center shadow-sm border border-slate-200">{id}</span>
                        <input 
                          type="text"
                          placeholder={`Name for ${id}`}
                          value={greenEmployeeNames[id] || ''}
                          onChange={(e) => setGreenEmployeeNames(prev => ({ ...prev, [id]: e.target.value }))}
                          className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium placeholder:text-slate-400 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Col: Green Team View */}
            <div className="lg:col-span-9 space-y-6">
                 
                 {/* Notifications Panel */}
                 {greenData.notifications.length > 0 && (
                   <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 animate-fade-in">
                      <div className="flex items-center gap-2 mb-3">
                        <Bell size={18} className="text-slate-500" />
                        <h3 className="font-bold text-slate-700">Notifications & Insights</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                        {greenData.notifications.map((note) => (
                          <div 
                            key={note.id} 
                            className={`p-3 rounded-xl border flex items-start gap-3 text-xs shadow-sm
                              ${note.type === 'critical' ? 'bg-red-50 border-red-200 text-red-800' : 
                                note.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 
                                'bg-blue-50 border-blue-100 text-blue-800'}`}
                          >
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
                 {greenData.rotations.map((rot) => (
                    <div key={rot.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                       {/* Rotation Header */}
                       <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                          <div className="flex items-center gap-4">
                             <div className="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-lg text-sm">
                                Rotation {rot.id}
                             </div>
                             <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                                <Clock size={16} />
                                {rot.timeRange}
                             </div>
                          </div>
                       </div>

                       {/* Assignment Grid */}
                       <div className="p-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                             
                             {/* Station Cards */}
                             <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket (2)</h4>
                                <div className="space-y-2">
                                   {rot.assignments[GreenStation.TICKET].map(id => (
                                      <div key={id} className={`p-3 rounded-xl border font-bold text-sm shadow-sm flex items-center justify-between ${getStationStyle(GreenStation.TICKET)}`}>
                                         {renderGreenEmployee(id, rot.timeRange)}
                                      </div>
                                   ))}
                                   {rot.assignments[GreenStation.TICKET].length < 2 && (
                                     <div className="p-3 rounded-xl border border-dashed border-red-200 bg-red-50 text-red-400 text-xs font-medium text-center">Missing Staff</div>
                                   )}
                                </div>
                             </div>

                             <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Greeter (1)</h4>
                                <div className="space-y-2">
                                   {rot.assignments[GreenStation.GREETER].map(id => (
                                      <div key={id} className={`p-3 rounded-xl border font-bold text-sm shadow-sm flex items-center justify-between ${getStationStyle(GreenStation.GREETER)}`}>
                                         {renderGreenEmployee(id, rot.timeRange)}
                                      </div>
                                   ))}
                                </div>
                             </div>

                             <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Planetarium (1)</h4>
                                <div className="space-y-2">
                                   {rot.assignments[GreenStation.PLANETARIUM].map(id => (
                                      <div key={id} className={`p-3 rounded-xl border font-bold text-sm shadow-sm flex items-center justify-between ${getStationStyle(GreenStation.PLANETARIUM)}`}>
                                         {renderGreenEmployee(id, rot.timeRange)}
                                      </div>
                                   ))}
                                </div>
                             </div>

                             <div className="space-y-2 lg:col-span-2">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Museum</h4>
                                <div className="grid grid-cols-2 gap-2">
                                   {rot.assignments[GreenStation.MUSEUM].map(id => (
                                      <div key={id} className={`p-3 rounded-xl border font-bold text-sm shadow-sm flex items-center justify-between ${getStationStyle(GreenStation.MUSEUM)}`}>
                                         {renderGreenEmployee(id, rot.timeRange)}
                                      </div>
                                   ))}
                                   {rot.assignments[GreenStation.MUSEUM].length === 0 && (
                                      <div className="p-3 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs text-center col-span-2">No staff assigned</div>
                                   )}
                                </div>
                             </div>

                          </div>

                          {/* Footer: Side Tasks ONLY */}
                          {(rot.assignments[GreenStation.SIDE_TASK].length > 0) && (
                            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                               {rot.assignments[GreenStation.SIDE_TASK].length > 0 && (
                                  <div>
                                     <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Busy (Side Task)</h4>
                                     <div className="flex flex-wrap gap-2">
                                        {rot.assignments[GreenStation.SIDE_TASK].map(id => (
                                           <span key={id} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs border border-slate-200 font-medium">
                                              {renderGreenEmployee(id, rot.timeRange)}
                                           </span>
                                        ))}
                                     </div>
                                  </div>
                               )}
                            </div>
                          )}
                       </div>
                    </div>
                 ))}
                 </div>

              </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;
