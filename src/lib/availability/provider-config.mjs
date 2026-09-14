// @ts-check

import { BOOKING_TIME_ZONE } from '../booking-date.mjs';

/** @typedef {{ start: string, end: string }} WorkingWindow */
/** @typedef {Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', readonly WorkingWindow[]>} WorkingHours */
/**
 * @typedef {object} ProviderAvailabilityConfig
 * @property {string} timezone
 * @property {number} sessionDurationMinutes
 * @property {number} bufferBeforeMinutes
 * @property {number} bufferAfterMinutes
 * @property {number} minimumNoticeMinutes
 * @property {number} maximumBookingHorizonDays
 * @property {WorkingHours} weeklyWorkingHours
 * @property {readonly string[]} daysOff
 */

const WEEKDAY_HOURS = Object.freeze([
  Object.freeze({ start: '10:00', end: '12:30' }),
  Object.freeze({ start: '14:00', end: '18:00' }),
]);

/** @type {Readonly<ProviderAvailabilityConfig>} */
export const PROVIDER_AVAILABILITY_CONFIG = Object.freeze({
  timezone: BOOKING_TIME_ZONE,
  sessionDurationMinutes: 55,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minimumNoticeMinutes: 1440,
  maximumBookingHorizonDays: 56,
  weeklyWorkingHours: Object.freeze({
    monday: WEEKDAY_HOURS,
    tuesday: WEEKDAY_HOURS,
    wednesday: WEEKDAY_HOURS,
    thursday: WEEKDAY_HOURS,
    friday: WEEKDAY_HOURS,
    saturday: Object.freeze([]),
    sunday: Object.freeze([]),
  }),
  daysOff: Object.freeze([]),
});
