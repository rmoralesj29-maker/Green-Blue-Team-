
import React from 'react';
import { TimeBlock, StationType } from '../types';
import { format, differenceInMinutes, isBefore } from 'date-fns';
import { Clock } from 'lucide-react';

interface Props {
  employeeId: string;
  employeeName?: string;
  blocks: TimeBlock[];
  onClose?: () => void;
  className?: string;
  currentTime?: Date;
  fadePastEvents?: boolean;
}

const getStationColor = (station: StationType) => {
  switch (station) {
    case StationType.SHOW:
      return 'bg-blue-50 text-blue-900 border-l-[4px] border-blue-600';
    case StationType.OCEAN:
      return 'bg-teal-50 text-teal-900 border-l-[4px] border-teal-600';
    case StationType.FLOOR_MINUS_1:
      return 'bg-rose-50 text-rose-900 border-l-[4px] border-rose-600';
    default:
      return 'bg-slate-50 text-slate-900 border-l-[4px] border-slate-500';
  }
};

export const EmployeeCard: React.FC<Props> = ({ employeeId, employeeName, blocks, onClose, className = '', currentTime, fadePastEvents = true }) => {
  // Sort blocks by start time to ensure chronological order
  const sortedBlocks = [...blocks].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  
  // Calculate total active minutes
  const totalMinutes = sortedBlocks.reduce((acc, block) => acc + differenceInMinutes(block.endTime, block.startTime), 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  // Calculate Rotations (1 Rotation = 3 Stations)
  const rotations = (sortedBlocks.length / 3).toFixed(1);

  return (
    <div className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-200 overflow-hidden flex flex-col ${className}`}>
      {/* Header */}
      <div className="bg-slate-800 px-3 py-2.5 flex justify-between items-center text-white sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 text-white flex items-center justify-center font-bold text-sm shadow-inner backdrop-blur-sm shrink-0">
                {employeeId}
            </div>
            <div className="min-w-0">
                <h3 className="font-bold text-sm leading-tight truncate">{employeeName || 'Staff Member'}</h3>
                <div className="flex items-center gap-2 text-[10px] text-blue-200 font-medium opacity-80">
                  <Clock size={10} />
                  <span>{hours}h {mins > 0 ? `${mins}m` : ''} Total</span>
                </div>
            </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors bg-slate-700/50 hover:bg-slate-700 p-1 rounded-lg"
          >
            ✕
          </button>
        )}
      </div>

      {/* List */}
      <div className="p-2 overflow-y-auto custom-scrollbar flex-1 space-y-1.5 bg-slate-50/50">
        {sortedBlocks.length === 0 ? (
            <div className="text-center text-slate-400 py-8 italic flex flex-col items-center text-xs">
              <span className="bg-slate-100 p-1.5 rounded-full mb-2 text-base">😴</span>
              No assignments.
            </div>
        ) : (
            sortedBlocks.map((block) => {
                const isPast = currentTime ? isBefore(block.endTime, currentTime) : false;
                const shouldFade = isPast && fadePastEvents;
                return (
                    <div 
                        key={block.id} 
                        className={`p-2 rounded-md shadow-sm flex justify-between items-center group hover:bg-white transition-all ${getStationColor(block.station)} ${shouldFade ? 'opacity-40 grayscale' : 'opacity-100'}`}
                    >
                        <div className="flex flex-col min-w-0">
                            <span className="font-bold text-[9px] uppercase tracking-wider opacity-70 mb-0.5 truncate">
                                {block.station}
                            </span>
                            <span className="text-sm font-bold tracking-tight text-slate-800">
                                {format(block.startTime, 'HH:mm')} 
                                <span className="text-[10px] font-normal opacity-50 mx-1">to</span> 
                                {format(block.endTime, 'HH:mm')}
                            </span>
                        </div>
                        <div className="text-right opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-bold bg-white/50 px-1.5 py-0.5 rounded text-slate-600 ml-2 whitespace-nowrap">
                        {differenceInMinutes(block.endTime, block.startTime)}m
                        </div>
                    </div>
                );
            })
        )}
      </div>
      
      <div className="bg-white border-t border-slate-200 px-3 py-1.5 flex justify-between items-center text-[9px] text-slate-400 font-medium shrink-0">
        <span>Museum System</span>
        <span className="font-bold text-slate-600">{rotations} Rotations</span>
      </div>
    </div>
  );
};
