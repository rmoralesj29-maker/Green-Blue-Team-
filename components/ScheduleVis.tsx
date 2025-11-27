
import React from 'react';
import { GeneratedSchedule } from '../types';
import { TimelineBlock } from './TimelineBlock';
import { differenceInMinutes, addMinutes, format, startOfDay, parse } from 'date-fns';

interface Props {
  schedule: GeneratedSchedule;
  config: { firstShowTime: string; lastShowTime: string };
  onEmployeeClick: (empId: string) => void;
  currentTime?: Date;
}

export const ScheduleVis: React.FC<Props> = ({ schedule, config, onEmployeeClick, currentTime }) => {
  // Increased zoom level for better visibility
  const pixelsPerMinute = 3; 

  // Determine timeline bounds
  const baseDate = startOfDay(new Date());
  const start = parse(config.firstShowTime, 'HH:mm', baseDate);
  const end = addMinutes(parse(config.lastShowTime, 'HH:mm', baseDate), 90); // Extra buffer at end
  
  const totalMinutes = differenceInMinutes(end, start);
  const totalWidth = totalMinutes * pixelsPerMinute;

  // Generate Time Markers every 30 mins
  const markers = [];
  let t = start;
  while (differenceInMinutes(t, end) <= 0) {
    markers.push(t);
    t = addMinutes(t, 30);
  }
  
  const employees = Array.from(new Set(schedule.blocks.map(b => b.employeeId))).sort();
  
  // Calculate current time line position
  let currentTimeLeft = -1;
  if (currentTime) {
      const diff = differenceInMinutes(currentTime, start);
      if (diff >= 0 && diff <= totalMinutes) {
          currentTimeLeft = diff * pixelsPerMinute;
      }
  }

  return (
    <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-xl bg-white shadow-md">
      <div className="relative min-w-[800px]" style={{ width: `${Math.max(1200, totalWidth + 120)}px` }}>
        
        {/* Header - Time Axis */}
        <div className="h-14 border-b border-slate-200 bg-slate-50 sticky top-0 z-30 flex items-end">
          <div className="w-24 sticky left-0 bg-slate-50 z-40 border-r border-slate-200 text-sm font-bold text-slate-600 p-2 flex items-center justify-center shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
            Staff
          </div>
          <div className="relative flex-1 h-full">
            {markers.map((time, i) => {
              const left = differenceInMinutes(time, start) * pixelsPerMinute;
              return (
                <div 
                  key={i} 
                  className="absolute bottom-0 text-xs font-bold text-slate-500 border-l-2 border-slate-300 pl-2 h-6 flex items-center"
                  style={{ left: `${left}px` }}
                >
                  {format(time, 'HH:mm')}
                </div>
              );
            })}
            {/* Current Time Indicator on Header */}
            {currentTimeLeft >= 0 && (
                <div 
                    className="absolute bottom-0 h-4 w-0 border-l-2 border-red-500 z-50 flex flex-col items-center"
                    style={{ left: `${currentTimeLeft}px` }}
                >
                    <div className="w-2 h-2 rounded-full bg-red-500 -mb-1"></div>
                </div>
            )}
          </div>
        </div>

        {/* Rows per Employee */}
        <div className="relative bg-white">
          {/* Vertical grid lines */}
          <div className="absolute inset-0 z-0 pointer-events-none">
             {markers.map((time, i) => {
                const left = differenceInMinutes(time, start) * pixelsPerMinute + 96; // +96 for sidebar (w-24)
                return (
                  <div 
                    key={`line-${i}`} 
                    className="absolute top-0 bottom-0 border-r border-dashed border-slate-200"
                    style={{ left: `${left - 96}px` }} // Adjust for relative parent
                  />
                );
              })}
              {/* Current Time Vertical Line */}
              {currentTimeLeft >= 0 && (
                <div 
                    className="absolute top-0 bottom-0 border-r-2 border-red-500 z-10 pointer-events-none opacity-50"
                    style={{ left: `${currentTimeLeft}px` }} 
                />
              )}
          </div>

          {employees.map((empId, index) => {
            const empBlocks = schedule.blocks.filter(b => b.employeeId === empId);
            return (
              <div key={empId} className={`flex h-20 border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                {/* Fixed Label Column */}
                <button 
                  onClick={() => onEmployeeClick(empId)}
                  className="w-24 flex-shrink-0 sticky left-0 z-20 border-r border-slate-200 flex items-center justify-center text-lg font-bold text-slate-700 bg-inherit shadow-[4px_0_10px_rgba(0,0,0,0.02)] hover:bg-slate-100 hover:text-blue-600 cursor-pointer transition-colors group"
                  title="Click to view full day card"
                >
                  <span className="group-hover:scale-110 transition-transform">{empId}</span>
                </button>
                
                {/* Timeline Area */}
                <div className="relative flex-1 h-full pointer-events-none">
                   {empBlocks.map(block => (
                     <TimelineBlock 
                        key={block.id} 
                        block={block} 
                        dayStart={start} 
                        pixelsPerMinute={pixelsPerMinute} 
                        currentTime={currentTime}
                      />
                   ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
