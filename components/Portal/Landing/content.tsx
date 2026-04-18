export const HERO = {
  badge: 'Registration is open now!',
  location: 'Hyderabad, India',
  dates: 'October 23–25, 2026',
  venue: 'HITEX Exhibition Centre',
  intro: 'We are pleased to announce that registration for the GANSID Congress 2026 is now open. We invite you to join us from October 23–25, 2026 in the wonderful city of Hyderabad, India! This event is the first in-person Congress of the GANSID after the successes of our previous virtual conferences. We look forward to three days of knowledge-sharing, innovation, and ongoing advocacy with the brightest minds and organizations in the inherited blood disorders community worldwide.',
  ctaLabel: 'Register Now!',
};

export const REGISTRATION_PROCESS = [
  { number: '01', title: 'Account Setup', body: 'Create your user account to access the Congress portal and registration form.' },
  { number: '02', title: 'Details & Tier', body: 'Complete the registration form with your personal and professional details. Your tier is resolved by country.' },
  { number: '03', title: 'Finalize', body: 'Submit your payment details. Your information is not saved if you exit before completion — complete in one sitting.' },
];

export const IMPORTANT_NOTICE = 'Before you start completing the registration form, kindly ensure that you have readily available your relevant card, bank transfer, and billing details. Our system does not save your information if you exit the registration form before completion, so we recommend completing your registration in one sitting.';

export const GROUP_NOTE = 'Group Registration: Corporations and organizations may register 5 or more participants at a time. All registration information will be sent to the group contact person only, who will then be responsible for the distribution of information to each group member. No documentation will be sent directly to the group participants (unless specifically requested).';

export const INCLUDES = [
  'Full access to all scientific and educational sessions',
  'Entry to the exhibit hall during official hours',
  'Participation in poster networking sessions',
  'Access to supported symposia and presentation theatres',
  'Daily refreshments throughout the Congress',
  'Access to CME Credits',
];

export const NOT_INCLUDED = [
  'Access to the networking reception (requires an additional USD $50). The GANSID Networking Evening will take place separately from the GANSID Congress 2026. This event provides an opportunity for attendees to network with colleagues.',
];

export const FEES = {
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
};

export const FAQS = [
  { q: 'What happens if I need to cancel my registration?', a: 'Due to the administrative expenses to organize registration, we can provide a 50% refund on your registration fee if you cancel before September 23, 2026. There will be no refunds after this date.' },
  { q: 'Where can I find housing or accommodations for the Congress?', a: 'A list of hotels available in the area will be provided on the Congress portal as the event approaches.' },
  { q: 'Is there an option to attend virtually?', a: 'The GANSID Congress 2026 is an in-person event. There will be no virtual options this year.' },
  { q: 'Which meals will be provided by the conference?', a: 'The conference will provide lunch during all 3 days of the conference alongside coffee, tea, and other refreshments. An optional Networking Reception dinner will be held, with a ticket price of $50 USD.' },
];

export const SUPPORT_EMAIL = 'congress@inheritedblooddisorders.world';
