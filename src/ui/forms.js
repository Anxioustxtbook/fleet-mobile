/* The entry forms' rules, with no React in them (so they are tested without a phone).
   One form per table. Each says: its fields IN THE ORDER you fill them (Enter moves to the next one), what is checked
   before saving, and the plan of saves it makes. The screen (screens/EntryForm.js) only draws what this file decides.

   Rules copied from the desktop's own forms: a rental's days and amount come from the desktop's billing.js; a payment cannot be more than what
   is still owed; a rental's fronted fuel is also written as a Fuel expense (so the Overview adds up the same); a sub-hire car's cost
   is the car's cost per day times the days unless typed; a new rental on the road makes the car "Rented"; double bookings are warned about. */

import { charge, duration } from '../shared/billing.js';
import { syncOwnerFromTick, setOwnerStatus, setDriverStatus, ownerStatus, driverStatus, isOwnerLine, isDriverLine, isOneOffCar } from '../shared/subhireCore.js';
import { rentalForFill } from '../shared/fuelCore.js';
import { clientType, fmt, lookups } from './tables.js';
import { ksh0 } from './money.js';

const num = v => Number(v) || 0;
export const NEEDED = 'This is needed.';
export const FUTURE_MSG = 'A payment or expense cannot be dated after today.';
export const RETURN_BEFORE = 'The return date is before the pickup date.';
export const DUP_FUEL = 'A fill for this car on this date with this amount is already recorded. Tap Save again only if it is a second fill.';
const r2 = x => Math.round(x * 100) / 100;
const same = (a, b) => a != null && b != null && a !== '' && b !== '' && String(a) === String(b);
const pad = n => String(n).padStart(2, '0');
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ---------- typing a date or a time: forgiving, then shown back in full so the person can see how it was read ---------- */
const realDate = (y, m, d) => { if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return ''; const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : ''; };
export function parseDate(text, today = todayISO()) {
  const t = String(text == null ? '' : text).trim().toLowerCase();
  if (!t) return '';
  const [ty, tm, td] = today.split('-').map(Number);
  if (t === 't' || t === 'today') return today;
  if (t === 'y' || t === 'yesterday') { const d = new Date(Date.UTC(ty, tm - 1, td - 1)); return realDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t))) return realDate(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t))) return realDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(t))) return realDate(ty, +m[2], +m[1]);
  if (/^\d+$/.test(t)) {
    if (t.length <= 2) return realDate(ty, tm, +t);                                   // "5" = the 5th of this month
    if (t.length === 4) return realDate(ty, +t.slice(2), +t.slice(0, 2));             // "1011" = 10 Nov this year
    if (t.length === 6) return realDate(2000 + +t.slice(4), +t.slice(2, 4), +t.slice(0, 2));
    if (t.length === 8) { const y = +t.slice(0, 4); return y >= 2000 && y <= 2100 ? realDate(y, +t.slice(4, 6), +t.slice(6)) : realDate(+t.slice(4), +t.slice(2, 4), +t.slice(0, 2)); }
  }
  return '';
}
export function parseTime(text) {
  const t = String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return '';
  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/.exec(t);
  if (!m) return '';
  let h = +m[1]; const min = m[2] ? +m[2] : 0;
  if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return '';
  return `${pad(h)}:${pad(min)}`;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isFuture = (text, c) => { const d = parseDate(text, c.today); return !!d && d > c.today; };
export const dateWords = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return ''; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return `${DAYS[d.getUTCDay()]} ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`; };
export const parseMoney = text => { const t = String(text == null ? '' : text).replace(/ksh/gi, '').replace(/[,\s]/g, ''); if (t === '') return NaN; return /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN; };

/* ---------- matching what is typed against what already exists ---------- */
const squash = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
/* "kbr670" matches "KBR 670E"; "john o" matches "John Otieno": every typed word must be found, spaces and dashes ignored */
export const matches = (text, query) => String(query || '').toLowerCase().split(/\s+/).filter(Boolean).every(w => String(text).toLowerCase().includes(w) || squash(text).includes(squash(w)));
const rank = (text, q) => { const a = squash(text), b = squash(q); return a === b ? 0 : a.startsWith(b) ? 1 : 2; };
const digits = s => String(s == null ? '' : s).replace(/\D/g, '');

/* Suggestions while typing. Two kinds:
     'existing'  the thing typed is already in the database: tapping opens that record (so a second copy is not made)
     'use'       a client typed inside a rental: tapping uses the existing client
     'fill'      a name seen before (an owner, a driver): tapping completes the field
   kind is the field's `suggest` setting. Returns up to 5, best match first. */
export function suggestions(kind, text, data, c = {}) {
  const q = String(text == null ? '' : text).trim();
  if (squash(q).length < 2 && digits(q).length < 3) return [];
  const exId = c.existing && c.existing.id, out = [];
  const add = (list, rows, label, sub, extra) => rows.forEach(r => out.push({ key: list + '|' + r.id, rank: rank(label(r), q), label: label(r) || '—', sub: sub(r), ...extra(r) }));
  const isEdit = (list) => r => ({ action: 'edit', list, id: r.id });
  const others = rows => (rows || []).filter(r => !same(r.id, exId));
  if (kind === 'vehicleReg') add('vehicles', others(data.vehicles).filter(v => matches(`${v.reg} ${v.make} ${v.model}`, q)), v => v.reg, v => ['Already in the database', [v.make, v.model].filter(Boolean).join(' '), v.rate ? fmt(v.rate) + ' a day' : ''].filter(Boolean).join(' · '), isEdit('vehicles'));
  if (kind === 'clientName') add('clients', others(data.clients).filter(x => matches(`${x.name} ${x.phone}`, q) || (digits(q).length >= 6 && digits(x.phone).includes(digits(q)))), x => x.name, x => ['Already a client', x.phone, x.area].filter(Boolean).join(' · '), isEdit('clients'));
  if (kind === 'driverName') add('drivers', others(data.drivers).filter(x => matches(`${x.name} ${x.phone}`, q)), x => x.name, x => ['Already a driver', x.phone].filter(Boolean).join(' · '), isEdit('drivers'));
  if (kind === 'rentalClient') add('clients', (data.clients || []).filter(x => matches(`${x.name} ${x.phone}`, q)), x => x.name, x => ['Use this client', x.phone, x.area].filter(Boolean).join(' · '), x => ({ action: 'use', field: 'clientId', value: x.id, clear: ['newClientName'] }));
  if (kind === 'individualPerson') add('individuals', (data.individuals || []).filter(x => matches(x.person, q)), x => x.person, x => 'Already on the individual ledger', x => ({ action: 'fill', value: x.person }));
  if (kind === 'ownerName') { const seen = new Set(); (data.vehicles || []).forEach(v => { const n = String(v.owner || '').trim(); if (n && !seen.has(n.toLowerCase()) && matches(n, q) && squash(n) !== squash(q)) { seen.add(n.toLowerCase()); out.push({ key: 'own|' + n, rank: rank(n, q), label: n, sub: 'Owner already used on a vehicle', action: 'fill', value: n }); } }); }
  if (kind === 'driverNameFill') { const seen = new Set(); [...(data.drivers || []).map(d => [d.name, d.phone]), ...(data.clients || []).map(x => [x.driverName, x.driverPhone])].forEach(([n, p]) => { n = String(n || '').trim(); if (n && !seen.has(n.toLowerCase()) && matches(n, q) && squash(n) !== squash(q)) { seen.add(n.toLowerCase()); out.push({ key: 'drv|' + n, rank: rank(n, q), label: n, sub: p ? 'Driver ' + p : 'Driver already known', action: 'fill', value: n, also: p ? { driverPhone: String(p) } : null }); } }); }
  return out.sort((a, b) => a.rank - b.rank || String(a.label).localeCompare(String(b.label))).slice(0, 5);
}

/* ---------- choices ---------- */
const STATUS_VEHICLE = ['Available', 'Rented', 'Maintenance', 'Inactive'].map(v => ({ value: v, label: v }));
const CLIENT_TYPES = [{ value: 'walkin', label: 'Walk-in' }, { value: 'coop', label: 'Coop' }, { value: 'taxi', label: 'Taxi' }, { value: 'self', label: 'Self-drive' }];
const METHODS = ['Cash', 'M-Pesa', 'Bank transfer', 'Card', 'Cheque', 'Other'].map(v => ({ value: v, label: v }));
export const METHODS_LIST = METHODS.map(m => m.value);
const BASE_CATEGORIES = ['Fuel', 'Car wash', 'Tyres', 'Insurance', 'Parking', 'Rent', 'Garage', 'Cleaning', 'Transport', 'Airport', 'Other'];
const PAYMENT_IN = [
  ['rental', 'Rental (a client pays a rental)'], ['invoice', 'Invoice'], ['coop', 'Coop / contract'],
  ['client', 'Client (unpaid rentals)'], ['ochwada', 'OCHWADA / client statement'],
  ['individual', 'Loan: individual'], ['other', 'Other money received']
].map(([value, label]) => ({ value, label }));
const PAYMENT_OUT = [
  ['rent', 'Rent'], ['fuel', 'Fuel'], ['driver', 'Sub-hire driver'], ['owner', 'Sub-hire car owner'],
  ['loan', 'Loan (instalment on a loan)'], ['individual', 'Loan: individual'],
  ['insurance', 'Insurance'], ['allowance', 'Driver allowance'], ['ochwada', 'OCHWADA / client statement'], ['chama', 'Chama contribution']
].map(([value, label]) => ({ value, label }));
const PAYMENT_EXPENSES = ['Airport', 'Garage', 'Cleaning', 'Transport', 'Maintenance', 'Parking', 'Salaries', 'Utilities', 'Bank Charges', 'Other expense'];
const PAYMENT_SPECIAL_EXPENSES = new Set(['fuel', 'rent', 'insurance']);
export function paymentCategories(direction, data = {}) {
  if (direction !== 'out') return PAYMENT_IN;
  const expenses = [...new Set([...PAYMENT_EXPENSES, ...BASE_CATEGORIES, ...(data.expenses || []).map(x => x.category).filter(Boolean)])]
    .filter(category => !PAYMENT_SPECIAL_EXPENSES.has(String(category).toLowerCase()))
    .map(category => ({ value: `x:${category}`, label: category }));
  return [...expenses, ...PAYMENT_OUT];
}
const BILL_MODES = [{ value: '', label: "Car's billing" }, { value: 'auto', label: 'By day(s)' }, { value: 'elapsed', label: 'By time' }, { value: 'hours', label: 'By the hour' }, { value: 'days', label: 'I enter days' }, { value: 'fixed', label: 'Agreed total' }];
const yn = (v, label) => ({ value: v, label });

