/**
 * @param {import('../../types').AvailabilityResponse} response
 * @returns {import('../../types').DayAvailability[]}
 */
export function presentAvailability(response) {
  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: response.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: response.timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const hourFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: response.timezone,
    hour: 'numeric',
    hourCycle: 'h23',
  });

  return response.days.filter((day) => day.slots.length > 0).map((day) => {
    const dateInstant = new Date(`${day.date}T12:00:00.000Z`);
    const dateParts = Object.fromEntries(
      dateFormatter.formatToParts(dateInstant).map(({ type, value }) => [type, value]),
    );
    return {
      date: day.date,
      dayOfWeek: dateParts.weekday,
      formattedDate: `${dateParts.weekday}, ${dateParts.day} ${dateParts.month}`,
      slots: day.slots.map((slot) => {
        const hour = Number(hourFormatter.format(new Date(slot.startAt)));
        return {
          id: slot.startAt,
          startAt: slot.startAt,
          endAt: slot.endAt,
          time: timeFormatter.format(new Date(slot.startAt)).replace('am', 'AM').replace('pm', 'PM'),
          period: hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening',
        };
      }),
    };
  });
}
