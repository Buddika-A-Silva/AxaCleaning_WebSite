'use strict';
const { toMin, fromMin, weekday, addDays } = require('./util');

const WORK_START = toMin(process.env.WORK_START || '08:00');
const WORK_END = toMin(process.env.WORK_END || '18:00');
const SLOT_STEP = 60;
const BLOCKING = new Set(['accepted']);        // confirmed jobs block an agent
const TENTATIVE = new Set(['pending']);        // shown, but do not block

const windowOf = (b) => { const s = toMin(b.startTime); return [s, s + Math.round((b.durationHours || 2) * 60)]; };
const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];
const worksOn = (agent, date) => (agent.workingDays || [1, 2, 3, 4, 5, 6]).includes(weekday(date));
const leaveOn = (agent, date) => (agent.leaves || []).find((l) => l.date === date) || null;

/** Is `agent` free for a job on `date` within [start,end) ? Returns { free, reason, clashes } */
function checkAgent(agent, date, win, bookings, excludeBookingId) {
  if (agent.active === false) return { free: false, reason: 'Agent is inactive' };
  if (!worksOn(agent, date)) return { free: false, reason: 'Not a working day for this agent' };
  const leave = leaveOn(agent, date);
  if (leave) return { free: false, reason: `On leave${leave.reason ? ` (${leave.reason})` : ''}` };
  const clashes = bookings.filter((b) => b.id !== excludeBookingId && b.date === date && BLOCKING.has(b.status)
    && (b.agentIds || []).includes(agent.id) && overlaps(windowOf(b), win));
  if (clashes.length) return { free: false, reason: `Already booked (${clashes.map((c) => `${c.ref} ${c.startTime}`).join(', ')})`, clashes: clashes.map((c) => c.ref) };
  return { free: true, reason: 'Available' };
}

/** Availability of every agent for a specific booking. */
function agentsForBooking(booking, agents, bookings) {
  const win = windowOf(booking);
  return agents.filter((a) => a.active !== false).map((a) => ({
    id: a.id, name: a.name, color: a.color, skills: a.skills || [],
    ...checkAgent(a, booking.date, win, bookings, booking.id),
    tentative: bookings.filter((b) => b.id !== booking.id && b.date === booking.date && TENTATIVE.has(b.status)
      && (b.agentIds || []).includes(a.id) && overlaps(windowOf(b), win)).map((b) => b.ref),
  }));
}

/** Per-agent, per-day board for the admin dashboard. */
function board(agents, bookings, startDate, days) {
  const dates = Array.from({ length: days }, (_, i) => addDays(startDate, i));
  const capacity = WORK_END - WORK_START;
  return {
    dates,
    workStart: fromMin(WORK_START), workEnd: fromMin(WORK_END),
    agents: agents.filter((a) => a.active !== false).map((a) => ({
      id: a.id, name: a.name, color: a.color, phone: a.phone, skills: a.skills || [],
      days: dates.map((date) => {
        if (!worksOn(a, date)) return { date, status: 'off', jobs: [] };
        const leave = leaveOn(a, date);
        if (leave) return { date, status: 'leave', reason: leave.reason || '', jobs: [] };
        const jobs = bookings.filter((b) => b.date === date && (b.agentIds || []).includes(a.id) && (BLOCKING.has(b.status) || TENTATIVE.has(b.status) || b.status === 'completed'))
          .sort((x, y) => x.startTime.localeCompare(y.startTime))
          .map((b) => { const [s, e] = windowOf(b); return { id: b.id, ref: b.ref, start: fromMin(s), end: fromMin(e), status: b.status, packageName: b.packageName, customer: b.customer?.name }; });
        const booked = jobs.filter((j) => j.status !== 'pending').reduce((m, j) => m + (toMin(j.end) - toMin(j.start)), 0);
        const free = Math.max(0, capacity - booked);
        const status = booked === 0 ? 'available' : free < 120 ? 'booked' : 'partial';
        return { date, status, freeHours: Math.round(free / 6) / 10, bookedHours: Math.round(booked / 6) / 10, jobs };
      }),
    })),
  };
}

/** Public time slots for a date: how many agents are free at each start time. */
function slots(date, durationHours, agentsRequired, agents, bookings) {
  const out = [];
  const dur = Math.round(durationHours * 60);
  for (let s = WORK_START; s + dur <= WORK_END; s += SLOT_STEP) {
    const win = [s, s + dur];
    const free = agents.filter((a) => checkAgent(a, date, win, bookings).free).length;
    out.push({ time: fromMin(s), freeAgents: free, available: free >= agentsRequired, limited: free >= agentsRequired && free < agentsRequired + 2 });
  }
  return out;
}

const isOpenDay = (date, agents) => agents.some((a) => a.active !== false && worksOn(a, date));

module.exports = { WORK_START, WORK_END, windowOf, overlaps, checkAgent, agentsForBooking, board, slots, isOpenDay };
