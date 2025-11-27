
import { GreenRotation, GreenStation, SideTaskRule, ShiftException, GeneratedGreenSchedule, GreenNotification, ForcedAssignment } from '../types';

export const ROTATIONS_META = [
  { id: 1, start: "09:00", end: "10:30" },
  { id: 2, start: "10:30", end: "12:00" },
  { id: 3, start: "12:00", end: "14:00" },
  { id: 4, start: "14:00", end: "15:30" },
  { id: 5, start: "15:30", end: "17:00" }
];

// Helper to convert HH:mm to minutes from midnight
const getMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// Shuffle array helper
const shuffle = <T>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export const generateGreenSchedule = (
  numEmployees: number,
  sideTasks: SideTaskRule[],
  shiftExceptions: ShiftException[],
  forcedAssignments: ForcedAssignment[] = []
): GeneratedGreenSchedule => {
  const employees = Array.from({ length: numEmployees }, (_, i) => `B${i + 1}`);
  const notifications: GreenNotification[] = [];
  
  // Track history: employeeId -> List of stations they have done
  const history: Record<string, GreenStation[]> = {};
  employees.forEach(id => history[id] = []);

  const rotations: GreenRotation[] = [];

  // Pre-process Info notifications for global context
  shiftExceptions.forEach(ex => {
    notifications.push({
      id: `shift-${ex.id}`,
      type: 'info',
      message: `${ex.employeeId} has a custom shift (${ex.startTime}-${ex.endTime}).`
    });
  });

  ROTATIONS_META.forEach(rotMeta => {
    const rotStartMins = getMinutes(rotMeta.start);
    const rotEndMins = getMinutes(rotMeta.end);

    const assignments: Record<GreenStation, string[]> = {
      [GreenStation.TICKET]: [],
      [GreenStation.GREETER]: [],
      [GreenStation.PLANETARIUM]: [],
      [GreenStation.MUSEUM]: [],
      [GreenStation.SIDE_TASK]: [],
      [GreenStation.OFF_SHIFT]: []
    };

    // 1. Categorize Employees for this Rotation
    const availablePool: string[] = [];
    const poolMap = new Set<string>(); // Fast lookup

    employees.forEach(empId => {
      // Check Shift Exceptions
      const exception = shiftExceptions.find(e => e.employeeId === empId);
      let isPresent = true;

      if (exception) {
        const shiftStartMins = getMinutes(exception.startTime);
        const shiftEndMins = getMinutes(exception.endTime);
        
        // Relaxed Logic: Overlap means present
        if (shiftEndMins <= rotStartMins || shiftStartMins >= rotEndMins) {
           isPresent = false;
        }
      }

      if (!isPresent) {
        assignments[GreenStation.OFF_SHIFT].push(empId);
        return;
      }

      // Check Side Tasks
      const sideTask = sideTasks.find(t => t.rotationId === rotMeta.id && t.employeeId === empId);
      if (sideTask) {
        assignments[GreenStation.SIDE_TASK].push(empId);
        history[empId].push(GreenStation.SIDE_TASK);
        notifications.push({
          id: `side-${rotMeta.id}-${empId}`,
          type: 'info',
          message: `${empId} assigned to Side Task in Rotation ${rotMeta.id}.`,
          rotationId: rotMeta.id
        });
      } else {
        availablePool.push(empId);
        poolMap.add(empId);
      }
    });

    // 2. Process Forced Assignments (Manual Overrides) first
    // This allows manual moves in Rot 1 to immediately affect history for Rot 2
    const rotationForces = forcedAssignments.filter(f => f.rotationId === rotMeta.id);
    
    rotationForces.forEach(force => {
        // Manual Override Validation Logic (Notify user if they break rules)
        const past = history[force.employeeId];
        const lastStation = past.length > 0 ? past[past.length - 1] : null;

        // User requested notification for manual override of rules
        if (lastStation === force.station) {
            notifications.push({
                id: `warn-force-repeat-${rotMeta.id}-${force.employeeId}`,
                type: 'warning',
                message: `Manual Override: ${force.employeeId} is repeating ${force.station} consecutively in Rotation ${rotMeta.id}.`
            });
        }

        if (force.station === GreenStation.PLANETARIUM && past.includes(GreenStation.PLANETARIUM)) {
            notifications.push({
                id: `warn-force-arora-${rotMeta.id}-${force.employeeId}`,
                type: 'warning',
                message: `Manual Override: ${force.employeeId} is assigned Planetarium more than once.`
            });
        }

        // Remove from whatever list they were in
        assignments[GreenStation.OFF_SHIFT] = assignments[GreenStation.OFF_SHIFT].filter(id => id !== force.employeeId);
        assignments[GreenStation.SIDE_TASK] = assignments[GreenStation.SIDE_TASK].filter(id => id !== force.employeeId);
        
        // Remove from available pool if they were there
        const poolIndex = availablePool.indexOf(force.employeeId);
        if (poolIndex > -1) {
          availablePool.splice(poolIndex, 1);
        }

        // Add to assigned station
        if (!assignments[force.station].includes(force.employeeId)) {
          assignments[force.station].push(force.employeeId);
          history[force.employeeId].push(force.station);
        }
    });

    // Shuffle remaining available pool for randomness
    let availableEmployees = shuffle(availablePool);

    // Helper to assign best candidate to a station
    const assignBestCandidates = (station: GreenStation, targetCount: number) => {
      // Calculate how many we still need after forced assignments
      const currentCount = assignments[station].length;
      const countNeeded = Math.max(0, targetCount - currentCount);

      for (let i = 0; i < countNeeded; i++) {
        if (availableEmployees.length === 0) {
            // Log shortage only if we really need people
            if (targetCount > 0) {
               if (station !== GreenStation.MUSEUM) {
                  notifications.push({
                    id: `missing-${rotMeta.id}-${station}-${i}`,
                    type: 'critical',
                    message: `Not enough staff for ${station} in Rotation ${rotMeta.id}. Needed ${targetCount}, found ${assignments[station].length}.`,
                    rotationId: rotMeta.id
                  });
               }
            }
            return;
        }

        // Score candidates based on history
        const scoredCandidates = availableEmployees.map(empId => {
          let score = 0;
          const past = history[empId];
          const lastStation = past.length > 0 ? past[past.length - 1] : null;
          const secondLastStation = past.length > 1 ? past[past.length - 2] : null;
          
          // --- RULE 1: NO CONSECUTIVE REPEAT (Strict) ---
          // "Never repeat stations in a row"
          if (lastStation === station) {
             score += 5000000; // Nuclear penalty
          }
          
          // --- RULE 2: GAP OF 2 PREFERENCE (Strict) ---
          // "At least 2 rotation of different station"
          if (secondLastStation === station) {
             score += 200000; // Major penalty
          }
          
          // --- RULE 3: PLANETARIUM MAX ONCE (Strict) ---
          // "Never repeat arora"
          const hasDonePlanetarium = past.includes(GreenStation.PLANETARIUM);
          if (station === GreenStation.PLANETARIUM && hasDonePlanetarium) {
             score += 10000000; // Maximum penalty
          }

          // --- HEURISTIC 1: ESCAPE MUSEUM ---
          // "Jarred repeats museum and in a row" - Fix
          // If the candidate was in Museum last time, prioritize them for this Non-Museum station.
          if (station !== GreenStation.MUSEUM && lastStation === GreenStation.MUSEUM) {
             score -= 1000000; // Massive bonus to be picked
          }

          // --- HEURISTIC 2: SAVE PLANETARIUM VIRGINS ---
          // "Jack is doing twice Arora" - Fix
          // Prefer picking Planetarium-Veterans for Ticket/Greeter to save the Virgins for the Planetarium slot.
          if (station !== GreenStation.PLANETARIUM && !hasDonePlanetarium) {
             score += 2000; // Slight penalty: "Don't pick me for Ticket, save me for Planetarium"
          }

          // Soft Rule: Variety
          const timesDone = past.filter(s => s === station).length;
          score += (timesDone * 1000); 

          // Random factor
          score += Math.random() * 10;

          return { empId, score };
        });

        // Sort by score ascending (lowest score is best)
        scoredCandidates.sort((a, b) => a.score - b.score);
        const bestCandidate = scoredCandidates[0];
        const best = bestCandidate.empId;

        // Validation Logging
        const past = history[best];
        const lastStation = past.length > 0 ? past[past.length - 1] : null;

        // Warn if strict rules are broken (shouldn't happen with these scores unless 1 person is left)
        if (lastStation === station && station !== GreenStation.MUSEUM) {
            notifications.push({
                id: `warn-repeat-${rotMeta.id}-${best}`,
                type: 'warning',
                message: `${best} is repeating ${station} back-to-back in Rotation ${rotMeta.id} (No other options).`,
                rotationId: rotMeta.id
            });
        }
        
        if (station === GreenStation.PLANETARIUM && past.includes(GreenStation.PLANETARIUM)) {
             notifications.push({
                id: `warn-limit-arora-${rotMeta.id}-${best}`,
                type: 'critical',
                message: `${best} is assigned Planetarium for the 2nd time (Logic failed).`,
                rotationId: rotMeta.id
            });
        }
        
        assignments[station].push(best);
        history[best].push(station);
        
        availableEmployees = availableEmployees.filter(e => e !== best);
      }
    };

    // --- PRIORITIES ---
    // 1. Ticket (1st)
    assignBestCandidates(GreenStation.TICKET, 1);
    // 2. Greeter (1st)
    assignBestCandidates(GreenStation.GREETER, 1);
    // 3. Planetarium (1st)
    assignBestCandidates(GreenStation.PLANETARIUM, 1);
    // 4. Ticket (2nd)
    assignBestCandidates(GreenStation.TICKET, 2);

    // 5. Museum (Dump)
    const currentMuseumCount = assignments[GreenStation.MUSEUM].length;
    const remainingCount = availableEmployees.length;
    assignBestCandidates(GreenStation.MUSEUM, currentMuseumCount + remainingCount);

    rotations.push({
      id: rotMeta.id,
      timeRange: `${rotMeta.start} - ${rotMeta.end}`,
      assignments
    });
  });

  return { rotations, notifications };
};