/* ---------- looking things up ---------- */
const byId = (list, id) => (list || []).find(x => same(x.id, id)) || null;
const paidOn = (data, rentalId, exceptPaymentId) => (data.payments || []).filter(p => same(p.rentalId, rentalId) && !same(p.id, exceptPaymentId)).reduce((s, p) => s + num(p.amount), 0);
export const owedOn = (data, rental, exceptPaymentId) => (!rental || rental.status === 'Cancelled' ? 0 : Math.max(0, r2(num(rental.amount) - paidOn(data, rental.id, exceptPaymentId))));
const oldestFirst = rows => [...rows].sort((a, b) => String(a.pickup || '').localeCompare(String(b.pickup || '')));
const invoiceRentals = (data, invoiceNo) => oldestFirst((data.rentals || []).filter(r => r.status !== 'Cancelled' && String(r.invoice || '') === String(invoiceNo || '')));
const coopRentals = (data, coop) => oldestFirst((data.rentals || []).filter(r => r.status !== 'Cancelled' && coop && (same(r.id, coop.rentalId) || (coop.contract && String(r.contract || '') === String(coop.contract)))));
const clientRentals = (data, clientId) => oldestFirst((data.rentals || []).filter(r => r.status !== 'Cancelled' && same(r.clientId, clientId)));
const invoiceOwed = (data, invoiceNo) => invoiceRentals(data, invoiceNo).reduce((sum, rental) => sum + owedOn(data, rental), 0);
const coopOwed = (data, coop) => coopRentals(data, coop).reduce((sum, rental) => sum + owedOn(data, rental), 0);
const clientOwed = (data, clientId) => clientRentals(data, clientId).reduce((sum, rental) => sum + owedOn(data, rental), 0);
const loanSchedule = loan => {
  if (Array.isArray(loan && loan.schedule)) return loan.schedule.map(item => ({ ...item }));
  try { const rows = JSON.parse(loan && loan.schedule || '[]'); return Array.isArray(rows) ? rows.map(item => ({ ...item })) : []; }
  catch { return []; }
};
const loanPaid = item => item && item.paid && item.paidAmount == null ? num(item.amount) : Math.min(num(item.paidAmount), num(item.amount) || Infinity);
const loanDue = (loan, month) => { const item = loanSchedule(loan).find(x => x.month === month); return item ? Math.max(0, num(item.amount) - loanPaid(item)) : null; };
const loanName = loan => [loan && loan.lender, loan && loan.item].filter(Boolean).join(' · ') || 'Loan';
const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

/* double booking: the desktop's own rule (dates overlap, cancelled ones ignored) */
export function vehicleConflicts(data, vehicleId, pickup, ret, opts = {}) {
  const out = [], L = lookups(data), clash = (a, b, c, d) => a <= d && b >= c;
  (data.bookings || []).forEach(b => { if (!same(b.vehicleId, vehicleId) || b.status === 'Cancelled' || same(b.id, opts.excludeBookingId)) return;
    if (clash(pickup, ret, b.pickup, b.return)) out.push(`Booking (${b.status}) for ${L.clientName(b.clientId)}: ${b.pickup} to ${b.return}`); });
  (data.rentals || []).forEach(r => { if (!same(r.vehicleId, vehicleId) || r.status === 'Cancelled' || same(r.id, opts.excludeRentalId)) return;
    if (clash(pickup, ret, r.pickup, r.return)) out.push(`Rental (${r.status}) for ${L.clientName(r.clientId)}: ${r.pickup} to ${r.return}`); });
  return out;
}

/* ---------- what a pick field offers ---------- */
export function pickOptions(pick, data, values = {}, ctx = {}) {
  const L = lookups(data);
  if (pick === 'paymentRental') {
    const category = values.category, direction = values.direction;
    const keep = ctx.currentRentalId;
    return [...(data.rentals || [])].filter(r => {
      if (r.status === 'Cancelled') return false;
      if (same(r.id, keep)) return true;
      if (direction === 'in' && category === 'rental') return owedOn(data, r, ctx.exceptPaymentId) > 0;
      if (category === 'driver') return isDriverLine(data, r) && driverStatus(r) === 'notcleared';
      if (category === 'owner') return isOwnerLine(data, r) && ownerStatus(r) === 'notcleared';
      if (category === 'fuel' && values.vehicleId != null) return same(r.vehicleId, values.vehicleId);
      return true;
    }).sort((a, b) => String(b.pickup || '').localeCompare(String(a.pickup || '')))
      .map(r => {
        const vehicle = byId(data.vehicles, r.vehicleId), driver = byId(data.drivers, r.driverId);
        const labels = [L.reg(r.vehicleId), L.clientName(r.clientId), r.job, driver && driver.name].filter(Boolean);
        let sub = `${r.pickup || '—'} to ${r.return || '—'}`;
        if (direction === 'in' && category === 'rental') sub += ` · owed ${fmt(owedOn(data, r, ctx.exceptPaymentId))}`;
        else if (category === 'driver') sub += ` · ${fmt(num(r.driverRate) * num(r.days))} driver pay`;
        else if (category === 'owner') sub += ` · ${fmt(r.subhireCost)} owner pay`;
        else if (vehicle && (vehicle.ownership === 'subhire' || isOneOffCar(vehicle))) sub += ' · Sub-hire';
        return { id: r.id, label: labels.join(' · ') || 'Rental', sub };
      });
  }
  if (pick === 'paymentInvoice') {
    return [...(data.invoices || [])].filter(invoice => invoice.no)
      .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))
      .map(invoice => ({ id: invoice.no, label: String(invoice.no), sub: [invoice.client, invoice.month, `owed ${fmt(invoiceOwed(data, invoice.no))}`].filter(Boolean).join(' · ') }));
  }
  if (pick === 'paymentCoop') {
    return [...(data.coops || [])]
      .sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')))
      .map(coop => ({ id: coop.id, label: coop.name || coop.contract || `Coop ${coop.id}`, sub: [coop.contract, coop.start, `owed ${fmt(coopOwed(data, coop))}`].filter(Boolean).join(' · ') }));
  }
  if (pick === 'paymentClient') {
    return [...(data.clients || [])]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map(client => ({ id: client.id, label: client.name || 'Client', sub: [client.phone, `owed ${fmt(clientOwed(data, client.id))}`].filter(Boolean).join(' · ') }));
  }
  if (pick === 'paymentLoan') {
    return [...(data.loans || [])].map(loan => ({ id: loan.id, label: loanName(loan), sub: [loan.borrowed ? `borrowed ${fmt(loan.borrowed)}` : '', loan.instalment ? `instalment ${fmt(loan.instalment)}` : ''].filter(Boolean).join(' · ') }));
  }
  if (pick === 'paymentChama') {
    return [...(data.chama || [])].filter(slot => !slot.paid || same(slot.id, values.chamaId))
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')))
      .map(slot => ({ id: slot.id, label: [slot.scheme, slot.slot, slot.name].filter(Boolean).join(' · ') || `Contribution ${slot.id}`, sub: [slot.dueDate, slot.amount ? fmt(slot.amount) : ''].filter(Boolean).join(' · ') }));
  }
  if (pick === 'vehicles') return [...(data.vehicles || [])].sort((a, b) => String(a.reg).localeCompare(String(b.reg))).map(v => ({ id: v.id, label: v.reg || '—', sub: [[v.make, v.model].filter(Boolean).join(' '), v.rate ? fmt(v.rate) + ' a day' : '', v.ownership === 'subhire' || isOneOffCar(v) ? 'Sub-hire' : ''].filter(Boolean).join(' · ') }));
  if (pick === 'clients') return [...(data.clients || [])].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(c => ({ id: c.id, label: c.name || '—', sub: [c.phone, c.area].filter(Boolean).join(' · ') }));
  if (pick === 'drivers') return [...(data.drivers || [])].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(d => ({ id: d.id, label: d.name || '—', sub: [d.phone, d.kind === 'subhire' ? 'Sub-hire driver' : ''].filter(Boolean).join(' · ') }));
  if (pick === 'coopRentals') return [...(data.rentals || [])].filter(r => r.type === 'coop' && r.status !== 'Cancelled').sort((a, b) => String(b.pickup).localeCompare(String(a.pickup))).map(r => ({ id: r.id, label: `${L.clientName(r.clientId)} · ${L.reg(r.vehicleId)}`, sub: `${r.pickup || '—'}${r.return && r.return !== r.pickup ? ' to ' + r.return : ''}${r.contract ? ' · ' + r.contract : ''}${(data.coops || []).some(c => same(c.rentalId, r.id)) ? ' · has a line' : ''}` }));
  if (pick === 'rentalsOwing' || pick === 'rentalsAll') {
    const keep = ctx.currentRentalId;
    return [...(data.rentals || [])].filter(r => r.status !== 'Cancelled' && (pick === 'rentalsAll' || owedOn(data, r, ctx.exceptPaymentId) > 0 || same(r.id, keep)))
      .sort((a, b) => String(b.pickup).localeCompare(String(a.pickup)))
      .map(r => { const owed = owedOn(data, r, ctx.exceptPaymentId); return { id: r.id, label: `${L.reg(r.vehicleId)} · ${L.clientName(r.clientId)}`, sub: `${r.pickup || '—'} to ${r.return || '—'}${r.contract ? ' · ' + r.contract : ''}${pick === 'rentalsOwing' ? ' · owed ' + fmt(owed) : ''}` }; });
  }
  return [];
}
export const pickLabel = (pick, data, id) => { if (id == null || id === '') return ''; const o = pickOptions(pick, data, {}, { currentRentalId: id }).find(x => same(x.id, id)); return o ? o.label : ''; };

/* ---------- the forms ---------- */
const F = (key, label, type, more = {}) => ({ key, label, type, ...more });

