'use strict';

const settings = {
  companyName: process.env.COMPANY_NAME || 'AXA Cleaning',
  companyEmail: process.env.COMPANY_EMAIL || '',
  phone: process.env.COMPANY_PHONE || '',
  serviceArea: process.env.SERVICE_AREA || '',
  currency: process.env.CURRENCY || 'USD',
  timezoneOffsetMinutes: Number(process.env.TZ_OFFSET_MINUTES || 0),
};

function setBusinessSettings(business) {
  Object.assign(settings, business);
}

module.exports = { settings, setBusinessSettings };
