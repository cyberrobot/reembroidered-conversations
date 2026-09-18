"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { DayAvailability } from "../../types";
import { FullCalendarModal } from "../FullCalendarModal";

interface AvailabilityPickerProps {
  availableDays: DayAvailability[];
  selectedDate: string;
  selectedSlotId: string;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slotId: string) => void;
  disabled?: boolean;
  autoSelectSlot?: boolean;
}

export function AvailabilityPicker({
  availableDays,
  selectedDate,
  selectedSlotId,
  onSelectDate,
  onSelectSlot,
  disabled = false,
  autoSelectSlot = true,
}: AvailabilityPickerProps) {
  const [periodFilter, setPeriodFilter] = useState<
    "all" | "morning" | "afternoon" | "evening"
  >("all");
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const dateStripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const activeDay = availableDays.find((day) => day.date === selectedDate);

  useEffect(() => {
    if (availableDays.length > 0 && !activeDay)
      onSelectDate(availableDays[0].date);
  }, [activeDay, availableDays, onSelectDate]);

  useEffect(() => {
    if (!activeDay) {
      if (selectedSlotId) onSelectSlot("");
      return;
    }
    if (!activeDay.slots.some((slot) => slot.id === selectedSlotId)) {
      onSelectSlot(autoSelectSlot ? (activeDay.slots[0]?.id ?? "") : "");
    }
  }, [activeDay, autoSelectSlot, onSelectSlot, selectedSlotId]);

  const updateScrollButtons = () => {
    if (!dateStripRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = dateStripRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  useEffect(() => {
    updateScrollButtons();
    const handleResize = () => updateScrollButtons();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [availableDays]);

  const scrollStrip = (direction: "left" | "right") => {
    dateStripRef.current?.scrollBy({
      left: direction === "left" ? -340 : 340,
      behavior: "smooth",
    });
    window.setTimeout(updateScrollButtons, 350);
  };

  const selectDate = (date: string, scrollIntoView = false) => {
    const index = availableDays.findIndex((day) => day.date === date);
    if (index < 0) return;
    const day = availableDays[index];
    onSelectDate(date);
    onSelectSlot(day.slots[0]?.id ?? "");
    if (scrollIntoView) {
      window.setTimeout(() => {
        const card = dateStripRef.current?.children[index] as
          HTMLElement | undefined;
        card?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
        updateScrollButtons();
      }, 100);
    }
  };

  const filteredSlots = useMemo(() => {
    if (!activeDay) return [];
    return periodFilter === "all"
      ? activeDay.slots
      : activeDay.slots.filter((slot) => slot.period === periodFilter);
  }, [activeDay, periodFilter]);

  if (!activeDay) return null;

  return (
    <>
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex flex-col md:flex-row items-center gap-2">
            <p className="text-xs text-[#282524] font-medium font-sans">
              Upcoming available days
            </p>
            <p>
              <span className="text-[#C4B7A9]">•</span>
              <span className="text-[11px] text-[#78716C] font-light">
                Nearest dates shown first
              </span>
            </p>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowFullCalendar(true)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 text-xs text-[#A35048] hover:text-[#8C4038] font-medium underline underline-offset-4 decoration-[#A35048]/40 hover:decoration-[#A35048] transition-colors cursor-pointer"
            >
              <CalendarIcon className="w-3.5 h-3.5 stroke-[1.75]" />
              <span>View full calendar</span>
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollStrip("left")}
                disabled={!canScrollLeft}
                className="p-1.5 rounded-lg border border-[#E8DFD5] bg-[#FAF8F5] text-[#282524] hover:border-[#A35048] hover:text-[#A35048] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="Scroll to earlier dates"
                title="Earlier dates"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollStrip("right")}
                disabled={!canScrollRight}
                className="p-1.5 rounded-lg border border-[#E8DFD5] bg-[#FAF8F5] text-[#282524] hover:border-[#A35048] hover:text-[#A35048] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="Scroll to later dates"
                title="Later dates"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="relative group/strip">
          <div
            className={`pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#FDFCFB] to-transparent z-10 transition-opacity duration-200 ${canScrollLeft ? "opacity-100" : "opacity-0"}`}
          />
          <div
            className={`pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#FDFCFB] to-transparent z-10 transition-opacity duration-200 ${canScrollRight ? "opacity-100" : "opacity-0"}`}
          />
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollStrip("right")}
              className="hidden md:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#FAF8F5] border border-[#E8DFD5] shadow-md items-center justify-center text-[#282524] hover:text-[#A35048] hover:border-[#A35048] transition-all cursor-pointer hover:scale-105 active:scale-95"
              aria-label="Next dates"
              title="Next available dates"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollStrip("left")}
              className="hidden md:flex absolute -left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#FAF8F5] border border-[#E8DFD5] shadow-md items-center justify-center text-[#282524] hover:text-[#A35048] hover:border-[#A35048] transition-all cursor-pointer hover:scale-105 active:scale-95"
              aria-label="Previous dates"
              title="Previous dates"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div
            ref={dateStripRef}
            onScroll={updateScrollButtons}
            className="flex gap-2.5 overflow-x-auto pb-2.5 pt-0.5 px-0.5 scrollbar-none scroll-smooth"
            role="group"
            aria-label="Available dates"
          >
            {availableDays.map((day, index) => {
              const isSelected = day.date === selectedDate;
              const availableCount = day.slots.length;
              return (
                <button
                  key={day.date}
                  type="button"
                  data-availability-date={day.date}
                  aria-pressed={isSelected}
                  onClick={() => selectDate(day.date)}
                  disabled={disabled}
                  className={`shrink-0 px-4 py-3 rounded-xl border text-left cursor-pointer transition-all duration-150 min-w-[104px] ${isSelected ? "bg-[#A35048] text-[#FAF8F5] border-[#A35048] shadow-xs" : "bg-[#FAF8F5] text-[#4B4643] border-[#E8DFD5] hover:border-[#C4B7A9] hover:bg-[#F5EFE9]/60"}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="block text-[11px] font-sans opacity-80 uppercase tracking-wider font-medium">
                      {day.dayOfWeek.slice(0, 3)}
                    </span>
                    {index === 0 && (
                      <span
                        className={`text-[9px] uppercase tracking-wider font-semibold px-1 py-0.2 rounded-xs ${isSelected ? "bg-white/25 text-white" : "bg-[#E8DFD5] text-[#A35048]"}`}
                      >
                        Nearest
                      </span>
                    )}
                  </div>
                  <span className="block font-serif text-base font-medium leading-snug">
                    {day.formattedDate.split(", ")[1]}
                  </span>
                  <span
                    className={`block text-[10px] font-sans mt-1 ${isSelected ? "text-white/80" : "text-[#78716C]"}`}
                  >
                    {availableCount} {availableCount === 1 ? "slot" : "slots"}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowFullCalendar(true)}
              disabled={disabled}
              className="shrink-0 px-4 py-3 rounded-xl border border-dashed border-[#C4B7A9] hover:border-[#A35048] text-left cursor-pointer transition-all duration-150 bg-[#FAF8F5]/80 hover:bg-[#F5EFE9] flex flex-col justify-center items-center min-w-[110px] group"
              title="Open full calendar to select any date across the next 8 weeks"
            >
              <CalendarIcon className="w-4 h-4 text-[#A35048] mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-serif font-medium text-[#282524] whitespace-nowrap">
                Later dates
              </span>
              <span className="text-[10px] text-[#78716C] mt-0.5 whitespace-nowrap">
                Full calendar →
              </span>
            </button>
          </div>
        </div>
      </div>
      <div>
        <div className="flex flex-col md:flex-row gap-2 md:gap-0 items-center justify-between mb-3 text-xs text-[#68635F]">
          <span>Available times on {activeDay.formattedDate}:</span>
          <div className="flex gap-1">
            {(["all", "morning", "afternoon", "evening"] as const).map(
              (filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setPeriodFilter(filter)}
                  className={`px-2 py-0.5 rounded capitalize text-[11px] cursor-pointer ${periodFilter === filter ? "bg-[#E8DFD5] text-[#282524] font-medium" : "text-[#78716C] hover:text-[#282524]"}`}
                >
                  {filter}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {filteredSlots.map((slot) => (
            <button
              key={slot.id}
              type="button"
              aria-pressed={selectedSlotId === slot.id}
              onClick={() => onSelectSlot(slot.id)}
              disabled={disabled}
              className={`py-2.5 px-3 rounded-xl border text-sm font-sans font-medium transition-all cursor-pointer text-center ${selectedSlotId === slot.id ? "bg-[#282524] text-white border-[#282524] shadow-xs ring-2 ring-[#A35048]/30" : "bg-[#FAF8F5] text-[#4B4643] border-[#E8DFD5] hover:border-[#A35048]"}`}
            >
              {slot.time}
            </button>
          ))}
        </div>
      </div>
      <FullCalendarModal
        isOpen={showFullCalendar}
        onClose={() => setShowFullCalendar(false)}
        availableDays={availableDays}
        selectedDate={selectedDate}
        onSelectDate={(date) => selectDate(date, true)}
      />
    </>
  );
}