const PAYMENT_RESET = {
  rentalId: null, invoiceNo: '', coopId: null, clientId: null, person: '', vehicleId: null, desc: '',
  fuelKind: 'fill', account: 'Ola', month: '', loanId: null, loanOver: 'cap', expiryDate: '',
  allowMode: 'replace', chamaId: null
};
function paymentSuggestedAmount(values, c) {
  const { data } = c;
  if (values.direction === 'in' && values.category === 'rental') return owedOn(data, byId(data.rentals, values.rentalId), c.existing && c.existing.id);
  if (values.direction === 'in' && values.category === 'invoice') return invoiceOwed(data, values.invoiceNo);
  if (values.direction === 'in' && values.category === 'coop') return coopOwed(data, byId(data.coops, values.coopId));
  if (values.direction === 'in' && values.category === 'client') return clientOwed(data, values.clientId);
  if (values.direction === 'out' && values.category === 'loan') return loanDue(byId(data.loans, values.loanId), values.month);
  if (values.direction === 'out' && values.category === 'chama') return num(byId(data.chama, values.chamaId)?.amount);
  if (values.direction === 'out' && values.category === 'driver') { const rental = byId(data.rentals, values.rentalId); return rental ? num(rental.driverRate) * num(rental.days) : 0; }
  if (values.direction === 'out' && values.category === 'owner') { const rental = byId(data.rentals, values.rentalId); return rental ? num(rental.subhireCost) : 0; }
  return null;
}
function paymentFields(v, c, rentalId, amount, note) {
  return {
    rentalId: rentalId == null ? '' : rentalId, date: parseDate(v.date, c.today), amount: r2(amount), method: v.method || 'Cash',
    note: [note, v.note && v.note.trim()].filter(Boolean).join(' · '), xlRef: '', source: 'Entered in the app',
    invoiceNo: v.category === 'invoice' ? v.invoiceNo : '', linkKind: 'manual'
  };
}
function paymentAllocationOps(v, c, rentals, amount, note) {
  let left = amount;
  const ops = [];
  for (const rental of oldestFirst(rentals)) {
    const owed = owedOn(c.data, rental);
    if (left <= 0) break;
    if (owed <= 0) continue;
    const part = r2(Math.min(owed, left));
    if (part > 0) ops.push({ op: 'create', list: 'payments', fields: paymentFields(v, c, rental.id, part, note) });
    left = r2(left - part);
  }
  if (left > 0 || !ops.length) ops.push({ op: 'create', list: 'payments', fields: paymentFields(v, c, '', left > 0 ? left : amount, note) });
  return ops;
}
function loanPaymentPatch(loan, month, amount, carryForward) {
  const schedule = loanSchedule(loan).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  let current = schedule.find(item => item.month === month);
  if (!current) { current = { month, amount, paid: false, paidAmount: 0 }; schedule.push(current); }
  let left = amount;
  const selectedIndex = schedule.indexOf(current);
  const currentDue = Math.max(0, num(current.amount) - loanPaid(current));
  const currentPaid = Math.min(left, currentDue);
  current.paidAmount = r2(loanPaid(current) + currentPaid);
  current.paid = current.paidAmount >= num(current.amount);
  left = r2(left - currentPaid);
  if (carryForward && left > 0) {
    for (const item of schedule.slice(selectedIndex + 1)) {
      if (left <= 0) break;
      const due = Math.max(0, num(item.amount) - loanPaid(item));
      const paid = Math.min(left, due);
      item.paidAmount = r2(loanPaid(item) + paid);
      item.paid = item.paidAmount >= num(item.amount);
      left = r2(left - paid);
    }
  }
  if (left > 0) {
    current.amount = r2(num(current.amount) + left);
    current.paidAmount = r2(num(current.paidAmount) + left);
    current.paid = true;
  }
  schedule.sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const paidThrough = schedule.filter(item => num(item.amount) > 0 && loanPaid(item) >= num(item.amount)).map(item => item.month).pop() || '';
  return {
    schedule: JSON.stringify(schedule), startDate: schedule[0]?.month || '', endDate: schedule[schedule.length - 1]?.month || '',
    instalment: schedule.length ? schedule[schedule.length - 1].amount : loan.instalment, paidThrough
  };
}
function payHubPlan(v, c) {
  const amount = num(parseMoney(v.amount)), date = parseDate(v.date, c.today), note = v.note && v.note.trim();
  const data = c.data, category = v.category, direction = v.direction;
  if (c.existing) {
    const fields = { rentalId: v.rentalId == null ? '' : v.rentalId, date, amount, method: v.method || 'Other', note };
    if (c.existing.rentalId === '' && fields.rentalId !== '') fields.linkKind = 'manual';
    return { ops: [{ op: 'update', list: 'payments', id: c.existing.id, patch: fields }] };
  }
  if (direction === 'in') {
    if (category === 'rental') return { ops: [{ op: 'create', list: 'payments', fields: paymentFields(v, c, v.rentalId, amount, '') }], destination: 'payments' };
    if (category === 'invoice') return { ops: paymentAllocationOps(v, c, invoiceRentals(data, v.invoiceNo), amount, `Invoice ${v.invoiceNo}`), destination: 'payments' };
    if (category === 'coop') return { ops: paymentAllocationOps(v, c, coopRentals(data, byId(data.coops, v.coopId)), amount, 'Coop / contract payment'), destination: 'payments' };
    if (category === 'client') return { ops: paymentAllocationOps(v, c, clientRentals(data, v.clientId), amount, `Client payment: ${byId(data.clients, v.clientId)?.name || ''}`), destination: 'payments' };
    if (category === 'ochwada') return { ops: [{ op: 'create', list: 'accounts', fields: { account: 'OCHWADA', month: date.slice(0, 7), date, kind: 'payment', amount: -amount, label: note || 'Payment received', note: note || '', xlRef: '' } }], destination: 'pilot' };
    if (category === 'individual') {
      const person = String(v.person || '').trim(), order = Math.max(0, ...(data.individuals || []).map(item => num(item.order))) + 1;
      return { ops: [{ op: 'create', list: 'individuals', fields: { person, date, amount, note: note || 'Received', order, xlRef: '' } }], destination: 'pilot' };
    }
    return { ops: paymentAllocationOps(v, c, [], amount, note ? '' : 'Other money received'), destination: 'payments' };
  }
  if (String(category).startsWith('x:')) {
    return { ops: [{ op: 'create', list: 'expenses', fields: { category: category.slice(2), vehicleId: v.vehicleId || '', date, desc: v.desc.trim(), amount, qty: 1, account: 'Outside', billable: false, source: 'Entered in the app', xlRef: '' } }], destination: 'expenses' };
  }
  if (category === 'rent') return { ops: [{ op: 'create', list: 'expenses', fields: { category: 'Rent', date, month: v.month, desc: `Rent for ${v.month}`, amount, qty: 1, account: 'Outside', billable: false, source: 'Entered in the app', xlRef: '' } }], destination: 'expenses' };
  if (category === 'fuel') {
    if (v.fuelKind === 'topup') return { ops: [{ op: 'create', list: 'fuelAccount', fields: { kind: 'topup', date, amount, note: note || '', xlRef: '' } }], destination: 'fuel' };
    const rental = byId(data.rentals, v.rentalId), vehicleId = v.vehicleId || rental && rental.vehicleId || '';
    return { ops: [{ op: 'create', list: 'expenses', fields: { category: 'Fuel', vehicleId, rentalId: v.rentalId || '', date, desc: v.desc.trim(), amount, qty: 1, account: v.account || 'Ola', billable: false, source: 'Entered in the app', xlRef: '' } }], destination: 'fuel' };
  }
  if (category === 'driver' || category === 'owner') {
    const rental = byId(data.rentals, v.rentalId), copy = { ...rental };
    if (category === 'owner') {
      if (!num(copy.subhireCost)) copy.subhireCost = amount;
      setOwnerStatus(copy, 'paid', date);
      return { ops: [{ op: 'update', list: 'rentals', id: rental.id, patch: { subhireCost: copy.subhireCost, subhireStatus: copy.subhireStatus, subhirePaid: copy.subhirePaid, subhirePaidDate: copy.subhirePaidDate } }], destination: 'subhire' };
    }
    if (!num(copy.driverRate)) copy.driverRate = amount / (num(copy.days) || 1);
    setDriverStatus(copy, 'paid', date);
    return { ops: [{ op: 'update', list: 'rentals', id: rental.id, patch: { driverRate: copy.driverRate, driverStatus: copy.driverStatus, driverStatusDate: copy.driverStatusDate } }], destination: 'subhire' };
  }
  if (category === 'loan') {
    const loan = byId(data.loans, v.loanId);
    return { ops: [{ op: 'update', list: 'loans', id: loan.id, patch: loanPaymentPatch(loan, v.month, amount, v.loanOver === 'next') }], destination: 'pilot' };
  }
  if (category === 'individual') {
    const person = String(v.person || '').trim(), order = Math.max(0, ...(data.individuals || []).map(item => num(item.order))) + 1;
    return { ops: [{ op: 'create', list: 'individuals', fields: { person, date, amount: -amount, note: note || 'Paid', order, xlRef: '' } }], destination: 'pilot' };
  }
  if (category === 'insurance') return { ops: [{ op: 'create', list: 'insurance', fields: { vehicleId: v.vehicleId, kind: v.desc.trim() || 'Insurance', amount, paidDate: date, expiryDate: v.expiryDate || '', note: note || '', xlRef: '' } }], destination: 'pilot' };
  if (category === 'allowance') {
    const rental = byId(data.rentals, v.rentalId), allowance = v.allowMode === 'add' ? num(rental.allowance) + amount : amount;
    return { ops: [{ op: 'update', list: 'rentals', id: rental.id, patch: { allowance, allowanceDate: date } }], destination: 'rentals' };
  }
  if (category === 'chama') {
    const slot = byId(data.chama, v.chamaId);
    return { ops: [{ op: 'update', list: 'chama', id: slot.id, patch: { paid: true, paidDate: date, note: note || slot.note || '' } }], destination: 'pilot' };
  }
  if (category === 'ochwada') return { ops: [{ op: 'create', list: 'accounts', fields: { account: 'OCHWADA', month: date.slice(0, 7), date, kind: 'charge', amount, label: note || 'Paid for him', note: note || '', xlRef: '' } }], destination: 'pilot' };
  return { ops: [] };
}

