
export enum StationType {
  SHOW = 'Show',
  OCEAN = 'Ocean',
  FLOOR_MINUS_1 = 'Floor -1'
}

export enum TeamType {
  BLUE = 'Blue',
  GREEN = 'Green'
}

export enum GreenStation {
  TICKET = 'Ticket',
  GREETER = 'Greeter',
  PLANETARIUM = 'Planetarium',
  MUSEUM = 'Museum',
  SIDE_TASK = 'Side Task',
  OFF_SHIFT = 'Off Shift'
}

export interface Employee {
  id: string;
  name: string;
}

export interface TimeBlock {
  id: string;
  station: StationType;
  startTime: Date;
  endTime: Date;
  employeeId: string;
}

export interface ScheduleConfig {
  frequency: number; // minutes
  firstShowTime: string; // HH:mm
  numEmployees: number;
  lastShowTime: string; // HH:mm
  durationOcean: number; // minutes, configurable
  durationFloor: number; // minutes, configurable
}

export interface LunchConfig {
  windowStart: string; // HH:mm, e.g. "12:00"
  windowEnd: string; // HH:mm, e.g. "14:00"
  duration: number; // minutes, e.g. 35
}

export interface RotationTrack {
  startTime: Date; // The show start time this track aligns with
  blocks: TimeBlock[];
}

export interface CoverageIssue {
  startTime: Date;
  endTime: Date;
  station: StationType;
  missing: boolean;
  message: string;
}

export interface GeneratedSchedule {
  blocks: TimeBlock[];
  issues: CoverageIssue[];
  showStartTimes: Date[];
}

// Green Team Specifics
export interface GreenRotation {
  id: number;
  timeRange: string;
  assignments: Record<GreenStation, string[]>; // Station -> List of Employee IDs
}

export interface SideTaskRule {
  id: string;
  rotationId: number; // 1-5
  employeeId: string;
  note?: string;
}

export interface ShiftException {
  id: string;
  employeeId: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface GreenNotification {
  id: string;
  type: 'info' | 'warning' | 'critical';
  message: string;
  rotationId?: number;
}

export interface GeneratedGreenSchedule {
  rotations: GreenRotation[];
  notifications: GreenNotification[];
}
