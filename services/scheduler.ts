import { addMinutes, format, parse, isBefore, isAfter, differenceInMinutes, startOfDay } from 'date-fns';
import { StationType, GeneratedSchedule, TimeBlock, ScheduleConfig, CoverageIssue } from '../types';

// Constants for duration rules
const DURATION_SHOW = 30; // Show is still fixed at 30 logic-wise as per original requirement

// Buffer after show before Ocean starts
const BUFFER_POST_SHOW = 5;

// Hard cutoff time for starting new tasks (17:00 / 5 PM)
const CUTOFF_HOUR = 17;

/**
 * Generates the full schedule based on config and employee starting offsets.
 */
export const generateSchedule = (
  config: ScheduleConfig,
  employeeOffsets: Record<string, number> // employeeId -> index of show to start at
): GeneratedSchedule => {
  const { frequency, firstShowTime, lastShowTime, numEmployees, durationOcean, durationFloor } = config;
  
  // Calculate dynamic offsets based on user config
  // Cycle: Show(30) + Buffer(5) -> Ocean(durationOcean) -> Floor(durationFloor)
  const offsetOceanStart = DURATION_SHOW + BUFFER_POST_SHOW; 
  const offsetFloorStart = offsetOceanStart + durationOcean;

  // 1. Generate all Show Start Times (The Grid)
  const baseDate = startOfDay(new Date());
  
  // Define the absolute cutoff time (17:00 today)
  const cutoffTime = addMinutes(baseDate, CUTOFF_HOUR * 60);

  // Safety check: parse dates and handle invalid inputs (while user is typing in text fields)
  let start: Date, end: Date;
  try {
    start = parse(firstShowTime, 'HH:mm', baseDate);
    end = parse(lastShowTime, 'HH:mm', baseDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { blocks: [], issues: [], showStartTimes: [] };
    }
  } catch (e) {
    return { blocks: [], issues: [], showStartTimes: [] };
  }
  
  const showStartTimes: Date[] = [];
  let currentShow = start;
  
  // Guard against infinite loops or bad inputs
  if (differenceInMinutes(end, start) <= 0 || frequency <= 0) {
    return { blocks: [], issues: [], showStartTimes: [] };
  }

  while (!isAfter(currentShow, end)) {
    showStartTimes.push(currentShow);
    currentShow = addMinutes(currentShow, frequency);
  }

  const allBlocks: TimeBlock[] = [];

  // 2. Build schedule for each employee
  for (let i = 1; i <= numEmployees; i++) {
    const empId = `A${i}`;
    let showIndex = employeeOffsets[empId] ?? (i - 1); // Default staggered start

    // Calculate path for the entire day
    // We only process if the starting index is within valid show times
    if (showIndex >= 0 && showIndex < showStartTimes.length) {
      let currentCycleStart = showStartTimes[showIndex];
      
      // While the employee can still start a show before the end of the shift
      while (!isAfter(currentCycleStart, end)) {
        
        // --- Block 1: Show ---
        const showStart = currentCycleStart;
        // CUTOFF CHECK: If show starts at or after 17:00, stop everything.
        if (!isBefore(showStart, cutoffTime)) break;

        const showEnd = addMinutes(showStart, DURATION_SHOW);
        allBlocks.push({
          id: `${empId}-${showStart.toISOString()}-show`,
          station: StationType.SHOW,
          startTime: showStart,
          endTime: showEnd,
          employeeId: empId
        });

        // --- Block 2: Ocean ---
        const oceanStart = addMinutes(currentCycleStart, offsetOceanStart);
        // CUTOFF CHECK: If Ocean starts at or after 17:00, stop.
        if (!isBefore(oceanStart, cutoffTime)) break;

        const oceanEnd = addMinutes(oceanStart, durationOcean);
        allBlocks.push({
          id: `${empId}-${showStart.toISOString()}-ocean`,
          station: StationType.OCEAN,
          startTime: oceanStart,
          endTime: oceanEnd,
          employeeId: empId
        });

        // --- Block 3: Floor -1 ---
        const floorStart = addMinutes(currentCycleStart, offsetFloorStart);
        // CUTOFF CHECK: If Floor starts at or after 17:00, stop.
        if (!isBefore(floorStart, cutoffTime)) break;

        const floorEnd = addMinutes(floorStart, durationFloor);
        allBlocks.push({
          id: `${empId}-${showStart.toISOString()}-floor`,
          station: StationType.FLOOR_MINUS_1,
          startTime: floorStart,
          endTime: floorEnd,
          employeeId: empId
        });

        // Find the next available show start time
        // The employee is free after floorEnd.
        // They need to catch a show starting >= floorEnd.
        const nextAvailableShow = showStartTimes.find(t => !isBefore(t, floorEnd));
        
        if (!nextAvailableShow) break; // No more shows today
        
        currentCycleStart = nextAvailableShow;
      }
    }
  }

  // 3. Validation: Check Coverage
  const issues: CoverageIssue[] = [];
  
  showStartTimes.forEach(t => {
    // We strictly check coverage only if the station requirement starts BEFORE 17:00.
    // If a show starts at 16:50 (valid), we check coverage.
    // If a show theoretically started at 17:10 (invalid), we skip checking it.
    
    // Check Show Coverage
    const showReqStart = t;
    if (isBefore(showReqStart, cutoffTime)) {
        const showReqEnd = addMinutes(t, DURATION_SHOW);
        const hasShowStaff = allBlocks.some(b => 
          b.station === StationType.SHOW && 
          !isAfter(b.startTime, showReqStart) && 
          !isBefore(b.endTime, showReqEnd)
        );
        if (!hasShowStaff) {
          issues.push({
            startTime: showReqStart,
            endTime: showReqEnd,
            station: StationType.SHOW,
            missing: true,
            message: `Missing Show staff at ${format(showReqStart, 'HH:mm')}`
          });
        }
    }

    // Check Ocean Coverage
    const oceanReqStart = addMinutes(t, offsetOceanStart);
    if (isBefore(oceanReqStart, cutoffTime)) {
        const oceanReqEnd = addMinutes(oceanReqStart, durationOcean);
        const hasOceanStaff = allBlocks.some(b => 
          b.station === StationType.OCEAN && 
          !isAfter(b.startTime, oceanReqStart) && 
          !isBefore(b.endTime, oceanReqEnd)
        );
        if (!hasOceanStaff) {
          issues.push({
            startTime: oceanReqStart,
            endTime: oceanReqEnd,
            station: StationType.OCEAN,
            missing: true,
            message: `Missing Ocean staff at ${format(oceanReqStart, 'HH:mm')}`
          });
        }
    }

    // Check Floor Coverage
    const floorReqStart = addMinutes(t, offsetFloorStart);
    if (isBefore(floorReqStart, cutoffTime)) {
        const floorReqEnd = addMinutes(floorReqStart, durationFloor);
        const hasFloorStaff = allBlocks.some(b => 
          b.station === StationType.FLOOR_MINUS_1 && 
          !isAfter(b.startTime, floorReqStart) && 
          !isBefore(b.endTime, floorReqEnd)
        );
        if (!hasFloorStaff) {
          issues.push({
            startTime: floorReqStart,
            endTime: floorReqEnd,
            station: StationType.FLOOR_MINUS_1,
            missing: true,
            message: `Missing Floor -1 staff at ${format(floorReqStart, 'HH:mm')}`
          });
        }
    }
  });

  return { blocks: allBlocks, issues, showStartTimes };
};