import { parsePhoneNumber, AsYouType } from 'libphonenumber-js';
import { LeadData } from './store.js';

export interface WixSubmission {
  instanceId: string;
  submissionId: string;
  namespace: string;
  formName?: string;
  contactId?: string;
  contact?: {
    id?: string;
    name?: {
      first?: string;
      last?: string;
    };
    firstName?: string;
    lastName?: string;
    phones?: Array<{
      e164Phone?: string;
      phone?: string;
    }> | string[];
    emails?: string[];
    address?: {
      formatted?: string;
      formattedAddress?: string;
      addressLine?: string;
      streetAddress?: {
        name?: string;
        number?: string;
      };
      city?: string;
      subdivision?: string;
      subdivisions?: Array<{
        code?: string;
        name?: string;
      }>;
      country?: string;
      postalCode?: string;
    };
  };
  submissions?: Array<{
    id: string;
    formName?: string;
    value: Record<string, any>;
  }>;
  [key: string]: any;
}

export function toE164(phone: string, defaultCountry = 'US'): string {
  if (!phone) return '';

  try {
    // Remove any non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');

    // If it already starts with +, try to parse directly
    if (cleaned.startsWith('+')) {
      const parsed = parsePhoneNumber(cleaned);
      return parsed?.format('E.164') || '';
    }

    // Try parsing with default country
    const parsed = parsePhoneNumber(cleaned, defaultCountry as any);
    return parsed?.format('E.164') || '';
  } catch (error) {
    console.warn('Phone number parsing failed:', phone, error);
    return '';
  }
}

export function sanitizeNotes(text: string): string {
  if (!text) return '';

  const profanityReplacements: Record<string, string> = {
    'fuck': 'f***',
    'shit': 's***',
    'damn': 'd***',
    'hell': 'h***',
    'bitch': 'b****',
    'ass': 'a**',
    'crap': 'c***',
  };

  let sanitized = text;

  // Replace profanity (case insensitive)
  Object.entries(profanityReplacements).forEach(([word, replacement]) => {
    const regex = new RegExp(word, 'gi');
    sanitized = sanitized.replace(regex, replacement);
  });

  // Remove potential PII patterns
  sanitized = sanitized.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN-REMOVED]'); // SSN
  sanitized = sanitized.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD-REMOVED]'); // Credit card

  return sanitized.trim();
}