export const FORMS = {
  vehicles: {
    list: 'vehicles', noun: 'vehicle', needs: ['vehicles'],
    fields: [
      F('reg', 'Registration number', 'text', { required: true, caps: true, placeholder: 'KBR 670E', suggest: 'vehicleReg' }), F('make', 'Make', 'text', { placeholder: 'Toyota' }), F('model', 'Model', 'text', { placeholder: 'Corolla' }), F('year', 'Year', 'int', { placeholder: '2022' }),
      F('rate', 'Daily rate (KSh)', 'money', { required: true, placeholder: '5,000' }), F('owner', 'Owner name', 'text', { placeholder: 'Mbadavi', suggest: 'ownerName' }),
      F('ownership', 'Ownership', 'choice', { choices: [yn('own', 'Own car'), yn('subhire', 'Sub-hire (someone else owns it)')] }),
      F('oneOff', 'One-off sub-hire car', 'bool', { show: v => v.ownership === 'subhire' }),
      F('ownerCost', 'Sub-hire cost per day (KSh)', 'money', { placeholder: '3,500', show: v => v.ownership === 'subhire' }),
      F('billMode', 'How this car is billed', 'choice', { choices: [yn('auto', 'By day(s)'), yn('elapsed', 'By time'), yn('hours', 'By the hour')] }),
      F('billHours', 'Extra hours before another day', 'number', { placeholder: '12', show: v => v.billMode === 'elapsed' }), F('hourRate', 'Hourly rate (KSh)', 'money', { placeholder: '500', show: v => v.billMode === 'hours' }),
      F('status', 'Status', 'choice', { choices: STATUS_VEHICLE })
    ],
    blank: () => ({ ownership: 'own', oneOff: false, billMode: 'auto', billHours: '12', status: 'Available' }),
    fromRecord: r => ({ reg: r.reg, make: r.make, model: r.model, year: r.year, rate: r.rate, owner: r.owner, ownership: r.ownership === 'subhire' ? 'subhire' : 'own', oneOff: isOneOffCar(r), ownerCost: r.ownerCost, billMode: r.billMode || 'auto', billHours: r.billHours, hourRate: r.hourRate, status: r.status || 'Available' }),
    onChange: (key, v) => key === 'ownership' && v.ownership !== 'subhire' ? { oneOff: false, ownerCost: '' } : null,
    check: (v, c) => { const e = {}; if ((c.data.vehicles || []).some(x => !same(x.id, c.existing && c.existing.id) && squash(x.reg) === squash(v.reg))) e.reg = `A vehicle with registration ${String(v.reg).trim()} already exists. Open it from the suggestions instead`; return { errors: e, warnings: [] }; },
    plan: (v, c) => { const f = { reg: v.reg.trim().toUpperCase(), make: v.make.trim(), model: v.model.trim(), year: String(v.year || '').trim(), rate: num(parseMoney(v.rate)), owner: v.owner.trim(), status: v.status, ownership: v.ownership === 'subhire' ? 'subhire' : 'own',
      ownerCost: num(parseMoney(v.ownerCost)), oneOff: v.ownership === 'subhire' && !!v.oneOff, billMode: v.billMode || 'auto', billHours: num(parseMoney(v.billHours)) || 12, hourRate: num(parseMoney(v.hourRate)) };
      return { ops: [c.existing ? { op: 'update', list: 'vehicles', id: c.existing.id, patch: f } : { op: 'create', list: 'vehicles', fields: f }] }; }
  },

  drivers: {
    list: 'drivers', noun: 'driver', needs: ['drivers', 'vehicles'],
    fields: [F('name', 'Full name', 'text', { required: true, placeholder: 'James Mutua', suggest: 'driverName' }), F('phone', 'Phone', 'phone', { placeholder: '0712 345 678' }), F('license', 'Licence number', 'text', { caps: true, placeholder: 'DL 123456' }),
      F('vehicleId', 'Assigned vehicle', 'pick', { pick: 'vehicles', optional: true, placeholder: 'KBR 670E' }), F('allowance', 'Allowance (KSh)', 'money', { placeholder: '1,000' }),
      F('status', 'Status', 'choice', { choices: [yn('Active', 'Active'), yn('Inactive', 'Inactive')] }), F('kind', 'Driver type', 'choice', { choices: [yn('own', 'Own driver'), yn('subhire', 'Sub-hire driver (paid per job)')] })],
    blank: () => ({ status: 'Active', kind: 'own' }),
    fromRecord: r => ({ name: r.name, phone: r.phone, license: r.license, vehicleId: r.vehicleId, allowance: r.allowance, status: r.status || 'Active', kind: r.kind === 'subhire' ? 'subhire' : 'own' }),
    check: (v, c) => { const e = {}; if ((c.data.drivers || []).some(x => !same(x.id, c.existing && c.existing.id) && squash(x.name) === squash(v.name))) e.name = `Another driver is already called ${v.name.trim()}. Open it from the suggestions instead`; return { errors: e, warnings: [] }; },
    plan: (v, c) => { const f = { name: v.name.trim(), phone: v.phone.trim(), license: v.license.trim(), vehicleId: v.vehicleId == null ? '' : v.vehicleId, allowance: num(parseMoney(v.allowance)), status: v.status, kind: v.kind === 'subhire' ? 'subhire' : 'own' };
      return { ops: [c.existing ? { op: 'update', list: 'drivers', id: c.existing.id, patch: f } : { op: 'create', list: 'drivers', fields: f }] }; }
  },

  clients: {
    list: 'clients', noun: 'client', needs: ['clients', 'drivers', 'vehicles'],
    fields: [F('name', 'Full name', 'text', { required: true, placeholder: 'Ndege Tours', suggest: 'clientName' }), F('phone', 'Phone', 'phone', { placeholder: '0712 345 678' }), F('type', 'Client type', 'choice', { choices: CLIENT_TYPES }),
      F('idnum', 'ID number', 'text', { placeholder: '12345678' }), F('dl', 'Driving licence number', 'text', { caps: true, placeholder: 'DL 123456', show: v => v.type === 'taxi' || v.type === 'self' }), F('area', 'Area', 'text', { placeholder: 'Nairobi' }),
      F('driverName', 'Driver provided (if any)', 'text', { placeholder: 'James Mutua', suggest: 'driverNameFill', show: v => v.type === 'coop' || v.type === 'walkin' }), F('driverPhone', "Driver's phone", 'phone', { placeholder: '0712 345 678', show: v => v.type === 'coop' || v.type === 'walkin' })],
    blank: () => ({ type: 'walkin' }),
    fromRecord: r => ({ name: r.name, phone: r.phone, type: clientType(r.type || 'walkin'), idnum: r.idnum, dl: r.dl, area: r.area, driverName: r.driverName, driverPhone: r.driverPhone }),
    choicesFor: (key, c) => { if (key !== 'type') return null; const t = c.existing ? clientType(c.existing.type) : ''; return t && !CLIENT_TYPES.some(x => x.value === t) ? [...CLIENT_TYPES, { value: t, label: t }] : CLIENT_TYPES; },
    check: (v, c) => { const e = {}; if (!c.existing && (c.data.clients || []).some(x => squash(x.name) === squash(v.name))) e.name = `A client called ${v.name.trim()} already exists. Open it from the suggestions instead`;
      const ph = digits(v.phone), twin = ph.length >= 6 ? (c.data.clients || []).find(x => !same(x.id, c.existing && c.existing.id) && digits(x.phone) === ph) : null; if (twin) e.phone = `This number already belongs to ${twin.name}. Open that client instead of adding a second one.`;
      return { errors: e, warnings: [] }; },
    plan: (v, c) => { const f = { name: v.name.trim(), phone: v.phone.trim(), type: v.type, area: v.area.trim(), idnum: v.idnum.trim() };
      if (v.type === 'taxi' || v.type === 'self') f.dl = v.dl.trim(); else if (v.type === 'coop' || v.type === 'walkin') { f.driverName = v.driverName.trim(); f.driverPhone = v.driverPhone.trim(); }
      return { ops: [c.existing ? { op: 'update', list: 'clients', id: c.existing.id, patch: f } : { op: 'create', list: 'clients', fields: { idnum: '', dl: '', usualReg: '', driverName: '', driverPhone: '', ...f } }] }; }
  },

  bookings: {
    list: 'bookings', noun: 'booking', needs: ['bookings', 'vehicles', 'clients', 'rentals'],
    fields: [F('vehicleId', 'Vehicle', 'pick', { pick: 'vehicles', required: true, placeholder: 'KBR 670E' }), F('clientId', 'Client', 'pick', { pick: 'clients', required: true, placeholder: 'Ndege Tours' }),
      F('pickup', 'Planned pickup', 'date', { required: true, placeholder: '15/11/2026' }), F('return', 'Planned return', 'date', { required: true, placeholder: '18/11/2026' }), F('deposit', 'Deposit (KSh)', 'money', { placeholder: '5,000' }),
      F('bookedOn', 'Booked on', 'date', { required: true }), F('status', 'Status', 'choice', { choices: [yn('Pending', 'Pending'), yn('Confirmed', 'Confirmed'), yn('Cancelled', 'Cancelled')] })],
    blank: c => ({ bookedOn: c.today, status: 'Pending' }),
    fromRecord: r => ({ vehicleId: r.vehicleId, clientId: r.clientId, pickup: r.pickup, return: r.return, deposit: r.deposit, bookedOn: r.bookedOn || '', status: r.status || 'Pending' }),
    check: (v, c) => { const e = {}, w = []; const p = parseDate(v.pickup, c.today), r = parseDate(v.return, c.today);
      if (p && r && r < p) e.return = RETURN_BEFORE;
      const g = garageMsg(c, v); if (g) e.vehicleId = g;
      if (!e.return && p && r && v.status !== 'Cancelled' && v.vehicleId != null) { const k = vehicleConflicts(c.data, v.vehicleId, p, r, { excludeBookingId: c.existing && c.existing.id }); if (k.length) w.push('This vehicle already has overlapping dates:\n' + k.join('\n')); }
      if (v.deposit !== '' && parseMoney(v.deposit) < 0) e.deposit = 'The deposit cannot be negative';
      return { errors: e, warnings: w }; },
    plan: (v, c) => { const f = { vehicleId: v.vehicleId, clientId: v.clientId, bookedOn: parseDate(v.bookedOn, c.today), pickup: parseDate(v.pickup, c.today), return: parseDate(v.return, c.today), deposit: num(parseMoney(v.deposit)), status: v.status };
      if (c.existing) { const patch = { ...f }; if (f.pickup !== c.existing.pickup) patch.reminderAck = false; return { ops: [{ op: 'update', list: 'bookings', id: c.existing.id, patch }] }; }
      return { ops: [{ op: 'create', list: 'bookings', fields: { reminderAck: false, ...f } }] }; }
  },

  rentals: {
    list: 'rentals', noun: 'rental', needs: ['rentals', 'vehicles', 'clients', 'drivers', 'payments', 'bookings', 'expenses'],
    fields: [
      F('vehicleId', 'Vehicle', 'pick', { pick: 'vehicles', required: v => !v.oneOffCar, placeholder: 'KBR 670E', show: v => !v.oneOffCar }),
      F('oneOffCar', 'Add a one-off sub-hire car', 'bool', { show: (v, c) => !c.existing }),
      F('oneOffDesc', 'One-off car description', 'text', { required: true, placeholder: 'Prado, one-off', show: (v, c) => !c.existing && !!v.oneOffCar }),
      F('oneOffOwner', 'Owner name', 'text', { placeholder: 'Car owner', suggest: 'ownerName', show: (v, c) => !c.existing && !!v.oneOffCar }),
      F('clientId', 'Client', 'pick', { pick: 'clients', optional: true, placeholder: 'Ndege Tours' }),
      F('newClientName', '…or a new client (name)', 'text', { placeholder: 'Ndege Tours', suggest: 'rentalClient', show: (v, c) => !c.existing }), F('contract', 'Contract number', 'text', { caps: true, placeholder: 'FP-2026-001' }),
      F('pickup', 'Pickup date', 'date', { required: true, placeholder: '15/11/2026' }), F('pickupTime', 'Pickup time', 'time', { placeholder: '09:00' }), F('return', 'Return date', 'date', { required: true, placeholder: '18/11/2026' }), F('returnTime', 'Return time', 'time', { placeholder: '09:00' }),
      F('rate', 'Daily rate (KSh)', 'money', { placeholder: '5,000', hint: (v, c) => { const car = byId(c.data.vehicles, v.vehicleId); return car && num(car.rate) > 0 ? (num(parseMoney(v.rate)) === num(car.rate) ? `This car's daily rate (${fmt(car.rate)}). You can change it for this rental.` : `This car's daily rate is ${fmt(car.rate)}. Changed for this rental.`) : ''; } }), F('billMode', 'How this rental is charged', 'choice', { choices: BILL_MODES }), F('days', 'Days charged', 'int', { placeholder: '3', show: v => v.billMode === 'days' }),
      F('amount', 'Amount (blank = worked out)', 'money', { placeholder: '15,000' }), F('fuel', 'Fuel you carried (KSh)', 'money', { placeholder: '1,000' }), F('fuelCharge', 'Fuel charged to the client (KSh)', 'money', { placeholder: '1,200' }), F('allowance', 'Driver allowance (KSh)', 'money', { placeholder: '500' }),
      F('driverId', 'Driver', 'pick', { pick: 'drivers', optional: true, placeholder: 'James Mutua' }), F('status', 'Status', 'choice', { choices: [yn('Active', 'Active'), yn('Completed', 'Completed'), yn('Cancelled', 'Cancelled')] }),
      F('subhireCost', 'Sub-hire cost (KSh)', 'money', { placeholder: '3,500', show: (v, c) => !!v.oneOffCar || subhireCar(c.data, v.vehicleId) }), F('subhirePaid', 'Owner paid', 'bool', { show: (v, c) => !!v.oneOffCar || subhireCar(c.data, v.vehicleId) }),
      F('mileage', 'Mileage (km)', 'money', { placeholder: '84,500' }), F('invoice', 'Invoice number', 'text', { caps: true, placeholder: 'INV-001' }), F('receipt', 'Receipt number', 'text', { caps: true, placeholder: 'RCPT-001' })
    ],
    blank: () => ({ oneOffCar: false, billMode: '', status: 'Active', subhirePaid: false }),
    fromRecord: r => ({ vehicleId: r.vehicleId, oneOffCar: false, oneOffDesc: '', oneOffOwner: '', clientId: r.clientId, contract: r.contract, pickup: r.pickup, pickupTime: r.pickupTime, return: r.return, returnTime: r.returnTime, rate: r.rate, billMode: r.billMode || '', days: r.billMode === 'days' ? r.days : '',
      amount: r.billMode === 'fixed' ? r.amount : '', fuel: r.fuel, fuelCharge: r.fuelCharge, allowance: r.allowance, driverId: r.driverId, status: r.status || 'Active', subhireCost: r.subhireCost, subhirePaid: !!r.subhirePaid, mileage: r.mileage, invoice: r.invoice, receipt: r.receipt }),
    /* picking the car fills its daily rate (and its sub-hire cost is left to the days x cost rule); picking the client fills nothing else */
    onChange: (key, v, c) => {
      if (key === 'oneOffCar') return v.oneOffCar ? { vehicleId: null, rate: '', subhireCost: '', subhirePaid: false, oneOffDesc: '', oneOffOwner: '' } : { oneOffDesc: '', oneOffOwner: '' };
      if (key === 'vehicleId' && v.vehicleId != null) {
        const car = byId(c.data.vehicles, v.vehicleId), reset = { oneOffCar: false, oneOffDesc: '', oneOffOwner: '' };
        if (car && (v.rate === '' || v.rate == null || c.rateFromCar)) return { ...reset, rate: car.rate ? String(car.rate) : v.rate, __rateFromCar: true };
        return reset;
      }
      return null;
    },
    check: (v, c) => rentalCheck(v, c),
    plan: (v, c) => rentalPlan(v, c)
  },

  payments: {
    list: 'payments', noun: 'payment', needs: ['payments', 'rentals', 'vehicles', 'clients', 'drivers', 'invoices', 'coops', 'accounts', 'individuals', 'insurance', 'loans', 'chama', 'fuelAccount', 'expenses'],
    fields: [
      F('direction', 'Direction', 'choice', { choices: [{ value: 'in', label: 'Money in' }, { value: 'out', label: 'Money out' }], show: (v, c) => !c.existing }),
      F('category', v => v.direction === 'out' ? 'Paid for' : 'Received for', 'choice', { select: true, required: true, show: (v, c) => !c.existing }),
      F('rentalId', 'Rental / job', 'pick', { pick: 'paymentRental', required: v => v.direction === 'in' && v.category === 'rental' || v.direction === 'out' && ['driver', 'owner', 'allowance'].includes(v.category), placeholder: 'KBR 670E · Ndege Tours', show: v => v.direction === 'in' && v.category === 'rental' || v.direction === 'out' && (['driver', 'owner', 'allowance'].includes(v.category) || v.category === 'fuel' && v.fuelKind === 'fill') }),
      F('invoiceNo', 'Invoice', 'pick', { pick: 'paymentInvoice', required: true, placeholder: 'Choose an outstanding invoice', show: v => v.direction === 'in' && v.category === 'invoice' }),
      F('coopId', 'Coop / contract', 'pick', { pick: 'paymentCoop', required: true, placeholder: 'Choose a coop line', show: v => v.direction === 'in' && v.category === 'coop' }),
      F('clientId', 'Client', 'pick', { pick: 'paymentClient', required: true, placeholder: 'Choose a client with unpaid rentals', show: v => v.direction === 'in' && v.category === 'client' }),
      F('person', 'Person', 'text', { required: true, placeholder: 'Name of the person', suggest: 'individualPerson', show: v => v.category === 'individual' }),
      F('vehicleId', 'Vehicle', 'pick', { pick: 'vehicles', placeholder: 'Choose a vehicle', show: v => v.direction === 'out' && (String(v.category).startsWith('x:') || v.category === 'fuel' && v.fuelKind === 'fill' || v.category === 'insurance') }),
      F('desc', v => v.category === 'insurance' ? 'Policy / cover' : 'Description', 'text', { placeholder: 'What was this for?', show: v => v.direction === 'out' && (String(v.category).startsWith('x:') || ['fuel', 'insurance'].includes(v.category)) }),
      F('fuelKind', 'Fuel action', 'choice', { choices: [{ value: 'fill', label: 'Fuel fill' }, { value: 'topup', label: 'Top up fuel account' }], show: v => v.direction === 'out' && v.category === 'fuel' }),
      F('account', 'Paid from', 'choice', { choices: [{ value: 'Ola', label: 'Ola account' }, { value: 'Outside', label: 'Outside (cash)' }, { value: 'Untagged', label: 'Untagged / office fill' }], show: v => v.direction === 'out' && v.category === 'fuel' && v.fuelKind === 'fill' }),
      F('month', 'Month', 'text', { required: true, placeholder: '2026-11', show: v => v.direction === 'out' && ['rent', 'loan'].includes(v.category) }),
      F('loanId', 'Loan', 'pick', { pick: 'paymentLoan', required: true, placeholder: 'Choose a loan', show: v => v.direction === 'out' && v.category === 'loan' }),
      F('loanOver', 'Extra payment', 'choice', { choices: [{ value: 'cap', label: 'Keep it on this instalment' }, { value: 'next', label: 'Carry extra to later instalments' }], show: v => v.direction === 'out' && v.category === 'loan' }),
      F('expiryDate', 'Cover expiry date', 'date', { placeholder: '15/11/2027', show: v => v.direction === 'out' && v.category === 'insurance' }),
      F('allowMode', 'Allowance action', 'choice', { choices: [{ value: 'replace', label: 'Set total allowance' }, { value: 'add', label: 'Add to allowance' }], show: v => v.direction === 'out' && v.category === 'allowance' }),
      F('chamaId', 'Chama contribution', 'pick', { pick: 'paymentChama', required: true, placeholder: 'Choose an unpaid contribution', show: v => v.direction === 'out' && v.category === 'chama' }),
      F('date', 'Date', 'date', { required: true, placeholder: '15/11/2026' }),
      F('amount', 'Amount (KSh)', 'money', { required: true, placeholder: '5,000' }),
      F('method', 'Method', 'choice', { choices: METHODS }),
      F('note', 'Note', 'text', { placeholder: 'Reference, receipt or extra details' })
    ],
    categories: (data, values) => paymentCategories(values && values.direction || 'in', data),
    blank: c => ({ direction: 'in', category: 'rental', date: c.today, method: 'Cash', fuelKind: 'fill', account: 'Ola', month: c.today.slice(0, 7), loanOver: 'cap', allowMode: 'replace' }),
    fromRecord: r => ({ direction: 'in', category: r.rentalId ? 'rental' : 'other', rentalId: r.rentalId, amount: r.amount, date: r.date, method: r.method || 'Other', note: r.note }),
    choicesFor: (key, c) => key === 'method' && c.existing && c.existing.method && !METHODS.some(m => m.value === c.existing.method) ? [...METHODS, { value: c.existing.method, label: c.existing.method }] : null,
    onChange: (key, v, c) => {
      if (key === 'direction' || key === 'category') {
        return { ...PAYMENT_RESET, amount: '', month: c.today.slice(0, 7), ...(key === 'direction' ? { category: paymentCategories(v.direction, c.data)[0].value } : {}) };
      }
      if (key === 'vehicleId' && v.direction === 'out' && v.category === 'fuel' && v.fuelKind === 'fill' && v.vehicleId != null && !v.rentalId) {
        const rentalId = rentalForFill(c.data, v.vehicleId, parseDate(v.date, c.today));
        if (rentalId !== '') return { rentalId };
      }
      if (['rentalId', 'invoiceNo', 'coopId', 'clientId', 'loanId', 'month', 'chamaId'].includes(key)) {
        const amount = paymentSuggestedAmount(v, c);
        if (amount > 0 && (v.amount === '' || v.amount == null || c.paymentAmountFromLink || c.amountFromRental)) {
          return { amount: String(amount), ...(v.direction === 'in' && v.category === 'rental' ? { __amountFromRental: true } : { __paymentAmountFromLink: true }) };
        }
      }
      return null;
    },
    check: (v, c) => {
      const e = {}, warnings = [], amount = parseMoney(v.amount);
      if (isFuture(v.date, c)) e.date = FUTURE_MSG;
      if (!Number.isNaN(amount) && amount <= 0) e.amount = 'Enter an amount above 0.';
      if (v.direction === 'in' && v.category === 'rental') {
        const rental = byId(c.data.rentals, v.rentalId);
        if (rental && !Number.isNaN(amount)) {
          const left = owedOn(c.data, rental, c.existing && c.existing.id);
          if (amount > left) e.amount = `That is more than the ${ksh0(left)} still owed on this rental. Enter up to ${ksh0(left)}.`;
        }
      }
      if (!c.existing && v.direction === 'in' && v.category === 'other' && !String(v.note || '').trim()) e.note = 'Say who paid in the note, so it can be linked later.';
      if (!c.existing && v.direction === 'out' && ['rent', 'loan'].includes(v.category) && !validMonth(v.month)) e.month = 'Enter the month as YYYY-MM.';
      if (!c.existing && v.direction === 'out' && v.category === 'fuel' && v.fuelKind === 'fill' && v.account !== 'Untagged' && v.vehicleId == null && v.rentalId == null) e.vehicleId = 'Choose the vehicle this fuel went into, or mark it Untagged.';
      if (!c.existing && v.direction === 'out' && v.category === 'insurance' && v.vehicleId == null) e.vehicleId = 'Choose the insured vehicle.';
      if (!c.existing && v.direction === 'out' && v.category === 'loan' && !byId(c.data.loans, v.loanId)) e.loanId = 'Choose a loan.';
      if (!c.existing && v.direction === 'out' && v.category === 'chama' && !byId(c.data.chama, v.chamaId)) e.chamaId = 'Choose an unpaid contribution.';
      if (!c.existing && v.direction === 'in' && !Number.isNaN(amount)) {
        let rows = [], owed = 0, label = '';
        if (v.category === 'invoice') { rows = invoiceRentals(c.data, v.invoiceNo); owed = rows.reduce((sum, rental) => sum + owedOn(c.data, rental), 0); label = `Invoice ${v.invoiceNo}`; }
        else if (v.category === 'coop') { rows = coopRentals(c.data, byId(c.data.coops, v.coopId)); owed = rows.reduce((sum, rental) => sum + owedOn(c.data, rental), 0); label = 'This coop / contract'; }
        else if (v.category === 'client') { rows = clientRentals(c.data, v.clientId); owed = rows.reduce((sum, rental) => sum + owedOn(c.data, rental), 0); label = 'This client'; }
        if (label && !rows.length) warnings.push(`${label} has no linked unpaid rentals. The receipt will be saved unlinked so it can be matched later.`);
        else if (label && Math.round(amount * 100) !== Math.round(owed * 100)) warnings.push(`${label} has ${ksh0(owed)} outstanding. The receipt will be allocated oldest first; any extra will be saved unlinked.`);
      }
      return { errors: e, warnings };
    },
    plan: payHubPlan
  },

  expenses: {
    list: 'expenses', noun: 'expense', needs: ['expenses', 'vehicles', 'clients', 'rentals'],
    fields: [
      F('category', 'Category', 'choice', { wrap: true }),       F('vehicleId', 'Vehicle (optional)', 'pick', { pick: 'vehicles', optional: true, blankLabel: 'Office / general', placeholder: 'Office / general (no vehicle)' }), F('date', 'Date', 'date', { required: true, placeholder: '15/11/2026' }),
      F('desc', 'Description', 'text', { placeholder: 'Engine service' }), F('amount', 'Amount (KSh)', 'money', { required: true, placeholder: '8,500' }), F('qty', 'Quantity', 'number', { placeholder: '1' }),
      F('account', 'Paid from', 'choice', { choices: [yn('Ola', 'Ola account'), yn('Outside', 'Outside (cash)'), yn('Untagged', 'Untagged / office fill')], show: v => v.category === 'Fuel' }),
      F('rentalId', 'Fuel for rental', 'pick', { pick: 'rentalsAll', optional: true, placeholder: 'KBR 670E · Ndege Tours', show: v => v.category === 'Fuel' }),
      F('billable', 'Office-fronted: bill this fuel to a client', 'bool', { show: v => v.category === 'Fuel' }),
      F('billClientId', 'Client to charge', 'pick', { pick: 'clients', placeholder: 'Ndege Tours', show: v => v.category === 'Fuel' && !!v.billable }), F('chargeAmount', 'Amount to charge the client (KSh)', 'money', { placeholder: '5,000', show: v => v.category === 'Fuel' && !!v.billable })
    ],
    categories: data => [...new Set([...BASE_CATEGORIES, ...(data.expenses || []).map(x => x.category).filter(Boolean)])].map(v => ({ value: v, label: v })),
    blank: c => ({ category: c.preset && c.preset.category ? c.preset.category : 'Garage', date: c.today, qty: '1', account: 'Ola', billable: false }),
    fromRecord: r => ({ category: r.category || 'Other', vehicleId: r.vehicleId, date: r.date, desc: r.desc, amount: r.amount, qty: r.qty == null ? '1' : r.qty, account: r.account === 'Outside' ? 'Outside' : r.account === 'Ola' ? 'Ola' : 'Untagged', rentalId: r.rentalId, billable: !!r.billable, billClientId: r.billClientId, chargeAmount: r.chargeAmount }),
    /* a fuel fill with a car and a date offers the rental that car was on */
    onChange: (key, v, c) => { if ((key === 'vehicleId' || key === 'date' || key === 'category') && v.category === 'Fuel' && v.vehicleId != null && (v.rentalId == null || c.rentalAuto)) { const rid = rentalForFill(c.data, v.vehicleId, parseDate(v.date, c.today)); return { rentalId: rid === '' ? null : rid, __rentalAuto: true }; } return null; },
    check: (v, c) => { const e = {}, a = parseMoney(v.amount); if (isFuture(v.date, c)) e.date = FUTURE_MSG; if (!Number.isNaN(a) && a <= 0) e.amount = 'Enter an amount above 0.';
      if (v.category === 'Fuel' && v.billable) { if (v.billClientId == null) e.billClientId = 'Pick the client to charge'; if (v.chargeAmount !== '' && parseMoney(v.chargeAmount) < 0) e.chargeAmount = 'Not below zero'; }
      if (v.category === 'Fuel' && v.account !== 'Untagged' && v.vehicleId == null && v.rentalId == null) e.vehicleId = 'Pick the car this fuel went into, or mark it Untagged';
      const w = [], dt = parseDate(v.date, c.today);
      if (v.category === 'Fuel' && v.vehicleId != null && dt && !Number.isNaN(a) && (c.data.expenses || []).some(x => x.category === 'Fuel' && !same(x.id, c.existing && c.existing.id) && same(x.vehicleId, v.vehicleId) && x.date === dt && Math.round(num(x.amount) * 100) === Math.round(a * 100))) w.push(DUP_FUEL);
      return { errors: e, warnings: w }; },
    plan: (v, c) => { const fuel = v.category === 'Fuel', rental = fuel && v.rentalId != null ? byId(c.data.rentals, v.rentalId) : null;
      const vehicleId = v.vehicleId != null ? v.vehicleId : (rental ? rental.vehicleId : '');
      const f = { vehicleId, date: parseDate(v.date, c.today), category: v.category, desc: v.desc.trim() || (fuel ? 'Fuel' + (rental && rental.contract ? ' — ' + rental.contract : '') : ''), qty: num(parseMoney(v.qty)) || 1, amount: num(parseMoney(v.amount)),
        billable: fuel && !!v.billable, billClientId: fuel && v.billable ? v.billClientId : null, chargeAmount: fuel && v.billable ? num(parseMoney(v.chargeAmount)) : 0, rentalId: rental ? rental.id : null };
      if (fuel) f.account = ['Ola', 'Outside', 'Untagged'].includes(v.account) ? v.account : 'Ola';
      if (c.existing) return { ops: [{ op: 'update', list: 'expenses', id: c.existing.id, patch: f }] };
      return { ops: [{ op: 'create', list: 'expenses', fields: { ...f, source: fuel ? 'fuel' : 'manual', xlRef: '' } }] }; }
  },

  fuelTopup: {
    list: 'fuelAccount', noun: 'fuel top-up', needs: ['fuelAccount'],
    fields: [F('amount', 'Amount paid in (KSh)', 'money', { required: true, placeholder: '20,000' }), F('date', 'Date', 'date', { required: true, placeholder: '15/11/2026' }), F('note', 'Note', 'text', { placeholder: 'M-Pesa transaction or receipt details' })],
    blank: c => ({ date: c.today }),
    fromRecord: r => ({ amount: r.amount, date: r.date, note: r.note || r.desc || '' }),
    check: (v, c) => { const e = {}, a = parseMoney(v.amount); if (isFuture(v.date, c)) e.date = FUTURE_MSG; if (!Number.isNaN(a) && a <= 0) e.amount = 'Enter an amount above 0.'; return { errors: e, warnings: [] }; },
    plan: (v, c) => { const f = { kind: 'topup', date: parseDate(v.date, c.today), amount: num(parseMoney(v.amount)), note: v.note.trim() };
      return { ops: [c.existing ? { op: 'update', list: 'fuelAccount', id: c.existing.id, patch: f } : { op: 'create', list: 'fuelAccount', fields: f }] }; }
  },

  /* a coop schedule line that is not in Rentals yet ("To complete") */
  coops: {
    list: 'coops', noun: 'coop line', needs: ['coops', 'rentals', 'clients', 'vehicles'],
    fields: [F('name', 'Name of staff served', 'text', { required: true, caps: true, placeholder: 'James Mutua' }), F('department', 'Branch department', 'text', { caps: true, placeholder: 'Nairobi Branch' }), F('start', 'From', 'date', { required: true, placeholder: '15/11/2026' }), F('end', 'To', 'date', { placeholder: '18/11/2026' }),
      F('days', 'No of hire days', 'int', { placeholder: '3' }), F('contract', 'Job card / contract no', 'text', { placeholder: 'JOB-001' }), F('amount', 'Vehicle charge (KSh, without VAT)', 'money', { required: true, placeholder: '15,000' }), F('kmOut', 'KMs out', 'number', { placeholder: '84,500' }), F('kmIn', 'KMs in', 'number', { placeholder: '84,750' })],
    blank: c => ({ start: c.today, end: '' }),
    fromRecord: r => ({ name: r.name, department: r.department || '', start: r.start, end: r.end || '', days: r.days || '', contract: r.contract || '', amount: r.amount, kmOut: r.kmOut || '', kmIn: r.kmIn || '' }),
    check: (v, c) => { const e = {}, a = parseMoney(v.amount); if (!Number.isNaN(a) && a <= 0) e.amount = 'Enter an amount above 0.';
      const s0 = parseDate(v.start, c.today), e0 = parseDate(v.end, c.today); if (s0 && e0 && e0 < s0) e.end = RETURN_BEFORE;
      if (num(parseMoney(v.kmIn)) && num(parseMoney(v.kmOut)) && num(parseMoney(v.kmIn)) < num(parseMoney(v.kmOut))) e.kmIn = 'KMs in cannot be less than KMs out.'; return { errors: e, warnings: [] }; },
    plan: (v, c) => { const f = { name: String(v.name).trim().toUpperCase(), department: String(v.department).trim().toUpperCase(), start: parseDate(v.start, c.today), end: parseDate(v.end, c.today) || parseDate(v.start, c.today), days: num(v.days), contract: String(v.contract).trim(),
        amount: num(parseMoney(v.amount)), kmOut: num(parseMoney(v.kmOut)), kmIn: num(parseMoney(v.kmIn)) };
      return { ops: [c.existing ? { op: 'update', list: 'coops', id: c.existing.id, patch: f } : { op: 'create', list: 'coops', fields: { ...f, driverPay: 0, allowance: 0, fuel: 0, withVat: 0, note: '', rentalId: '', status: 'todo', xlRef: '' } }] }; }
  },

  /* a coop line made from a coop rental: pick the rental, type staff, department, KMs and the contract no. Fuel, driver and allowance are read from the rental. */
  coopFromRental: {
    list: 'coops', noun: 'coop line', needs: ['coops', 'rentals', 'clients', 'vehicles'],
    fields: [F('rentalId', 'Coop rental', 'pick', { pick: 'coopRentals', required: true, placeholder: 'KBR 670E · Ndege Tours' }), F('name', 'Name of staff served', 'text', { caps: true, placeholder: 'James Mutua' }), F('department', 'Branch department', 'text', { caps: true, placeholder: 'Nairobi Branch' }),
      F('kmOut', 'KMs out', 'number', { placeholder: '84,500' }), F('kmIn', 'KMs in', 'number', { placeholder: '84,750' }), F('contract', 'Job card / contract no', 'text', { placeholder: 'JOB-001' })],
    blank: c => {
      const rental = byId(c.data.rentals, c.preset && c.preset.rentalId);
      if (!rental) return {};
      const coop = (c.data.coops || []).find(x => same(x.rentalId, rental.id)), L = lookups(c.data);
      return { rentalId: rental.id, name: (coop && coop.name) || L.clientName(rental.clientId) || '', department: (coop && coop.department) || '',
        kmOut: coop && coop.kmOut ? coop.kmOut : '', kmIn: coop && coop.kmIn ? coop.kmIn : '', contract: (coop && coop.contract) || rental.contract || '' };
    },
    onChange: (key, v, c) => { if (key !== 'rentalId' || v.rentalId == null || v.rentalId === '') return {}; const r = byId(c.data.rentals, v.rentalId), cp = (c.data.coops || []).find(x => same(x.rentalId, v.rentalId)), L = lookups(c.data);
      return r ? { name: (cp && cp.name) || L.clientName(r.clientId) || '', department: (cp && cp.department) || '', kmOut: cp && cp.kmOut ? cp.kmOut : '', kmIn: cp && cp.kmIn ? cp.kmIn : '', contract: (cp && cp.contract) || r.contract || '' } : {}; },
    check: (v, c) => { const e = {}; if (v.rentalId == null || v.rentalId === '') e.rentalId = NEEDED; const o = num(parseMoney(v.kmOut)), i = num(parseMoney(v.kmIn)); if (o && i && i < o) e.kmIn = 'KMs in cannot be less than KMs out.'; return { errors: e, warnings: [] }; },
    plan: (v, c) => { const r = byId(c.data.rentals, v.rentalId), cp = (c.data.coops || []).find(x => same(x.rentalId, v.rentalId)), L = lookups(c.data), up = x => String(x || '').trim().toUpperCase(), ops = [];
      const f = { name: up(v.name) || (cp && cp.name) || up(L.clientName(r.clientId)), department: up(v.department), kmOut: num(parseMoney(v.kmOut)), kmIn: num(parseMoney(v.kmIn)), contract: String(v.contract || '').trim() };
      if (cp) ops.push({ op: 'update', list: 'coops', id: cp.id, patch: f });
      else ops.push({ op: 'create', list: 'coops', fields: { ...f, clientId: r.clientId, start: r.pickup || '', end: r.return || r.pickup || '', days: num(r.days), amount: num(r.amount), driverPay: 0, allowance: num(r.allowance), fuel: num(r.fuel), withVat: 0, note: '', rentalId: r.id, status: 'done', xlRef: '' } });
      const rp = {}; if (f.contract) rp.contract = f.contract; if (f.kmIn > f.kmOut && f.kmOut > 0) rp.mileage = f.kmIn - f.kmOut;
      if (Object.keys(rp).length) ops.push({ op: 'update', list: 'rentals', id: r.id, patch: rp });
      return { ops }; }
  }
};

