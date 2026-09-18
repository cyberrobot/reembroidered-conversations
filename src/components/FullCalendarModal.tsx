'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon } from 'lucide-react';
import { DayAvailability } from '../types';

interface FullCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableDays: DayAvailability[];
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (dateStr: string) => void;
}

export const FullCalendarModal: React.FC<FullCalendarModalProps> = ({
  isOpen,
  onClose,
  availableDays,
  selectedDate,
  onSelectDate,
}) => {
  const initialDate = selectedDate || availableDays[0]?.date;
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (initialDate) {
      const parts = initialDate.split('-').map(Number);
      return new Date(Date.UTC(parts[0], parts[1] - 1, 1));
    }
    return new Date();
  });

  useEffect(() => {
    if (!isOpen || !initialDate) return;
    const parts = initialDate.split('-').map(Number);
    setViewDate(new Date(Date.UTC(parts[0], parts[1] - 1, 1)));
  }, [initialDate, isOpen]);

  if (!isOpen) return null;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const year = viewDate.getUTCFullYear();
  const month = viewDate.getUTCMonth();

  // Find min and max dates in availableDays to disable prev/next if out of range
  const minDate = availableDays.length > 0 ? new Date(availableDays[0].date) : new Date();
  const maxDate = availableDays.length > 0 ? new Date(availableDays[availableDays.length - 1].date) : new Date();

  const isPrevDisabled = (year < minDate.getUTCFullYear()) ||
    (year === minDate.getUTCFullYear() && month <= minDate.getUTCMonth());
  const isNextDisabled = (year > maxDate.getUTCFullYear()) ||
    (year === maxDate.getUTCFullYear() && month >= maxDate.getUTCMonth());

  const handlePrevMonth = () => {
    if (isPrevDisabled) return;
    setViewDate(new Date(Date.UTC(year, month - 1, 1)));
  };

  const handleNextMonth = () => {
    if (isNextDisabled) return;
    setViewDate(new Date(Date.UTC(year, month + 1, 1)));
  };

  // Calendar cells generation
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstDayIndex = new Date(Date.UTC(year, month, 1)).getUTCDay();
  // Adjust so Monday is 0, Sunday is 6
  const startingDayOffset = (firstDayIndex + 6) % 7;

  // Map of available dates for quick lookup
  const availabilityMap = new Map<string, DayAvailability>();
  availableDays.forEach((d) => {
    availabilityMap.set(d.date, d);
  });

  const calendarDays: Array<{
    dayNumber: number;
    dateStr: string;
    isAvailable: boolean;
    dayData?: DayAvailability;
  }> = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    const dayData = availabilityMap.get(dateStr);
    calendarDays.push({
      dayNumber: d,
      dateStr,
      isAvailable: Boolean(dayData),
      dayData,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F1D1C]/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[#FAF8F5] border border-[#E8DFD5] rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle decorative top accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#A35048]" />

        {/* Modal Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-serif uppercase tracking-widest text-[#A35048] font-medium mb-1">
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Full Calendar View</span>
            </div>
            <h3 id="calendar-modal-title" className="font-serif text-xl sm:text-2xl text-[#282524] font-medium">
              Select a specific date
            </h3>
            <p className="text-xs text-[#78716C] font-sans font-light mt-0.5">
              Dates shown here have at least one currently available time.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#78716C] hover:text-[#282524] hover:bg-[#E8DFD5]/50 rounded-full transition-colors cursor-pointer"
            aria-label="Close calendar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between py-2 mb-2 border-y border-[#E8DFD5]">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={isPrevDisabled}
            className="p-1.5 rounded-lg border border-[#E8DFD5] text-[#282524] hover:border-[#A35048] hover:text-[#A35048] disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-serif text-base font-medium text-[#282524]">
            {monthNames[month]} {year}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            disabled={isNextDisabled}
            className="p-1.5 rounded-lg border border-[#E8DFD5] text-[#282524] hover:border-[#A35048] hover:text-[#A35048] disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {dayHeaders.map((dh) => (
            <span key={dh} className="text-[11px] font-sans uppercase font-medium text-[#78716C] py-1">
              {dh}
            </span>
          ))}
        </div>

        {/* Month Day Grid */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {/* Empty offset days */}
          {Array.from({ length: startingDayOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="h-10" />
          ))}

          {/* Calendar Days */}
          {calendarDays.map((cd) => {
            const isSelected = cd.dateStr === selectedDate;

            if (cd.isAvailable) {
              return (
                <button
                  key={cd.dateStr}
                  type="button"
                  onClick={() => {
                    onSelectDate(cd.dateStr);
                    onClose();
                  }}
                  className={`h-10 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'bg-[#A35048] text-[#FAF8F5] shadow-xs font-semibold'
                      : 'bg-[#FDFCFB] text-[#282524] border border-[#E8DFD5] hover:border-[#A35048] hover:bg-[#F5EFE9]'
                  }`}
                  title={`${cd.dayData?.formattedDate} (${cd.dayData?.slots.length} available slots)`}
                >
                  <span className="text-xs">{cd.dayNumber}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                      isSelected ? 'bg-white' : 'bg-[#A35048]'
                    }`}
                  />
                </button>
              );
            }

            // Unavailable day (Sunday, past day, or closed)
            return (
              <div
                key={cd.dateStr}
                className="h-10 rounded-xl flex items-center justify-center text-xs text-[#C4B7A9] font-light cursor-not-allowed select-none"
              >
                {cd.dayNumber}
              </div>
            );
          })}
        </div>

        {/* Legend & Help Footer */}
        <div className="mt-4 pt-3 border-t border-[#E8DFD5] flex items-center justify-between text-[11px] text-[#78716C] font-sans">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#A35048]" /> Available
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#A35048] ring-2 ring-[#A35048]/30" /> Selected
            </span>
            <span className="flex items-center gap-1 text-[#A8A29E]">
              <span className="w-2 h-2 rounded-full bg-[#E8DFD5]" /> Unavailable
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-[#A35048] hover:underline cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