export function extractAddressComponents(wixData: WixSubmission): {
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  location: string;
} {
  const defaults = {
    address_line1: '',
    city: '',
    state: '',
    zip: '',
    location: ''
  };

  // Try structured contact address first (as per step2.md structure)
  if (wixData.contact?.address) {
    const addr = wixData.contact.address;

    // Try addressLine first (step2.md: contact.address.addressLine)
    if (addr.addressLine && !defaults.address_line1) {
      defaults.address_line1 = addr.addressLine;
    } else if (addr.streetAddress && !defaults.address_line1) {
      // Fallback to streetAddress structure
      const street = `${addr.streetAddress.number || ''} ${addr.streetAddress.name || ''}`.trim();
      defaults.address_line1 = street;
    } else if (addr.formatted && !defaults.address_line1) {
      // Extract first line from formatted address
      defaults.address_line1 = addr.formatted.split(',')[0] || '';
    } else if (addr.formattedAddress && !defaults.address_line1) {
      // Extract first line from formattedAddress
      defaults.address_line1 = addr.formattedAddress.split(',')[0] || '';
    }

    // Extract city (step2.md: contact.address.city)
    if (addr.city && !defaults.city) {
      defaults.city = addr.city;
    }

    // Extract state from subdivisions (step2.md: contact.address.subdivisions[0].code → "TX")
    if (addr.subdivisions && addr.subdivisions.length > 0 && !defaults.state) {
      defaults.state = addr.subdivisions[0].code || addr.subdivisions[0].name || '';
    } else if (addr.subdivision && !defaults.state) {
      defaults.state = addr.subdivision;
    }

    // Extract zip (step2.md: contact.address.postalCode)
    if (addr.postalCode && !defaults.zip) {
      defaults.zip = addr.postalCode;
    }
  }

  // Try direct form field address patterns (field:multi_line_address_xxxx, field:location)
  const addressFieldKeys = Object.keys(wixData).filter(key =>
    key.includes('address') || key.includes('location')
  );

  for (const key of addressFieldKeys) {
    const addressStr = String(wixData[key] || '').trim();
    if (addressStr) {
      if (key.includes('multi_line_address') && !defaults.address_line1) {
        // Parse "657 Luck Twin Lakes, CO 81251 US" format
        const parts = addressStr.split(',');
        defaults.address_line1 = parts[0]?.trim() || '';

        if (parts.length > 1) {
          const cityStateZip = parts[1]?.trim() || '';
          const match = cityStateZip.match(/^(.+)\s+([A-Z]{2})\s+(\d{5})(?:\s+[A-Z]{2})?$/);
          if (match) {
            defaults.city = match[1]?.trim() || '';
            defaults.state = match[2] || '';
            defaults.zip = match[3] || '';
          }
        }
      } else if (key.includes('location') && !defaults.location) {
        // Use direct location field like "Austin, TX"
        defaults.location = addressStr;

        // Extract city/state from location if not already set
        const locationMatch = addressStr.match(/^([^,]+),\s*([A-Z]{2})$/);
        if (locationMatch) {
          if (!defaults.city) defaults.city = locationMatch[1]?.trim() || '';
          if (!defaults.state) defaults.state = locationMatch[2] || '';
        }
      }
    }
  }

  // Fallback to form submissions
  const submissions = wixData.submissions || [];
  for (const submission of submissions) {
    const value = submission.value || {};

    // Look for address fields in form data
    Object.entries(value).forEach(([key, val]) => {
      const keyLower = key.toLowerCase();
      const valStr = String(val || '').trim();

      if (keyLower.includes('address') && keyLower.includes('line1') && !defaults.address_line1) {
        defaults.address_line1 = valStr;
      } else if (keyLower.includes('city') && !defaults.city) {
        defaults.city = valStr;
      } else if (keyLower.includes('state') && !defaults.state) {
        defaults.state = valStr;
      } else if ((keyLower.includes('zip') || keyLower.includes('postal')) && !defaults.zip) {
        defaults.zip = valStr;
      }
    });
  }

  // Generate location (step2.md shows "Dallas-Fort Worth" format)
  if (defaults.city && defaults.state) {
    // Special handling for metro areas - you might want to customize this logic
    if (defaults.city.toLowerCase().includes('dallas') || defaults.city.toLowerCase().includes('fort worth')) {
      defaults.location = 'Dallas-Fort Worth';
    } else {
      defaults.location = `${defaults.city}, ${defaults.state}`;
    }
  } else if (defaults.city) {
    defaults.location = defaults.city;
  } else if (defaults.state) {
    defaults.location = defaults.state;
  }

  return defaults;
}

export function extractNames(wixData: WixSubmission): {
  first_name: string;
  last_name: string;
  lead_full_name: string;
} {
  const defaults = {
    first_name: '',
    last_name: '',
    lead_full_name: ''
  };

  // Try form field mappings first (as per step2.md)
  const submissions = wixData.submissions || [];
  for (const submission of submissions) {
    const value = submission.value || {};

    Object.entries(value).forEach(([key, val]) => {
      const valStr = String(val || '').trim();

      // Match specific field patterns from step2.md
      if (key.startsWith('field:first_name_') && !defaults.first_name) {
        defaults.first_name = valStr;
      } else if (key.startsWith('field:last_name_') && !defaults.last_name) {
        defaults.last_name = valStr;
      }

      // Generic fallbacks
      const keyLower = key.toLowerCase();
      if (keyLower.includes('first') && keyLower.includes('name') && !defaults.first_name) {
        defaults.first_name = valStr;
      } else if (keyLower.includes('last') && keyLower.includes('name') && !defaults.last_name) {
        defaults.last_name = valStr;
      } else if (keyLower.includes('full') && keyLower.includes('name') && !defaults.lead_full_name) {
        defaults.lead_full_name = valStr;
      }
    });
  }

  // Fallback to structured contact data
  if (wixData.contact && (!defaults.first_name || !defaults.last_name)) {
    // Try contact.name.first and contact.name.last structure
    if (wixData.contact.name && typeof wixData.contact.name === 'object') {
      if (!defaults.first_name && wixData.contact.name.first) {
        defaults.first_name = wixData.contact.name.first;
      }
      if (!defaults.last_name && wixData.contact.name.last) {
        defaults.last_name = wixData.contact.name.last;
      }
    }

    // Try direct firstName/lastName fields
    if (!defaults.first_name && wixData.contact.firstName) {
      defaults.first_name = wixData.contact.firstName;
    }
    if (!defaults.last_name && wixData.contact.lastName) {
      defaults.last_name = wixData.contact.lastName;
    }

    // Parse full name if needed
    if (!defaults.first_name && !defaults.last_name && typeof wixData.contact.name === 'string') {
      const nameParts = wixData.contact.name.trim().split(/\s+/);
      defaults.first_name = nameParts[0] || '';
      defaults.last_name = nameParts.slice(1).join(' ') || '';
    }
  }

  // Generate full name if not present
  if (!defaults.lead_full_name && (defaults.first_name || defaults.last_name)) {
    defaults.lead_full_name = `${defaults.first_name} ${defaults.last_name}`.trim();
  }

  return defaults;
}