/* a car in the garage cannot be rented or booked (an old record keeps its car) */
const garageMsg = (c, v) => { const car = byId(c.data.vehicles, v.vehicleId); return car && car.status === 'Maintenance' && v.status !== 'Cancelled' && !(c.existing && same(c.existing.vehicleId, car.id)) ? `${car.reg} is in the garage. Choose another car.` : ''; };
const subhireCar = (data, vehicleId) => { const car = byId(data.vehicles, vehicleId); return !!car && (car.ownership === 'subhire' || isOneOffCar(car)); };

/* ---------- rentals: preview, checks, plan ---------- */
function draftOf(v, today) {
  return { pickup: parseDate(v.pickup, today), pickupTime: parseTime(v.pickupTime), return: parseDate(v.return, today), returnTime: parseTime(v.returnTime), rate: num(parseMoney(v.rate)),
    billMode: v.billMode || '', days: num(parseMoney(v.days)), amount: num(parseMoney(v.amount)) };
}
export function rentalPreview(v, c) {
  const car = v.oneOffCar ? { ownership: 'subhire', oneOff: true, ownerCost: 0, rate: 0, billMode: 'auto' } : byId(c.data.vehicles, v.vehicleId), d = draftOf(v, c.today);
  if (!car || !d.pickup || !d.return || d.return < d.pickup) return '';
  const ch = charge(d, car), amount = d.amount > 0 ? d.amount : ch.amount;
  return `${ch.label}  =  ${fmt(amount)}${d.amount > 0 ? '' : ' (worked out)'}`;
}
function rentalCheck(v, c) {
  const e = {}, w = [], d = draftOf(v, c.today), car = v.oneOffCar ? { ownership: 'subhire', oneOff: true, ownerCost: 0, rate: 0, billMode: 'auto' } : byId(c.data.vehicles, v.vehicleId);
  if (v.clientId == null && !String(v.newClientName || '').trim()) e.clientId = 'Pick the client, or type a new client\'s name';
  if (v.oneOffCar) {
    const description = String(v.oneOffDesc || '').trim();
    if (!description) e.oneOffDesc = 'Type the one-off car description.';
    else if ((c.data.vehicles || []).some(vehicle => squash(vehicle.reg) === squash(description))) e.oneOffDesc = `A car called "${description}" is already on the list. Pick it, or use another description.`;
    if (!(parseMoney(v.subhireCost) > 0)) e.subhireCost = 'Enter the one-off sub-hire cost for this rental.';
  } else {
    if (v.vehicleId == null) e.vehicleId = 'Choose a vehicle or add a one-off sub-hire car.';
    const g = garageMsg(c, v); if (g) e.vehicleId = g;
  }
  if (d.pickup && d.return) {
    if (d.return < d.pickup) e.return = RETURN_BEFORE;
    else if (d.pickup === d.return && d.pickupTime && d.returnTime && d.returnTime < d.pickupTime) e.returnTime = "The return time can't be before the pickup time on the same day";
  }
  const mode = (d.billMode || (car && car.billMode) || 'auto');
  if (mode === 'fixed' && !(d.amount > 0)) e.amount = 'Enter the agreed amount';
  if (mode === 'days' && !(d.days > 0)) e.days = 'Enter the days to charge';
  if (mode !== 'fixed' && !(d.rate > 0) && !(car && num(car.rate) > 0)) e.rate = 'The daily rate must be more than zero';
  for (const k of ['fuel', 'fuelCharge', 'allowance', 'mileage', 'subhireCost']) if (v[k] !== '' && v[k] != null && parseMoney(v[k]) < 0) e[k] = 'Not below zero';
  if (!e.return && d.pickup && d.return && v.status !== 'Cancelled' && v.vehicleId != null) { const k = vehicleConflicts(c.data, v.vehicleId, d.pickup, d.return, { excludeRentalId: c.existing && c.existing.id }); if (k.length) w.push('This vehicle already has overlapping dates:\n' + k.join('\n')); }
  return { errors: e, warnings: w };
}
function rentalPlan(v, c) {
  const addingOneOffCar = !c.existing && !!v.oneOffCar;
  const car = addingOneOffCar
    ? { reg: String(v.oneOffDesc || '').trim(), owner: String(v.oneOffOwner || '').trim(), ownership: 'subhire', oneOff: true, ownerCost: 0, rate: 0, billMode: 'auto', id: null }
    : byId(c.data.vehicles, v.vehicleId) || {};
  const d = draftOf(v, c.today), ch = charge({ ...d, rate: d.rate || num(car.rate) }, car), dur = duration(d);
  const days = ch.unit === 'day' ? ch.units : (dur.ok ? dur.calendarDays : 1);
  const amount = d.amount > 0 ? d.amount : ch.amount;
  const name = String(v.newClientName || '').trim();
  const known = v.clientId == null && name ? (c.data.clients || []).find(x => squash(x.name) === squash(name)) : null;
  const clientId = v.clientId != null ? v.clientId : (known ? known.id : null);
  const client = byId(c.data.clients, clientId);
  const fuel = num(parseMoney(v.fuel)), fuelChargeRaw = String(v.fuelCharge == null ? '' : v.fuelCharge).trim();
  const f = { vehicleId: v.vehicleId, clientId, contract: v.contract.trim(), invoice: v.invoice.trim(), receipt: v.receipt.trim(), pickup: d.pickup, pickupTime: d.pickupTime, return: d.return, returnTime: d.returnTime,
    rate: d.rate || num(car.rate), days, mileage: num(parseMoney(v.mileage)), amount, status: v.status, fuel, fuelCharge: fuelChargeRaw === '' ? 0 : num(parseMoney(fuelChargeRaw)),
    type: client ? clientType(client.type || 'walkin') : (c.existing && c.existing.type) || 'walkin', driverId: v.driverId == null ? null : v.driverId, billMode: d.billMode || '', hours: dur.ok ? dur.hours : null, allowance: num(parseMoney(v.allowance)),
    subhireCost: car.ownership === 'subhire' || isOneOffCar(car) ? (String(v.subhireCost == null ? '' : v.subhireCost).trim() !== '' ? num(parseMoney(v.subhireCost)) : num(car.ownerCost) * days) : 0, subhirePaid: (car.ownership === 'subhire' || isOneOffCar(car)) && !!v.subhirePaid };
  const ops = []; let ci = -1, vi = -1;
  if (addingOneOffCar) {
    vi = ops.length;
    ops.push({ op: 'create', list: 'vehicles', fields: { reg: car.reg, make: '', model: '', year: '', rate: 0, owner: car.owner, status: v.status === 'Active' ? 'Rented' : 'Available', ownership: 'subhire', ownerCost: 0, oneOff: true, billMode: 'auto', billHours: 12, hourRate: 0 } });
  }
  if (clientId == null) { ci = ops.length; ops.push({ op: 'create', list: 'clients', fields: { name, phone: '', idnum: '', dl: '', usualReg: '', driverName: '', driverPhone: '', type: 'walkin', area: '' } }); f.type = 'walkin'; }
  const fieldsNow = res => { const out = { ...f, vehicleId: vi >= 0 ? res[vi].id : v.vehicleId, clientId: ci >= 0 ? res[ci].id : clientId }; if (car.ownership === 'subhire' || isOneOffCar(car)) syncOwnerFromTick(out); return out; };
  const ri = ops.length;
  if (c.existing) {
    const merged = res => { const out = { ...c.existing, ...fieldsNow(res) }; if (car.ownership === 'subhire' || isOneOffCar(car)) syncOwnerFromTick(out); return out; };
    ops.push({ op: 'update', list: 'rentals', id: c.existing.id, patch: res => merged(res) });
  } else ops.push({ op: 'create', list: 'rentals', fields: res => fieldsNow(res) });
  if (c.existing && c.existing.status === 'Active' && (!same(c.existing.vehicleId, v.vehicleId) || v.status !== 'Active')) {
    const previousCar = byId(c.data.vehicles, c.existing.vehicleId);
    const anotherActiveRental = (c.data.rentals || []).some(r => !same(r.id, c.existing.id) && same(r.vehicleId, c.existing.vehicleId) && r.status === 'Active');
    if (previousCar && previousCar.status === 'Rented' && !anotherActiveRental) {
      ops.push({ op: 'update', list: 'vehicles', id: previousCar.id, patch: { status: 'Available' } });
    }
  }
  if (v.status === 'Active' && car.id != null && car.status !== 'Rented') ops.push({ op: 'update', list: 'vehicles', id: car.id, patch: { status: 'Rented' } });
  /* the fuel the office carried is also a Fuel expense, linked to the rental (not for rentals that came from Excel: their fuel already arrived on its own) */
  const mirror = c.existing ? (c.data.expenses || []).find(x => x.source === 'rental' && same(x.rentalId, c.existing.id)) : null;
  if (!(c.existing && c.existing.xlRef)) {
    const rentalId = res => (c.existing ? c.existing.id : res[ri].id);
    const row = res => ({ vehicleId: f.vehicleId, date: f.pickup, category: 'Fuel', desc: 'Fuel — rental' + (f.contract ? ' ' + f.contract : ''), qty: 1, amount: fuel, billable: true, billClientId: ci >= 0 ? res[ci].id : clientId, chargeAmount: f.fuelCharge, source: 'rental', rentalId: rentalId(res) });
    if (fuel > 0) ops.push(mirror ? { op: 'update', list: 'expenses', id: mirror.id, patch: res => row(res) } : { op: 'create', list: 'expenses', fields: res => row(res) });
    else if (mirror) ops.push({ op: 'remove', list: 'expenses', id: mirror.id });
  }
  return { ops };
}

