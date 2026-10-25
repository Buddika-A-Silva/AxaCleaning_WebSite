'use strict';
const { uid, nowIso, today, addDays, weekday } = require('./util');
const { hashPassword, checkPasswordPolicy } = require('./auth');
const { isProductionEnvironment, validateProductionConfig } = require('./config');

const BUSINESS_DEFAULTS = {
  companyName: process.env.COMPANY_NAME || 'AXA Cleaning',
  companyEmail: process.env.COMPANY_EMAIL || '',
  phone: process.env.COMPANY_PHONE || '',
  serviceArea: process.env.SERVICE_AREA || '',
  serviceAreaScope: 'custom',
  serviceAreaDetails: process.env.SERVICE_AREA || '',
  currency: process.env.CURRENCY || 'LKR',
  timezoneOffsetMinutes: Number(process.env.TZ_OFFSET_MINUTES || 330),
};

const PACKAGES = [
  {
    id: 'pkg-essential', name: 'Essential Sparkle', nameRo: 'Strălucire esențială', category: 'Home', categoryRo: 'Locuință', tagline: 'A fresh, tidy home every visit', taglineRo: 'O locuință curată și ordonată la fiecare vizită',
    price: 79, durationHours: 2, agentsRequired: 1, icon: 'sparkle', color: '#22c3e6', popular: false, order: 1,
    features: ['Dusting of all reachable surfaces', 'Vacuum & mop all floors', 'Kitchen counters & sink', 'Bathroom wipe-down & toilet', 'Bins emptied'],
    excludes: ['Inside appliances', 'Windows', 'Laundry'],
    featuresRo: ['Ștergerea prafului de pe suprafețele accesibile', 'Aspirarea și spălarea tuturor podelelor', 'Blaturi și chiuvetă în bucătărie', 'Curățarea suprafețelor din baie și a toaletei', 'Golirea coșurilor de gunoi'],
    excludesRo: ['Interiorul electrocasnicelor', 'Ferestre', 'Rufe'],
  },
  {
    id: 'pkg-deep', name: 'Deep Clean Pro', nameRo: 'Curățenie generală Pro', category: 'Home', categoryRo: 'Locuință', tagline: 'Top-to-bottom reset for your whole home', taglineRo: 'Curățenie completă, dintr-un capăt în celălalt al locuinței',
    price: 189, durationHours: 5, agentsRequired: 2, icon: 'bubbles', color: '#6c5ce7', popular: true, order: 2,
    features: ['Everything in Essential', 'Inside oven & fridge', 'Skirting boards & door frames', 'Limescale removal', 'Interior windows', 'Cabinet fronts & handles'],
    excludes: ['Exterior windows'],
    featuresRo: ['Tot ce include pachetul Strălucire esențială', 'Curățarea interiorului cuptorului și frigiderului', 'Plinte și tocuri de uși', 'Îndepărtarea depunerilor de calcar', 'Ferestre la interior', 'Ușile și mânerele dulapurilor'],
    excludesRo: ['Ferestre la exterior'],
  },
  {
    id: 'pkg-move', name: 'Move In / Move Out', nameRo: 'Curățenie la mutare', category: 'Home', categoryRo: 'Locuință', tagline: 'Hand the keys back spotless', taglineRo: 'Predă cheile și lasă locuința impecabilă',
    price: 299, durationHours: 7, agentsRequired: 3, icon: 'box', color: '#ff7a59', popular: false, order: 3,
    features: ['Everything in Deep Clean', 'Inside all cupboards & drawers', 'Wall spot-cleaning', 'All appliances inside & out', 'Balcony / patio sweep', 'Landlord-ready checklist'],
    excludes: [],
    featuresRo: ['Tot ce include pachetul Curățenie generală', 'Interiorul tuturor dulapurilor și sertarelor', 'Curățarea petelor de pe pereți', 'Interiorul și exteriorul electrocasnicelor', 'Măturarea balconului sau terasei', 'Listă de verificare pentru predarea locuinței'],
    excludesRo: [],
  },
  {
    id: 'pkg-office', name: 'Office Pristine', nameRo: 'Birou impecabil', category: 'Commercial', categoryRo: 'Comercial', tagline: 'A healthier, sharper workplace', taglineRo: 'Un spațiu de lucru mai curat și mai plăcut',
    price: 249, durationHours: 4, agentsRequired: 2, icon: 'building', color: '#00b894', popular: false, order: 4,
    features: ['Desks, screens & phones sanitised', 'Meeting rooms reset', 'Kitchen & break areas', 'Restrooms deep-cleaned', 'Floors vacuumed & mopped', 'Waste & recycling'],
    excludes: ['Carpet shampoo'],
    featuresRo: ['Dezinfectarea birourilor, ecranelor și telefoanelor', 'Rearanjarea sălilor de ședință', 'Curățarea bucătăriei și a zonelor de relaxare', 'Curățarea în profunzime a toaletelor', 'Aspirarea și spălarea podelelor', 'Golirea coșurilor și colectarea reciclării'],
    excludesRo: ['Șamponarea covoarelor'],
  },
  {
    id: 'pkg-eco', name: 'Eco Green Clean', nameRo: 'Curățenie ecologică', category: 'Specialty', categoryRo: 'Specializat', tagline: '100% plant-based products, zero harsh chemicals', taglineRo: 'Produse 100% pe bază de plante, fără substanțe chimice agresive',
    price: 129, durationHours: 3, agentsRequired: 1, icon: 'leaf', color: '#2ecc71', popular: false, order: 5,
    features: ['Certified eco-friendly products', 'Microfibre-only cleaning', 'Pet & child safe', 'Kitchen & bathrooms', 'All floors'],
    excludes: ['Inside appliances'],
    featuresRo: ['Produse ecologice certificate', 'Curățare exclusiv cu lavete din microfibră', 'Sigur pentru copii și animale de companie', 'Curățarea bucătăriei și băilor', 'Curățarea tuturor podelelor'],
    excludesRo: ['Interiorul electrocasnicelor'],
  },
];