export function extractPhone(wixData: WixSubmission): string {
  // Try structured contact phones first
  if (wixData.contact?.phones && wixData.contact.phones.length > 0) {
    const phoneEntry = wixData.contact.phones[0];

    if (typeof phoneEntry === 'object' && phoneEntry.e164Phone) {
      // Use e164Phone directly if available
      return phoneEntry.e164Phone;
    } else if (typeof phoneEntry === 'object' && phoneEntry.phone) {
      // Convert phone field to E.164
      return toE164(phoneEntry.phone);
    } else if (typeof phoneEntry === 'string') {
      // Handle string phone entries
      return toE164(phoneEntry);
    }
  }

  // Try direct contact.phone field (as seen in real WIX data)
  if (wixData.contact?.phone) {
    return toE164(wixData.contact.phone);
  }

  // Try direct form field phone patterns (field:phone_xxxx format)
  const phoneFieldKeys = Object.keys(wixData).filter(key =>
    key.startsWith('field:phone') || key.includes('phone')
  );

  for (const key of phoneFieldKeys) {
    const phone = String(wixData[key] || '').trim();
    if (phone) {
      return toE164(phone);
    }
  }

  // Try form submissions (legacy fallback)
  const submissions = wixData.submissions || [];
  for (const submission of submissions) {
    const value = submission.value || {};

    for (const [key, val] of Object.entries(value)) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes('phone') || keyLower.includes('mobile') || keyLower.includes('cell')) {
        const phone = String(val || '').trim();
        if (phone) {
          return toE164(phone);
        }
      }
    }
  }

  return '';
}

export function extractNotes(wixData: WixSubmission): string {
  let notes: string[] = [];

  // Try direct form field notes patterns (field:notes)
  const notesFieldKeys = Object.keys(wixData).filter(key =>
    key.includes('notes') || key.includes('note') || key.includes('comment') ||
    key.includes('message') || key.includes('description')
  );

  for (const key of notesFieldKeys) {
    const noteStr = String(wixData[key] || '').trim();
    if (noteStr && !notes.includes(noteStr)) {
      notes.push(noteStr);
    }
  }

  // Fallback to form submissions
  const submissions = wixData.submissions || [];
  for (const submission of submissions) {
    const value = submission.value || {};

    Object.entries(value).forEach(([key, val]) => {
      const keyLower = key.toLowerCase();
      const valStr = String(val || '').trim();

      if (keyLower.includes('note') ||
          keyLower.includes('comment') ||
          keyLower.includes('message') ||
          keyLower.includes('description') ||
          keyLower.includes('details')) {
        if (valStr && !notes.includes(valStr)) {
          notes.push(valStr);
        }
      }
    });
  }

  return sanitizeNotes(notes.join(' | '));
}

export function extractRequestType(wixData: WixSubmission): string {
  // Try form name first
  if (wixData.formName) return wixData.formName;

  // Try submission form names
  const submissions = wixData.submissions || [];
  for (const submission of submissions) {
    if (submission.formName) return submission.formName;

    const value = submission.value || {};

    // Look for service/project type fields
    for (const [key, val] of Object.entries(value)) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes('service') ||
          keyLower.includes('project') ||
          keyLower.includes('type') ||
          keyLower.includes('category')) {
        const valStr = String(val || '').trim();
        if (valStr) return valStr;
      }
    }
  }

  return 'General Inquiry';
}

export function normalizeWixData(wixData: WixSubmission): LeadData {
  const names = extractNames(wixData);
  const address = extractAddressComponents(wixData);
  const phone = extractPhone(wixData);
  const notes = extractNotes(wixData);
  const requestType = extractRequestType(wixData);

  return {
    first_name: names.first_name,
    last_name: names.last_name,
    lead_full_name: names.lead_full_name,
    lead_phone: phone,
    address_line1: address.address_line1,
    city: address.city,
    state: address.state,
    zip: address.zip,
    notes: notes,
    request_type: requestType,
    location: address.location,
    source_site: 'wix_form',
    wix_submission_id: wixData.submissionId || '',
    wix_contact_id: wixData.contactId || wixData.contact?.id || ''
  };
}