/* ---------- the generic parts ---------- */
export function formFor(id) { return FORMS[id] || null; }
export const formIdFor = (list, record) => (list === 'fuelAccount' ? (record && record.kind === 'opening' ? null : 'fuelTopup') : FORMS[list] ? list : null);
export const FORM_NEEDS = id => (FORMS[id] ? FORMS[id].needs : []);
export const ADD_BUTTONS = {
  vehicles: [{ label: 'Add vehicle', form: 'vehicles' }], drivers: [{ label: 'Add driver', form: 'drivers' }], clients: [{ label: 'Add client', form: 'clients' }], bookings: [{ label: 'Add booking', form: 'bookings' }],
  rentals: [{ label: 'Add rental', form: 'rentals' }], payments: [{ label: 'Add payment', form: 'payments' }], expenses: [{ label: 'Add expense', form: 'expenses' }],
  coop: [{ label: 'From a coop rental', form: 'coopFromRental' }, { label: 'Not yet in Rentals', form: 'coops' }],
  fuel: [{ label: 'Add fuel fill', form: 'expenses', preset: { category: 'Fuel' } }, { label: 'Add top-up', form: 'fuelTopup' }]
};
export const formTitle = (id, existing) => { const f = FORMS[id]; return f ? (existing ? 'Edit ' : 'New ') + f.noun : ''; };
export const newRecordDestination = request => {
  if (!request || request.record) return null;
  const form = FORMS[request.form];
  if (!form) return null;
  if (request.form === 'coops' || request.form === 'coopFromRental') return 'coop';
  if (request.form === 'fuelTopup' || (request.form === 'expenses' && request.preset && request.preset.category === 'Fuel')) return 'fuel';
  return form.list;
};