const EXTRAS = [
  { id: 'oven', name: 'Inside oven', nameRo: 'Interiorul cuptorului', price: 30 },
  { id: 'fridge', name: 'Inside fridge', nameRo: 'Interiorul frigiderului', price: 25 },
  { id: 'windows', name: 'Interior windows', nameRo: 'Ferestre la interior', price: 40 },
  { id: 'balcony', name: 'Balcony / patio', nameRo: 'Balcon sau terasă', price: 20 },
  { id: 'laundry', name: 'Laundry & ironing (1 load)', nameRo: 'Spălare și călcare (o tură)', price: 15 },
  { id: 'carpet', name: 'Carpet steam (per room)', nameRo: 'Curățare cu abur a covorului (per cameră)', price: 35 },
];

const AGENTS = [
  ['Nimali Perera', '#ff7a59', ['Deep clean', 'Kitchens']],
  ['Kasun Fernando', '#22c3e6', ['Office', 'Floors']],
  ['Ayesha Silva', '#6c5ce7', ['Move out', 'Windows']],
  ['Ruwan Jayasuriya', '#00b894', ['Office', 'Carpets']],
  ['Dilini Wickramasinghe', '#fdcb6e', ['Eco', 'Bathrooms']],
  ['Tharindu Bandara', '#e84393', ['Deep clean', 'Move out']],
];

let seeding;
function ensureSeeded(store) {
  return (seeding ||= doSeed(store).catch((e) => { seeding = null; throw e; }));
}

