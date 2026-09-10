export type SessionFormat = 'video' | 'audio';

export interface TimeSlot {
  id: string;
  time: string; // e.g. "10:00 AM"
  period: 'morning' | 'afternoon' | 'evening';
  available: boolean;
}

export interface DayAvailability {
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // "Tuesday", etc.
  formattedDate: string; // "Tuesday, 14 October"
  slots: TimeSlot[];
}

export interface BookingFormData {
  date: string;
  time: string;
  format: SessionFormat;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  timeZone: string;
  optionalNote?: string;
  confirmedBoundaries: boolean;
}

export interface BookingConfirmation extends BookingFormData {
  bookingId: string;
  createdAt: string;
  calendarLinkGoogle: string;
  calendarLinkIcs: string;
}

export interface SpokenVideoCue {
  timecode: string;
  seconds: number;
  text: string;
}
