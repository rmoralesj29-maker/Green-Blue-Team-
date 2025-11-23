
import { GreenRotation, GreenStation, SideTaskRule, ShiftException, GeneratedGreenSchedule, GreenNotification } from '../types';

const ROTATIONS_META = [
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
  shiftExceptions: ShiftException[]
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
      }
    });

    // Shuffle available pool for randomness
    let availableEmployees = shuffle(availablePool);

    // Helper to assign best candidate to a station
    const assignBestCandidates = (station: GreenStation, count: number) => {
      for (let i = 0; i < count; i++) {
        if (availableEmployees.length === 0) {
            // Log shortage
            notifications.push({
              id: `missing-${rotMeta.id}-${station}-${i}`,
              type: 'critical',
              message: `Not enough staff for ${station} in Rotation ${rotMeta.id}. Needed ${count}, found ${i}.`,
              rotationId: rotMeta.id
            });
            return;
        }

        // Score candidates based on history
        const scoredCandidates = availableEmployees.map(empId => {
          let score = 0;
          const past = history[empId];
          const lastStation = past.length > 0 ? past[past.length - 1] : null;
          
          // Penalty: Immediate repetition
          if (lastStation === station) score += 1000;
          
          // Penalty: Done this station 3 or more times already (Goal: Max 3)
          const timesDone = past.filter(s => s === station).length;
          if (timesDone >= 3) score += 5000;
          else if (timesDone >= 2) score += 100; // Soft discouragement
          
          score += (timesDone * 10); // General variety preference

          // Small random factor
          score += Math.random();

          return { empId, score };
        });

        scoredCandidates.sort((a, b) => a.score - b.score);
        const best = scoredCandidates[0].empId;
        const bestScore = scoredCandidates[0].score;

        // Add warnings based on the high score triggers
        const past = history[best];
        const timesDone = past.filter(s => s === station).length;
        const lastStation = past.length > 0 ? past[past.length - 1] : null;

        if (timesDone >= 3) {
            notifications.push({
                id: `warn-limit-${rotMeta.id}-${best}`,
                type: 'warning',
                message: `${best} is assigned ${station} for the ${timesDone + 1}th time in Rotation ${rotMeta.id} (Staff limited).`,
                rotationId: rotMeta.id
            });
        } else if (lastStation === station && station !== GreenStation.MUSEUM) { // Museum repeat is often unavoidable
             notifications.push({
                id: `warn-repeat-${rotMeta.id}-${best}`,
                type: 'warning',
                message: `${best} is repeating ${station} back-to-back in Rotation ${rotMeta.id}.`,
                rotationId: rotMeta.id
            });
        }
        
        assignments[station].push(best);
        history[best].push(station);
        
        availableEmployees = availableEmployees.filter(e => e !== best);
      }
    };

    // 2. Fill Slots based on Requirements
    assignBestCandidates(GreenStation.TICKET, 2);
    assignBestCandidates(GreenStation.GREETER, 1);
    assignBestCandidates(GreenStation.PLANETARIUM, 1);
    // Museum: Everyone else who is available
    assignBestCandidates(GreenStation.MUSEUM, availableEmployees.length);

    rotations.push({
      id: rotMeta.id,
      timeRange: `${rotMeta.start} - ${rotMeta.end}`,
      assignments
    });
  });

  return { rotations, notifications };
};
