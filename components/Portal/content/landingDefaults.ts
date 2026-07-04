import type { LandingContent, PortalContent } from '../../../types';

// ---------------------------------------------------------------------------
// LANDING_DEFAULTS — verbatim transcription of the copy currently hardcoded in
// components/Portal/Landing/content.tsx (HERO, REGISTRATION_PROCESS,
// IMPORTANT_NOTICE, GROUP_NOTE, INCLUDES, NOT_INCLUDED, FEES, FAQS,
// SUPPORT_EMAIL). This is the typed CMS "factory default" — later phases will
// seed a DB row from this object and refactor content.tsx's consumers to read
// from the CMS instead. Do NOT edit the copy here without also updating
// content.tsx (until the refactor removes content.tsx entirely).
// ---------------------------------------------------------------------------

export const LANDING_DEFAULTS: LandingContent = {
  hero: {
    // 'GANSID Congress 2026' is hardcoded in HeroSection.tsx (not content.tsx) —
    // captured here so the eyebrow is CMS-editable going forward.
    eyebrow: 'GANSID Congress 2026',
    badge: 'REGISTER ONE, GET ONE FREE!',
    location: 'Hyderabad, India',
    dates: 'October 23–25, 2026',
    venue: 'HICC - Novotel',
    introHtml: '<p>We are pleased to announce that registration for the GANSID Congress 2026 is now open. We invite you to join us from October 23–25, 2026 in the wonderful city of Hyderabad, India! This event is the first in-person Congress of the GANSID after the successes of our previous virtual conferences. We look forward to three days of knowledge-sharing, innovation, and ongoing advocacy with the brightest minds and organizations in the inherited blood disorders community worldwide.</p>',
    ctaLabel: 'Register Now!',
    imageUrl: null,
  },

  registrationProcess: [
    {
      id: 'step1',
      number: '01',
      title: 'Account Setup',
      bodyHtml: '<p>Create your user account to access the Congress portal and registration form.</p>',
    },
    {
      id: 'step2',
      number: '02',
      title: 'Details & Tier',
      bodyHtml: '<p>Complete the registration form with your personal and professional details. Your tier is resolved by country.</p>',
    },
    {
      id: 'step3',
      number: '03',
      title: 'Finalize',
      bodyHtml: '<p>Submit your payment. We accept PayPal and all major credit cards. Your progress is saved as you go — feel free to start, save, and return to complete your registration at any time.</p>',
    },
  ],

  importantNoticeHtml: '<p>Before beginning the registration form, please ensure that your payment details and billing information are readily available. We accept PayPal and all major credit cards. If you do not yet have a PayPal account, we recommend creating one — it allows you to connect whichever bank account or card of your choice. PayPal is also our recommended fallback if you experience any difficulties with a direct credit card payment. Your registration progress is saved automatically, so you can start, pause, and return to complete your registration at any time.</p>',

  groupNoteHtml: '<p>Group Registration: The person who purchases the tickets will receive all of them. If they provide the name and email address for each person they are registering, those individuals will also receive their own ticket along with a link to complete any remaining personal details for their own registration. The main group registrant will always receive every ticket as a backup.</p>',

  includes: [
    'Full access to all scientific and educational sessions',
    'Entry to the exhibit hall during official hours',
    'Participation in poster networking sessions',
    'Access to supported symposia and presentation theatres',
    'Daily refreshments throughout the Congress',
    'Access to CME Credits',
  ],

  notIncluded: [
    'Access to the networking reception (requires an additional USD $50). The GANSID Networking Evening will take place separately from the GANSID Congress 2026. This event provides an opportunity for attendees to network with colleagues.',
  ],

  faqs: [
    {
      id: 'faq1',
      question: 'What happens if I need to cancel my registration?',
      answerHtml: '<p>Due to the administrative expenses to organize registration, we can provide a 50% refund on your registration fee if you cancel before September 23, 2026. There will be no refunds after this date.</p>',
    },
    {
      id: 'faq2',
      question: 'Where can I find housing or accommodations for the Congress?',
      answerHtml: '<p>A list of hotels available in the area will be provided on the Congress portal as the event approaches.</p>',
    },
    {
      id: 'faq3',
      question: 'Is there an option to attend virtually?',
      answerHtml: '<p>The GANSID Congress 2026 is an in-person event. There will be no virtual options this year.</p>',
    },
    {
      id: 'faq4',
      question: 'Which meals will be provided by the conference?',
      answerHtml: '<p>The conference will provide lunch during all 3 days of the conference alongside coffee, tea, and other refreshments. An optional Networking Reception dinner will be held, with a ticket price of $50 USD.</p>',
    },
  ],

  supportEmail: 'congress@inheritedblooddisorders.world',

  fees: {
    note: 'All prices are in USD; you will be able to pay with your local currency.',
    periods: [
      { id: 'early', label: 'Early Bird', subtitle: 'Ends June 30, 2026' },
      { id: 'regular', label: 'Regular', subtitle: 'July 1 – September 15, 2026' },
      { id: 'onsite', label: 'On-site', subtitle: 'September 16 – October 25, 2026' },
    ],
    tiers: [
      {
        id: 'tier1',
        label: 'Tier 1',
        subtitle: 'Asia, Africa, South America, Central America, Mexico',
        rows: [
          { category: 'Physicians / Researchers', early: 175, regular: 200, onsite: 250 },
          { category: 'Medical Trainees (Residents, Fellows)', early: 150, regular: 175, onsite: 200 },
          { category: 'Undergraduate, Medical, Graduate Students', early: 50, regular: 75, onsite: 100 },
          { category: 'Nurses or Allied Health Professionals', early: 100, regular: 125, onsite: 150 },
          { category: 'Industry Partners', early: 250, regular: 300, onsite: 350 },
          { category: 'Patient Organizations', early: 50, regular: 75, onsite: 100 },
          { category: 'Patients or Family Members', early: 25, regular: 40, onsite: 50 },
        ],
      },
      {
        id: 'tier2',
        label: 'Tier 2',
        subtitle: 'United States, Canada, Europe, Australia, New Zealand',
        rows: [
          { category: 'Physicians / Researchers', early: 250, regular: 300, onsite: 400 },
          { category: 'Medical Trainees (Residents, Fellows)', early: 200, regular: 250, onsite: 275 },
          { category: 'Undergraduate, Medical, Graduate Students', early: 75, regular: 100, onsite: 125 },
          { category: 'Nurses or Allied Health Professionals', early: 150, regular: 200, onsite: 250 },
          { category: 'Industry Partners', early: 300, regular: 350, onsite: 450 },
          { category: 'Patient Organizations', early: 75, regular: 100, onsite: 125 },
          { category: 'Patients or Family Members', early: 35, regular: 50, onsite: 60 },
        ],
      },
    ],
  },

  pricingPromo: {
    enabled: false,
    label: 'Early Bird',
    colorPreset: 'save-green',
    promoPeriodId: 'early',
    comparePeriodId: 'regular',
    categories: 'all',
    endDate: null,
    showCountdown: false,
  },
};

// ---------------------------------------------------------------------------
// PORTAL_DEFAULTS — verbatim transcription of QuickLinks.tsx's current
// EXTERNAL_LINKS + SOON_LINKS arrays.
// ---------------------------------------------------------------------------

export const PORTAL_DEFAULTS: PortalContent = {
  intro: {
    heading: 'Welcome',
    subheadingHtml: '',
  },
  sidebarLinks: [
    {
      id: 'congress-home',
      label: 'Congress Home',
      description: 'Return to the main Congress page',
      icon: '🌐',
      mode: 'link',
      href: 'https://inheritedblooddisorders.world/congress-2026/',
    },
    {
      id: 'full-itinerary',
      label: 'Full Itinerary',
      icon: '📅',
      mode: 'soon',
    },
    {
      id: 'congress-materials',
      label: 'Congress Materials',
      icon: '📁',
      mode: 'soon',
    },
    {
      id: 'venue-info',
      label: 'Venue Info',
      icon: '📍',
      mode: 'soon',
    },
  ],
};
