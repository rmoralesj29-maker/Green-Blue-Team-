import React from 'react';
import { TimeBlock, StationType } from '../types';
import { differenceInMinutes } from 'date-fns';

interface Props {
  block: TimeBlock;
  dayStart: Date;
  pixelsPerMinute: number;
}

const getStationStyle = (station: StationType) => {
  // Explicit bg-white and high contrast text
  switch (station) {
    case StationType.SHOW: 
      return 'bg-white border-l-[6px] border-l-blue-600 border-y border-r border-slate-300 text-slate-900';
    case StationType.OCEAN: 
      return 'bg-white border-l-[6px] border-l-teal-600 border-y border-r border-slate-300 text-slate-900';
    case StationType.FLOOR_MINUS_1: 
      return 'bg-white border-l-[6px] border-l-rose-600 border-y border-r border-slate-300 text-slate-900';
    default: 
      return 'bg-white border-l-[6px] border-l-gray-600 border-y border-r border-slate-300 text-slate-900';
  }
};

export const TimelineBlock: React.FC<Props> = ({ block, dayStart, pixelsPerMinute }) => {
  const startMinutes = differenceInMinutes(block.startTime, dayStart);
  const duration = differenceInMinutes(block.endTime, block.startTime);
  
  const left = startMinutes * pixelsPerMinute;
  const width = duration * pixelsPerMinute;

  return (
    <div 
      className={`absolute top-2 bottom-2 rounded-md flex flex-col justify-center px-3 overflow-hidden whitespace-nowrap z-10 hover:z-20 shadow-sm hover:shadow-lg transition-all hover:scale-[1.02] ${getStationStyle(block.station)}`}
      style={{ left: `${left}px`, width: `${width}px` }}
      title={`${block.employeeId} - ${block.station}`}
    >
      <div className="font-bold text-sm leading-tight">{block.employeeId}</div>
      <div className="text-xs font-medium opacity-80 leading-tight truncate">{block.station}</div>
    </div>
  );
};