/* a rental's fuel line, or a fuel line that came from one, is changed on the rental */
export const editBlocked = (list, record) => (list === 'expenses' && record && record.source === 'rental' ? 'This fuel line was written by a rental. Change the fuel on the rental and this line follows.' : '');

export function choicesOf(formId, field, c, values = {}) {
  const f = FORMS[formId];
  if (field.key === 'category' && f.categories) return f.categories(c.data, values);
  return (f.choicesFor && f.choicesFor(field.key, { ...c, values })) || field.choices || [];
}

export function blankValues(formId, c) {
  const f = FORMS[formId], base = f.blank ? f.blank(c) : {}, out = {};
  f.fields.forEach(fl => { out[fl.key] = fl.type === 'bool' ? false : fl.type === 'pick' ? null : ''; });
  Object.assign(out, base, c.preset && c.preset.values ? c.preset.values : {});
  return out;
}
export function valuesFromRecord(formId, record, c) {
  const f = FORMS[formId], src = f.fromRecord(record), out = {};
  /* a rental's amount is only filled in when it differs from what the car's rate and the dates give (an agreed or imported figure), so saving a change never quietly re-prices it */
  if (formId === 'rentals' && c) { const car = byId(c.data.vehicles, record.vehicleId); if (car) { const calc = charge({ ...record, amount: 0 }, car).amount; src.amount = record.billMode === 'fixed' || Math.round(num(record.amount)) !== Math.round(calc) ? record.amount : ''; } }
  f.fields.forEach(fl => { const x = src[fl.key]; out[fl.key] = fl.type === 'bool' ? !!x : fl.type === 'pick' ? (x === '' || x === undefined ? null : x) : (x == null ? '' : String(x)); });
  return out;
}
export const visibleFields = (formId, values, c) => FORMS[formId].fields.filter(fl => !fl.show || fl.show(values, c));

