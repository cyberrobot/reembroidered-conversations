export type SessionFormat = 'video' | 'audio';

export interface TimeSlot {
  id: string;
  startAt: string;
  endAt: string;
  time: string;
  period: 'morning' | 'afternoon' | 'evening';
}

export interface DayAvailability {
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // "Tuesday", etc.
  formattedDate: string; // "Tuesday, 14 October"
  slots: TimeSlot[];
}

export interface AvailabilityResponse {
  timezone: string;
  days: Array<{
    date: string;
    slots: Array<{ startAt: string; endAt: string }>;
  }>;
}

export interface BookingHold {
  id: string;
  startAt: string;
  endAt: string;
  timezone: string;
  expiresAt: string;
}

export interface BookingHoldResponse {
  hold: BookingHold;
}

export interface BookingCheckoutResponse {
  checkout: { url: string; expiresAt: string };
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