async function doSeed(store) {
  validateProductionConfig();
  if (!(await store.get('settings', 'business'))) {
    await store.put('settings', { id: 'business', ...BUSINESS_DEFAULTS });
  }
  const users = await store.list('users');
  if (users.length) return;
  if (!process.env.SEED_SUPERADMIN_PASSWORD) {
    throw new Error('Set SEED_SUPERADMIN_PASSWORD before initializing the user database.');
  }
  checkPasswordPolicy(process.env.SEED_SUPERADMIN_PASSWORD);
  if (isProductionEnvironment()
    && (process.env.SEED_SUPERADMIN_PASSWORD.length < 12
      || !/[A-Za-z]/.test(process.env.SEED_SUPERADMIN_PASSWORD)
      || !/\d/.test(process.env.SEED_SUPERADMIN_PASSWORD))) {
    throw new Error('SEED_SUPERADMIN_PASSWORD must be at least 12 characters and include letters and numbers.');
  }
  const at = nowIso();
  const mk = async (username, name, role, password, mustChangePassword, email) => {
    const { salt, hash } = hashPassword(password);
    const u = { id: uid('usr_'), username, name, email: email || '', role, salt, passwordHash: hash, active: true, mustChangePassword, tokenVersion: 0, createdAt: at, createdBy: 'system' };
    await store.put('users', u);
    return u;
  };
  const suPass = process.env.SEED_SUPERADMIN_PASSWORD;
  await mk(process.env.SEED_SUPERADMIN_USERNAME || 'superadmin', 'Super Administrator', 'superadmin', suPass, false, process.env.COMPANY_EMAIL);

  const demo = !isProductionEnvironment() && String(process.env.SEED_DEMO_DATA ?? 'true').toLowerCase() === 'true';
  if (!demo) return;

  if (!(await store.list('packages')).length) for (const p of PACKAGES) await store.put('packages', { ...p, active: true, createdAt: at });
  if (!(await store.get('settings', 'extras'))) await store.put('settings', { id: 'extras', items: EXTRAS });

  if (!(await store.list('agents')).length) {
    const t = today();
    let i = 0;
    for (const [name, color, skills] of AGENTS) {
      const leaves = i === 2 ? [{ date: addDays(t, 2), reason: 'Annual leave' }] : i === 4 ? [{ date: addDays(t, 4), reason: 'Training' }] : [];
      await store.put('agents', {
        id: uid('agt_'), name, color, skills, phone: `+94 77 ${String(1000000 + i * 137531).slice(0, 3)} ${String(4000 + i * 311)}`,
        email: name.split(' ')[0].toLowerCase() + '@axacleaning.com', workingDays: i === 3 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6],
        leaves, active: true, createdAt: at,
      });
      i++;
    }
  }

  if (demo && !(await store.list('bookings')).length) {
    const agents = await store.list('agents');
    const pk = (id) => PACKAGES.find((p) => p.id === id);
    let d = addDays(today(), 1);
    const next = () => { do { d = addDays(d, 1); } while (weekday(d) === 0); return d; };
    const demoBookings = [
      { p: 'pkg-deep', time: '09:00', status: 'accepted', agents: [0, 5], name: 'Sarah Johnson' },
      { p: 'pkg-essential', time: '14:00', status: 'pending', agents: [], name: 'Michael Chen' },
      { p: 'pkg-office', time: '08:00', status: 'accepted', agents: [1, 3], name: 'Brightline Studios' },
      { p: 'pkg-move', time: '09:00', status: 'pending', agents: [], name: 'Priya Raman' },
      { p: 'pkg-eco', time: '11:00', status: 'pending', agents: [], name: 'Lucas Weber' },
    ];
    for (const [n, b] of demoBookings.entries()) {
      const p = pk(b.p);
      const date = n % 2 === 0 ? next() : d;
      await store.put('bookings', {
        id: uid('bkg_'), ref: `AXA-DEMO${n + 1}`, packageId: p.id, packageName: p.name, price: p.price, extras: [],
        date, startTime: b.time, durationHours: p.durationHours, agentsRequired: p.agentsRequired,
        customer: { name: b.name, email: `demo${n + 1}@example.com`, phone: '+94 77 000 000' + n },
        address: { line1: `${12 + n} Palm Grove`, city: 'Colombo', postcode: '00300' }, propertyType: 'Apartment', bedrooms: 2, bathrooms: 1,
        notes: 'Demo booking', internalNotes: '', status: b.status, agentIds: b.agents.map((i) => agents[i].id), source: 'demo',
        history: [{ at, by: 'system', action: 'created', note: 'Demo data' }], email: null, createdAt: at, updatedAt: at,
      });
    }
  }
}

module.exports = { ensureSeeded, PACKAGES, EXTRAS, BUSINESS_DEFAULTS };