/* a field changed: some forms fill other fields (picking a car fills its rate). Returns the new values. */
export function applyChange(formId, key, value, values, c, auto = {}) {
  const f = FORMS[formId], next = { ...values, [key]: value };
  if (f.onChange) {
    const more = f.onChange(key, next, { ...c, rateFromCar: auto.rate, amountFromRental: auto.amount, rentalAuto: auto.rental, paymentAmountFromLink: auto.paymentAmount });
    if (more) { for (const [k, v] of Object.entries(more)) { if (k === '__rateFromCar') auto.rate = true; else if (k === '__amountFromRental') auto.amount = true; else if (k === '__rentalAuto') auto.rental = true; else if (k === '__paymentAmountFromLink') auto.paymentAmount = true; else next[k] = v; } }
  }
  if (key === 'rate') auto.rate = false; if (key === 'amount') { auto.amount = false; auto.paymentAmount = false; }
  if (key === 'direction' || key === 'category') auto.paymentAmount = false;
  if (key === 'rentalId' && formId === 'expenses') auto.rental = false;
  return next;
}

/* the whole check: field by field (empty, number, date, time), then the form's own rules. Returns { errors, warnings, clean } with clean = the values as the record will hold them. */
export function checkForm(formId, values, c) {
  const f = FORMS[formId], errors = {}, clean = { ...values };
  for (const fl of visibleFields(formId, values, c)) {
    const raw = values[fl.key], text = typeof raw === 'string' ? raw.trim() : raw;
    const required = typeof fl.required === 'function' ? fl.required(values, c) : fl.required;
    const label = typeof fl.label === 'function' ? fl.label(values, c) : fl.label;
    if (fl.type === 'pick' || fl.type === 'bool') { if (required && (raw == null || raw === '')) errors[fl.key] = NEEDED; continue; }
    if (fl.type === 'choice') { if (required && (raw == null || raw === '')) errors[fl.key] = NEEDED; continue; }
    if (text === '' || text == null) { if (required && !(formId === 'rentals' && fl.key === 'clientId')) errors[fl.key] = NEEDED; continue; }
    if (fl.type === 'date') { const d = parseDate(text, c.today); if (!d) errors[fl.key] = `${label}: not a date I can read (try 10/11/2026)`; else clean[fl.key] = d; }
    else if (fl.type === 'time') { const t = parseTime(text); if (!t) errors[fl.key] = `${label}: not a time I can read (try 14:30)`; else clean[fl.key] = t; }
    else if (fl.type === 'money' || fl.type === 'number' || fl.type === 'int') { const n = parseMoney(text); if (Number.isNaN(n)) errors[fl.key] = `${label}: enter a number`; else if (fl.type === 'int' && !Number.isInteger(n)) errors[fl.key] = `${label}: a whole number`; }
  }
  const own = f.check ? f.check({ ...values, ...clean }, c) : { errors: {}, warnings: [] };
  Object.keys(own.errors).forEach(k => { if (!errors[k]) errors[k] = own.errors[k]; });
  return { errors, warnings: own.warnings, clean, ok: Object.keys(errors).length === 0 };
}

/* the plan of saves (ops for records.saveBatch). Call only after checkForm says ok. */
export function planSave(formId, values, c) { const check = checkForm(formId, values, c); return FORMS[formId].plan({ ...values, ...check.clean }, c); }

/* ---------- quick money actions from the Audit ---------- */
/* "Mark paid" on a sub-hire car or driver line: the status and its date, the same fields the desktop keeps */
export function markPaidPatch(kind, rental, date) {
  const r = { ...rental };
  if (kind === 'owner') { setOwnerStatus(r, 'paid', date); return { subhireStatus: r.subhireStatus, subhirePaid: r.subhirePaid, subhirePaidDate: r.subhirePaidDate }; }
  setDriverStatus(r, 'paid', date);
  return { driverStatus: r.driverStatus, driverStatusDate: r.driverStatusDate };
}

/* the month an existing record is dated in, when that is before this month: changing it asks first (the desktop asks for authorisation on earlier months) */
const DATE_KEY = { rentals: 'pickup', bookings: 'pickup', payments: 'date', expenses: 'date', fuelTopup: 'date' };
export function recordMonth(formId, record, today = todayISO()) {
  const d = record && record[DATE_KEY[formId]];
  if (!/^\d{4}-\d{2}/.test(String(d || ''))) return '';
  const ym = String(d).slice(0, 7);
  return ym < today.slice(0, 7) ? ym : '';
}
