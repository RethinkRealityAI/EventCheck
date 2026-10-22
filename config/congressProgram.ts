/**
 * 4th International GANSID Congress — full programme.
 *
 * Transcribed from the official Congress programme PDF, revision of
 * October 19, 2026 (October 23–25, 2026, HICC / Novotel, Hyderabad). This is the data source for the interactive
 * programme and the "build your own schedule" feature. The embedded programme
 * link in the menu (gc2026.framer.website/program) stays as it is — this is the
 * in-app, bookmarkable version.
 *
 * Oral abstract presenters and titles come from the Oral Abstract Presentation
 * programme, with changes agreed afterwards: Dr. Gayatri Desai (Day 3
 * Room 6) and Prosanto Kumar Chowdhury (Day 1 Local Trainees, 11:05) were
 * removed, and Dr. Naresh Tayade and Parag Sagar swapped slots (Parag: Day 1
 * Room 6 10:28; Naresh: Day 3 Room 6 11:58).
 *
 * Times are local (IST) 24-hour strings so they sort and compare cleanly.
 */

export type SessionKind =
  | 'ceremony'
  | 'plenary'
  | 'parallel'
  | 'abstracts'
  | 'industry'
  | 'patient'
  | 'break'
  | 'social'
  | 'logistics';

/** One oral abstract within an abstract session, from the oral abstract programme. */
export interface AbstractTalk {
  /** 24h local time, e.g. "10:14" */
  start: string;
  end: string;
  /** Presenters as printed, same format as `speakers`. */
  presenters: string[];
  title: string;
}

export interface ProgramSession {
  id: string;
  day: 1 | 2 | 3;
  /** 24h local time, e.g. "08:35" */
  start: string;
  end: string;
  title: string;
  kind: SessionKind;
  /** Room as printed in the programme, e.g. "Hall 1", "Room 5", "Exhibition". */
  room: string;
  /** Optional stream label when several sessions run in parallel. */
  stream?: string;
  /** Individual talks within the session, in running order. */
  talks?: string[];
  /** Oral abstracts with their slot and presenter(s), in running order. */
  abstracts?: AbstractTalk[];
  speakers?: string[];
  moderator?: string;
  chair?: string;
  /** Sponsor-led sessions carry the supporter's name. */
  sponsor?: string;
  /**
   * Optional topic override for the speaker directory filters. When absent,
   * topics are derived from keywords (utils/congressDirectory.ts TOPICS).
   */
  topics?: string[];
  /** Breaks and logistics rows cannot be added to My Schedule. */
  bookmarkable?: boolean;
}

export interface CongressDay {
  day: 1 | 2 | 3;
  label: string;
  short: string;
  date: string;
  registrationDesk: string;
  /** End-of-day Congress evaluation survey. */
  evaluationUrl: string;
}

export const CONGRESS_DAYS: CongressDay[] = [
  { day: 1, label: 'Day One', short: 'Fri 23', date: 'Friday, October 23, 2026', registrationDesk: '07:00 – 17:30', evaluationUrl: 'https://www.surveymonkey.com/r/Congress2026Day1' },
  { day: 2, label: 'Day Two', short: 'Sat 24', date: 'Saturday, October 24, 2026', registrationDesk: '07:00 – 18:30', evaluationUrl: 'https://www.surveymonkey.com/r/Congress2026Day2' },
  { day: 3, label: 'Day Three', short: 'Sun 25', date: 'Sunday, October 25, 2026', registrationDesk: '07:00 – 16:00', evaluationUrl: 'https://www.surveymonkey.com/r/Congress2026Day3' },
];

export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  ceremony: 'Ceremony',
  plenary: 'Plenary',
  parallel: 'Parallel',
  abstracts: 'Abstracts',
  industry: 'Industry',
  patient: 'Patient engagement',
  break: 'Break',
  social: 'Social',
  logistics: 'Logistics',
};

export const CONGRESS_PROGRAM: ProgramSession[] = [
  // ── Day One — Friday, October 23, 2026 ───────────────────────────────────
  {
    id: 'd1-opening',
    day: 1,
    start: '08:00',
    end: '08:30',
    title: 'Official Opening & Welcome Ceremony',
    kind: 'ceremony',
    room: 'Hall 1',
    speakers: [
      'Congress Leadership / Invited Dignitaries',
      'Ms. Lanre Tunji-Ajayi — GANSID CEO',
      'Ms. Vinita Srivastava — NHA, India',
      'Dr. Dipty Jain — Congress Co-Chair',
      'Dr. Jameela Sathar — Congress Co-Chair',
    ],
    bookmarkable: true,
  },
  {
    id: 'd1-plenary-1',
    day: 1,
    start: '08:35',
    end: '09:35',
    title: 'Updates in Non-Factor Therapies in Hemophilia',
    kind: 'plenary',
    room: 'Hall 1',
    talks: [
      'Balancing Bleeding & Clotting: Thrombosis Risk in Evolving Hemophilia Treatment',
      'Innovations in Hemophilia: From Rebalancing Agents to Gene Therapy',
    ],
    speakers: [
      'Dr. Alok Srivastava (India)',
      'Dr. Johnny Mahlangu (South Africa)',
    ],
    moderator: 'Dr. Sandhya Vaddadi (India)',
    bookmarkable: true,
  },
  {
    id: 'd1-coffee-1',
    day: 1,
    start: '09:40',
    end: '10:00',
    title: 'Coffee Break / Networking',
    kind: 'break',
    room: 'Exhibition',
  },
  {
    id: 'd1-abs-hall1',
    day: 1,
    start: '10:00',
    end: '11:00',
    title: 'Abstract Presentations — Hall 1',
    kind: 'abstracts',
    room: 'Hall 1',
    speakers: [
      'Dr. Kalpita Gawit',
      'Dr. Judith Lubega',
      'Dr. Yee Yee Yap',
      'Mohana Reddy',
    ],
    abstracts: [
      { start: '10:00', end: '10:12', presenters: ['Dr. Kalpita Gawit'], title: 'Characterisation of Sickle β-Thalassemia Cohort: A Study on Clinical Burden, Haematological, and Molecular Variability from Central India' },
      { start: '10:14', end: '10:26', presenters: ['Dr. Judith Lubega'], title: 'Prevalence and Factors Associated with Iron Deficiency Among Under-Five Children with Sickle Cell Anaemia at Mulago Hospital Sickle Cell Clinic, Uganda: A Cross-Sectional Study' },
      { start: '10:28', end: '10:40', presenters: ['Dr. Yee Yee Yap'], title: 'Bloodless Care in Thalassaemia Major' },
      { start: '10:42', end: '10:54', presenters: ['Mohana Reddy'], title: 'Outcomes of Matched and Haploidentical Hematopoietic Stem Cell Transplantation for Sickle Cell Disease in a Resource-Limited Setting' },
    ],
    moderator: 'Dr. Deepika Darbari (USA)',
    bookmarkable: true,
  },
  {
    id: 'd1-abs-hall2',
    day: 1,
    start: '10:00',
    end: '11:00',
    title: 'Abstract Presentations — Hall 2',
    kind: 'abstracts',
    room: 'Hall 2',
    speakers: [
      'Dr. Akshay Khandeparkar',
      'Dr. Sayali Chandrashekhar Tiwari',
      'Dr. Padma Gunda (India)',
      'Yazdi Italia',
    ],
    abstracts: [
      { start: '10:00', end: '10:12', presenters: ['Dr. Akshay Khandeparkar'], title: 'Phase 1/2 HIBISCUS KIDS Study of Etavopivat in Pediatric Patients with Sickle Cell Disease: Safety and Efficacy Findings from the Complete First Cohort' },
      { start: '10:14', end: '10:26', presenters: ['Dr. Sayali Chandrashekhar Tiwari'], title: 'National Sickle Cell Anaemia Elimination Mission 2047: Preparedness, Challenges, and Way Forward – A Qualitative Perspective' },
      { start: '10:28', end: '10:40', presenters: ['Dr. Padma Gunda (India)'], title: 'Uncovering Hidden Carriers: Findings from Extended Family Screening for Hemoglobinopathies' },
      { start: '10:42', end: '10:54', presenters: ['Yazdi Italia'], title: 'Integrating IVF with Preimplantation Genetic Diagnosis into National Hemoglobinopathy Prevention Programs' },
    ],
    moderator: 'Mr. Prabhat Sinha (India)',
    bookmarkable: true,
  },
  {
    id: 'd1-abs-room6',
    day: 1,
    start: '10:00',
    end: '11:00',
    title: 'Abstract Presentations — Room 6',
    kind: 'abstracts',
    room: 'Room 6',
    speakers: [
      'Dorothy Carolyne Mabunde',
      'Mohana Reddy',
      'Parag Sagar',
      'Norafiza binti Mohd Yasin',
    ],
    abstracts: [
      { start: '10:00', end: '10:12', presenters: ['Dorothy Carolyne Mabunde'], title: 'A Revolving Fund Pharmacy Model to Improve Access to Essential Medicines for People Living with Sickle Cell in Rural Kenya' },
      { start: '10:14', end: '10:26', presenters: ['Mohana Reddy'], title: 'Can Targeted Antenatal Screening for Hemoglobinopathies Be Scaled in Public Health Systems? Evidence from a Multi-State Program in India' },
      { start: '10:28', end: '10:40', presenters: ['Parag Sagar'], title: 'Social Innovation through Policy: Scaling Sickle Cell Disease Elimination in Tribal India' },
      { start: '10:42', end: '10:54', presenters: ['Norafiza binti Mohd Yasin'], title: 'Evidence of Telomere Healing in Human Chromosome 16p13.3 Terminal Deletions Associated with α-Thalassaemia' },
    ],
    moderator: 'Mr. Delaney Hines (Canada)',
    bookmarkable: true,
  },
  {
    id: 'd1-trainees',
    day: 1,
    start: '11:05',
    end: '12:05',
    title: 'Local Trainees and Fellows’ Abstract Presentations',
    kind: 'abstracts',
    room: 'Room 6',
    speakers: [
      'Bhavna Jain',
      'Dr. Devesh Raicha',
      'Naidu Tejaswini',
    ],
    abstracts: [
      { start: '11:19', end: '11:31', presenters: ['Bhavna Jain'], title: 'A Rare Adult Diagnosis of Sickle Cell Disease Following Newborn Screening: A Case Report' },
      { start: '11:33', end: '11:45', presenters: ['Dr. Devesh Raicha'], title: 'Beyond Haemoglobin Polymerization: Mapping the Therapeutic Potential of SYK Signalling Modulation in Sickle Cell Disease' },
      { start: '11:47', end: '11:59', presenters: ['Naidu Tejaswini'], title: 'Iron Status among Patients with Sickle Cell Anaemia in India: A Systematic Review of Evidence Published from 2023–2025' },
    ],
    moderator: 'Ms. Anubha Taneja (India)',
    bookmarkable: true,
  },
  {
    id: 'd1-mentorship',
    day: 1,
    start: '11:05',
    end: '12:05',
    title: 'GANSID Mentorship Program',
    kind: 'parallel',
    room: 'Hall 1',
    talks: [
      'Two Years of Advancing Clinician Capacity Building',
      'Reflections from a GANSID Mentor & Mentee',
    ],
    speakers: [
      'Prof. Prantar Chakrabarti (India)',
      'Dr. Shabnam Arsiwala (USA)',
    ],
    moderator: 'Dr. Jennifer Bryan (Canada)',
    bookmarkable: true,
  },
  {
    id: 'd1-thrombosis',
    day: 1,
    start: '11:05',
    end: '12:05',
    title: 'Advances in Thrombosis Management: From Anticoagulation to Emerging Targeted Therapies',
    kind: 'parallel',
    room: 'Room 5',
    talks: [
      'Current anticoagulation strategies and clinical challenges (including real-world implementation and special populations)',
      'Emerging targeted therapies (e.g., factor XI/XIa inhibitors, novel pathways)',
    ],
    speakers: [
      'Dr. Jameela Sathar (Malaysia)',
      'Dr. Vasiliki Danilatou (Cyprus)',
    ],
    moderator: 'Dr. Len Valentino (USA)',
    bookmarkable: true,
  },
  {
    id: 'd1-lunch',
    day: 1,
    start: '12:05',
    end: '13:30',
    title: 'Lunch / Exhibition Hall — Interactive Poster Viewing Session',
    kind: 'break',
    room: 'Exhibition',
  },
  {
    id: 'd1-plenary-2',
    day: 1,
    start: '13:30',
    end: '14:30',
    title: 'Aging Well with Thalassemia: Navigating the Transition from Pediatric to Adult & Geriatric Care',
    kind: 'plenary',
    room: 'Hall 2',
    talks: [
      'Efficacy & Safety of Novel Agents in Thalassemia Treatment',
      'Bridging Gaps in Transitioning Thalassemia Programs — Pediatric to Adult & Geriatric Care',
      'Healthy Transitions Across the Lifespan: What Patients Need to Know',
    ],
    speakers: [
      'Dr. Shruti Kakkar (India)',
      'Dr. Nita Radhakrishnan (India)',
      'Mr. Carl Lander (UK)',
    ],
    moderator: 'Dr. Mandy Yap (Malaysia)',
    bookmarkable: true,
  },
  {
    id: 'd1-g6pd',
    day: 1,
    start: '14:35',
    end: '15:35',
    title: 'Glucose-6-Phosphate Dehydrogenase Deficiency: Advances in Screening, Diagnosis, and Risk Stratification',
    kind: 'parallel',
    room: 'Room 6',
    talks: [
      'Drug-Induced Haemolysis in G6PD Deficiency',
    ],
    speakers: [
      'Dr. Jacob Pendergrast (Canada)',
      'Dr. Yaddanapudi Ravindranath (USA)',
    ],
    moderator: 'Dr. Jennifer Bryan (Canada)',
    bookmarkable: true,
  },
  {
    id: 'd1-hht',
    day: 1,
    start: '14:35',
    end: '15:35',
    title: 'Hereditary Hemorrhagic Telangiectasia: Advances in Diagnosis, Management, and Systemic Therapies',
    kind: 'parallel',
    room: 'Room 5',
    talks: [
      'Diagnosis and Multidisciplinary Management of HHT: Current Evidence and Global Standards',
    ],
    speakers: [
      'Dr. Raj Kasthuri (USA)',
    ],
    moderator: 'Dr. Mandy Yap (Malaysia)',
    chair: 'Dr. Udayakumar (India)',
    bookmarkable: true,
  },
  {
    id: 'd1-patient',
    day: 1,
    start: '14:35',
    end: '15:35',
    title: 'Patient Engagement Session: Understanding Health Risks in Hemoglobinopathies and Bleeding Disorders Trait',
    kind: 'patient',
    room: 'Hall 1',
    talks: [
      'Genetic Counselling and Family Planning in Hemoglobinopathy Traits',
      'Health Risks and Clinical Implications of Sickle Cell Trait',
      'Patient Organizations\' Role in Reducing Unplanned Bleeding Disorders Births',
    ],
    speakers: [
      'Dr. Catherine Chunda-Liyoka (Zambia)',
      'Dr. Dipty Jain (India)',
      'Ms. Andrea Trinidad (Philippines)',
    ],
    moderator: 'Dr. Samuel Mbunya (Kenya)',
    bookmarkable: true,
  },
  {
    id: 'd1-coffee-2',
    day: 1,
    start: '15:35',
    end: '15:55',
    title: 'Coffee Break / Networking',
    kind: 'break',
    room: 'Exhibition',
  },
  {
    id: 'd1-plenary-3',
    day: 1,
    start: '16:00',
    end: '17:00',
    title: 'Blood Health is Bone Health',
    kind: 'plenary',
    room: 'Hall 2',
    talks: [
      'Blood Health in Inherited Blood Disorders',
      'Osteoporosis — A Neglected Consequence of Blood Disorders',
    ],
    speakers: [
      'Dr. Jameela Sathar (Malaysia)',
      'Dr. Lynn Azura (Malaysia)',
    ],
    moderator: 'Dr. Johnny Mahlangu (South Africa)',
    bookmarkable: true,
  },
  {
    id: 'd1-ancillary-pfizer',
    day: 1,
    start: '18:00',
    end: '20:30',
    title: 'Ancillary Meeting: Pfizer Inc.',
    kind: 'industry',
    room: 'Room 4',
    sponsor: 'Pfizer Inc.',
    bookmarkable: true,
  },
  {
    id: 'd1-ancillary-novo',
    day: 1,
    start: '18:00',
    end: '20:30',
    title: 'Ancillary Meeting: Novo Nordisk Inc. — HCP Meeting | PAG Meeting',
    kind: 'industry',
    room: 'Room 6',
    sponsor: 'Novo Nordisk Inc.',
    bookmarkable: true,
  },

  // ── Day Two — Saturday, October 24, 2026 ─────────────────────────────────
  {
    id: 'd2-iron',
    day: 2,
    start: '08:00',
    end: '09:00',
    title: 'Comprehensive Approaches to Iron Overload Prevention in Thalassemia',
    kind: 'parallel',
    room: 'Hall 1',
    talks: [
      'Clinical Impact of Ineffective Erythropoiesis & Anemia',
      'Stepwise Laboratory Evaluation of Thalassemia',
      'Iron Toxicity in Thalassemia: Key Concepts in Iron Overload Management',
    ],
    speakers: [
      'Dr. Mandy Yap (Malaysia)',
      'Dr. Sitalakshmi Subramanian (India)',
      'Dr. Varun Bafna (India)',
    ],
    moderator: 'Dr. Suman Jain (India)',
    bookmarkable: true,
  },
  {
    id: 'd2-spherocytosis',
    day: 2,
    start: '08:00',
    end: '09:00',
    title: 'Diagnostic Pitfalls in Mild and Atypical Hereditary Spherocytosis & Red Cell Membrane Disorder',
    kind: 'parallel',
    room: 'Room 5',
    talks: [
      'Modern Diagnostic Approaches to Hereditary Spherocytosis and Overlapping Membrane Disorders',
      'Atypical and Mild Presentations of Red Cell Membrane Disorders: Avoiding Misdiagnosis in Clinical Practice',
    ],
    speakers: [
      'Dr. Theodosia Kalfa (USA)',
      'Dr. Reena Das (India)',
    ],
    moderator: 'Dr. Dipty Jain (India)',
    bookmarkable: true,
  },
  {
    id: 'd2-legal',
    day: 2,
    start: '08:00',
    end: '08:30',
    title: 'Legal Issues in Medical Practice — Current Perspectives',
    kind: 'parallel',
    room: 'Room 6',
    speakers: [
      'Dr. Heena Tabassum (India)',
    ],
    moderator: 'Dr. Akshat Jain (USA)',
    bookmarkable: true,
  },
  {
    id: 'd2-africa-cdc',
    day: 2,
    start: '08:35',
    end: '09:00',
    title: 'Africa CDC Continental Plan on Sickle Cell Disease and Other Inherited Blood Disorders',
    kind: 'parallel',
    room: 'Room 6',
    speakers: [
      'Dr. Abdulaziz Mohammed',
    ],
    moderator: 'Dr. Akshat Jain (USA)',
    bookmarkable: true,
  },
  {
    id: 'd2-plenary-1',
    day: 2,
    start: '09:05',
    end: '10:05',
    title: 'Comprehensive Management of Pregnancy in Sickle Cell Disease: Therapeutic Strategies & Maternal–Fetal Outcomes',
    kind: 'plenary',
    room: 'Hall 2',
    talks: [
      'Hydroxyurea, Transfusion & Beyond: Treatment Decisions in Pregnancy with SCD',
      'Pregnancy in SCD: Optimizing Maternal & Fetal Outcomes',
    ],
    speakers: [
      'Dr. Fenella Kirkham (UK)',
      'Dr. Eugene Oteng-Ntim (UK)',
    ],
    moderator: 'Dr. Biree Andemariam (USA)',
    bookmarkable: true,
  },
  {
    id: 'd2-coffee-1',
    day: 2,
    start: '10:05',
    end: '10:25',
    title: 'Coffee Break / Networking',
    kind: 'break',
    room: 'Exhibition',
  },
  {
    id: 'd2-abs-hall1',
    day: 2,
    start: '10:25',
    end: '11:30',
    title: 'Abstract Presentations — Hall 1',
    kind: 'abstracts',
    room: 'Hall 1',
    speakers: [
      'Dr. Neelesh Jain',
      'Dr. Vasiliki Danilatou (Cyprus)',
      'Surbhi Meshram',
      'Darshi Vyas',
      'Prof. Obiageli Nnodu',
    ],
    abstracts: [
      { start: '10:25', end: '10:37', presenters: ['Dr. Neelesh Jain'], title: 'Automated Red Blood Cell Exchange (Erythrocytapheresis) in Sickle Cell Anaemia: A Four-Year Retrospective Observational Study from a Tertiary Centre in Chhattisgarh, India' },
      { start: '10:38', end: '10:50', presenters: ['Dr. Vasiliki Danilatou (Cyprus)'], title: 'Global Disparities in Clinical Trial Capacity: Insights from a Comparative Survey of HICs and LMICs' },
      { start: '10:51', end: '11:03', presenters: ['Surbhi Meshram'], title: 'Screening without Rights: Auditing the Implementation Architecture of India\'s National Sickle Cell Elimination Mission Against Health Equity Standards' },
      { start: '11:04', end: '11:16', presenters: ['Darshi Vyas'], title: 'Is There an Increased Laterality Towards the Left Hip in Sickle Cell Disease Patients With Avascular Necrosis of Hip?' },
      { start: '11:17', end: '11:29', presenters: ['Prof. Obiageli Nnodu'], title: 'SPARC-TRAIN: Building Multidisciplinary Capacity for Sickle Cell Disease Research and Management Across West Africa' },
    ],
    moderator: 'Mr. Delaney Hines (Canada)',
    bookmarkable: true,
  },
  {
    id: 'd2-abs-hall2',
    day: 2,
    start: '10:25',
    end: '11:30',
    title: 'Abstract Presentations — Hall 2',
    kind: 'abstracts',
    room: 'Hall 2',
    speakers: [
      'Dr. Abu Yousuf Md Nazim Uddin',
      'Dr. Aditi Kamdar',
      'Tarun Sahu',
      'K. Jothi',
      'Dr. Meera Varadarajan',
    ],
    abstracts: [
      { start: '10:25', end: '10:37', presenters: ['Dr. Abu Yousuf Md Nazim Uddin'], title: 'Optimizing Transfusion Stewardship in Inherited Blood Disorders: Rational Use of Blood Products in Thalassemia and Sickle Cell Disease from Two Tertiary Hospitals and a Regional Blood Center in Bangladesh' },
      { start: '10:38', end: '10:50', presenters: ['Dr. Aditi Kamdar'], title: 'The Clot Thickens: Recurrent Pulmonary Embolism in a Patient with Sickle Cell Disease and Acute Chest Syndrome' },
      { start: '10:51', end: '11:03', presenters: ['Tarun Sahu'], title: 'Neurocognitive Benefits of Slow Deep Breathing Exercise in Adult Homozygous Sickle Cell Disease Patients' },
      { start: '11:04', end: '11:16', presenters: ['K. Jothi'], title: 'DKMS Access to Transplantation (ATT) Program: Giving Hope for a Healthy Future' },
      { start: '11:17', end: '11:29', presenters: ['Dr. Meera Varadarajan'], title: 'Efficacy and Safety of Oral Tetrahydrouridine-Decitabine (NDEC) in Adults with Sickle Cell Disease: Results from the Phase 2, Global, Randomized, Parallel-Group ASCENT1 Trial' },
    ],
    moderator: 'Dr. K.K. Radhika (India)',
    bookmarkable: true,
  },
  {
    id: 'd2-abs-room6',
    day: 2,
    start: '10:25',
    end: '11:30',
    title: 'Abstract Presentations — Room 6',
    kind: 'abstracts',
    room: 'Room 6',
    speakers: [
      'Dr. Jacob Pendergrast (Canada)',
      'Kshitij Suryawanshi',
      'Kapilkumar Dave',
      'Sreyali Poojari',
      'Dr. Moussa Aden Oubeche',
    ],
    abstracts: [
      { start: '10:25', end: '10:37', presenters: ['Dr. Jacob Pendergrast (Canada)'], title: 'Understanding the Educational and Support Needs of Individuals With Sickle Cell Disease to Improve Hydroxyurea Use and Daily Medication Routines (Canada)' },
      { start: '10:38', end: '10:50', presenters: ['Kshitij Suryawanshi'], title: 'Multidimensional Psychosocial Burden in Indian Adults with Sickle Cell Disease: A Pragmatic Hybrid Tele-Research Study Using ASCQ-Me and WHOQOL-BREF' },
      { start: '10:51', end: '11:03', presenters: ['Kapilkumar Dave'], title: 'Integrating Sickle Cell Screening into Primary Health Centre Immunization Platforms: Evidence from a Tribal Pilot in Gujarat, India' },
      { start: '11:04', end: '11:16', presenters: ['Sreyali Poojari'], title: 'Analytical Performance Evaluation of the Gazelle™ Ferritin FIA Point-of-Care Test Compared with a Reference' },
      { start: '11:17', end: '11:29', presenters: ['Dr. Moussa Aden Oubeche'], title: 'Minor Surgery under Emicizumab (Hemlibra) in Patients with Hemophilia A: Experience from the Pediatric Hematology-Oncology Department of Rabat (SHOP)' },
    ],
    moderator: 'Dr. Len Valentino (USA)',
    bookmarkable: true,
  },
  {
    id: 'd2-industry-novo',
    day: 2,
    start: '11:35',
    end: '12:35',
    title: 'Industry Symposia: Novo Nordisk',
    kind: 'industry',
    room: 'Hall 2',
    sponsor: 'Novo Nordisk',
    speakers: [
      'Industry Speakers',
    ],
    moderator: 'Novo Nordisk',
    bookmarkable: true,
  },
  {
    id: 'd2-trials',
    day: 2,
    start: '11:35',
    end: '12:35',
    title: 'Inclusive Clinical Trials for Global Impact: The Role of GANSID in Driving Change',
    kind: 'parallel',
    room: 'Room 5',
    talks: [
      'Designing Inclusive Clinical Trials in Rare Hematological Disorders: From Eligibility Criteria to Real-World Representation',
      'Global Equity in Hematology Trials: Bridging Gaps in Access, Participation, and Impact',
    ],
    speakers: [
      'Dr. Fenella Kirkham (UK)',
      'Dr. Catherine Chunda-Liyoka (Zambia)',
    ],
    moderator: 'Dr. Vasiliki Danilatou (Cyprus)',
    bookmarkable: true,
  },
  {
    id: 'd2-vwd',
    day: 2,
    start: '11:35',
    end: '12:35',
    title: 'Von Willebrand Disease in the 21st Century',
    kind: 'parallel',
    room: 'Room 6',
    talks: [
      'VWD: The Global Challenge',
      'Integrating Molecular Science with Clinical Care',
    ],
    speakers: [
      'Dr. Len Valentino (USA)',
      'Dr. Sitalakshmi Subramanian (India)',
    ],
    moderator: 'Dr. Jameela Sathar (Malaysia)',
    bookmarkable: true,
  },
  {
    id: 'd2-lunch',
    day: 2,
    start: '12:40',
    end: '14:00',
    title: 'Lunch / Exhibition Hall — Interactive Poster Viewing Session',
    kind: 'break',
    room: 'Exhibition',
  },
  {
    id: 'd2-plenary-2',
    day: 2,
    start: '14:00',
    end: '15:15',
    title: 'Addressing Pain in Inherited Blood Disorders: From Acute Crises to Chronic Care',
    kind: 'plenary',
    room: 'Hall 1',
    talks: [
      'Beyond Opioids: Modern Pharmacological Management of Chronic Pain',
      'Rethinking Pain Care: Non-Pharmacological Interventions in SCD',
      'Understanding the Lived Experience of Pain in Bleeding Disorder',
    ],
    speakers: [
      'Dr. Tulika Seth (India)',
      'Dr. Deepika Darbari (USA)',
      'Mr. Prem Alva (India)',
    ],
    moderator: 'Dr. Baba Inusa (UK)',
    bookmarkable: true,
  },
  {
    id: 'd2-hsct',
    day: 2,
    start: '15:20',
    end: '16:20',
    title: 'Hematopoietic Stem Cell Transplantation in Aplastic Anemia',
    kind: 'parallel',
    room: 'Room 6',
    talks: [
      'HSCT in Aplastic Anemia: Patient Selection, Timing & Outcomes',
      'Evolving Indications & Outcomes in Aplastic Transplantation',
    ],
    speakers: [
      'Dr. K.K. Radhika (India)',
      'Dr. Akshat Jain (USA)',
    ],
    moderator: 'Dr. Deepa Anantha Laxmi N.V (India)',
    bookmarkable: true,
  },
  {
    id: 'd2-pipeline',
    day: 2,
    start: '15:20',
    end: '16:20',
    title: 'Pipeline Therapies for Inherited Blood Disorders',
    kind: 'parallel',
    room: 'Room 5',
    talks: [
      'Pipeline Therapies: What Is the Need?',
      'Investigational Therapies for SCD & Thalassemia',
      'Investigational Therapies for Inherited Bleeding Disorders',
    ],
    speakers: [
      'Dr. Biree Andemariam (USA)',
      'Dr. Miguel Abboud (Lebanon)',
      'Dr. Tulika Seth (India)',
    ],
    moderator: 'Dr. Biree Andemariam (USA)',
    bookmarkable: true,
  },
  {
    id: 'd2-patient',
    day: 2,
    start: '15:20',
    end: '16:20',
    title: 'Patient-Driven Session: Expanding Access to Innovative & Curative Therapies in Inherited Blood Disorders (IBDs) within the WHO Universal Health Care Framework',
    kind: 'patient',
    room: 'Hall 2',
    talks: [
      'Patient Experiences with Innovative and Curative Therapies Across Health Systems',
      'From Advocacy to Policy: Leveraging the WHO Universal Health Care Framework to Drive Equitable Access for Sickle Cell Communities',
      'Building Comprehensive Thalassemia Care Within National Health Systems',
      'Inherited Blood Disorder Programs That Work: A Bahrain Experience',
    ],
    speakers: [
      'Mr. Carl Lander (UK)',
      'Mr. Lalit Pargi (India)',
      'Ms. Anubha Taneja (India)',
      'Mr. Zakareya Ebrahim Alkadem (Bahrain)',
    ],
    moderator: 'Dr. Len Valentino (USA)',
    bookmarkable: true,
  },
  {
    id: 'd2-coffee-2',
    day: 2,
    start: '16:25',
    end: '16:45',
    title: 'Coffee Break / Networking',
    kind: 'break',
    room: 'Exhibition',
  },
  {
    id: 'd2-plenary-3',
    day: 2,
    start: '16:50',
    end: '17:50',
    title: 'One Data Platform, Many Voices: Co-Creating a Global Registry for Sickle Cell Disease',
    kind: 'plenary',
    room: 'Hall 1',
    talks: [
      'Update on the GANSID SCD Global Registry',
      'The Indian Experience in Setting up a SCD Registry',
      'Real-Life Challenges in Establishing an SCD Registry',
    ],
    speakers: [
      'Prof. Adekunle Adekile (Nigeria)',
      'Dr. Bhupesh Jain (India)',
      'Dr. Catherine Chunda-Liyoka (Zambia)',
    ],
    moderator: 'Dr. Jennifer Bryan (Canada)',
    bookmarkable: true,
  },
  {
    id: 'd2-reception',
    day: 2,
    start: '18:30',
    end: '20:00',
    title: 'Networking Reception',
    kind: 'social',
    room: 'Halls 1 & 2',
    bookmarkable: true,
  },

  // ── Day Three — Sunday, October 25, 2026 ─────────────────────────────────
  {
    id: 'd3-thrombocytopenia',
    day: 3,
    start: '08:00',
    end: '09:00',
    title: 'Redefining Diagnosis & Management in Inherited Thrombocytopenia',
    kind: 'parallel',
    room: 'Room 6',
    talks: [
      'Recognizing Inherited Thrombocytopenia: Diagnosis, Clinical Clues & First-Line Lab Tests',
      'Management Essentials: When to Treat, When to Refer & Avoiding Common Pitfalls',
    ],
    speakers: [
      'Dr. Varun Bafna (India)',
      'Dr. K.K. Radhika (India)',
    ],
    moderator: 'Dr. Shabnam Arsiwala (USA)',
    bookmarkable: true,
  },
  {
    id: 'd3-inflammation',
    day: 3,
    start: '08:00',
    end: '09:00',
    title: 'Inflammation & Complement Activation: Mechanistic Drivers of Disease Severity in SCD',
    kind: 'parallel',
    room: 'Hall 1',
    talks: [
      'Inflammation & Complement in SCD: Drivers of Vaso-Occlusion & Organ Damage',
      'Genetic Modifiers of the SCD Phenotype',
    ],
    speakers: [
      'Dr. Baba Inusa (UK)',
      'Prof. Adekunle Adekile (Nigeria)',
    ],
    moderator: 'Dr. Tulika Seth (India)',
    bookmarkable: true,
  },
  {
    id: 'd3-disparities',
    day: 3,
    start: '08:00',
    end: '09:00',
    title: 'Disparities in Access to Lifelong Care for Thalassemia: A Global Lens',
    kind: 'parallel',
    room: 'Room 5',
    talks: [
      'Bridging Gaps in Access to Diagnosis, Transfusion & Treatment Across High- & Low-Resource Settings',
      'Resolving System-Level Barriers to Continuity of Care',
    ],
    speakers: [
      'Dr. Deepa Anantha Laxmi N.V (India)',
      'Dr. Ravindra Kumar (India)',
    ],
    moderator: 'Dr. Saroja K. (India)',
    bookmarkable: true,
  },
  {
    id: 'd3-plenary-ai',
    day: 3,
    start: '09:05',
    end: '10:05',
    title: 'Integrating Artificial Intelligence into Clinical Practice: Opportunities & Challenges in Inherited Blood Disorders Care',
    kind: 'plenary',
    room: 'Hall 2',
    talks: [
      'Can AI Improve Clinical Care in Inherited Blood Disorders? From Diagnosis to Decision-Making',
      'Can We Trust AI in Rare Hematology? Ethical Challenges in Inherited Blood Disorders',
    ],
    speakers: [
      'Prof. Prantar Chakrabarti (India)',
      'Dr. Vasiliki Danilatou (Cyprus)',
    ],
    moderator: 'Dr. Vasiliki Danilatou (Cyprus)',
    chair: 'Dr. Bodapati Sridhar (India)',
    bookmarkable: true,
  },
  {
    id: 'd3-coffee-1',
    day: 3,
    start: '10:05',
    end: '10:25',
    title: 'Coffee Break / Networking',
    kind: 'break',
    room: 'Exhibition',
  },
  {
    id: 'd3-abs-hall1',
    day: 3,
    start: '10:25',
    end: '11:25',
    title: 'Abstract Presentations — Hall 1',
    kind: 'abstracts',
    room: 'Hall 1',
    speakers: [
      'Mohana Reddy',
      'Dr. Jennifer Bryan (Canada)',
      'Dr. Saroja Kondaveeti',
      'Javed Islam Thachorath',
    ],
    abstracts: [
      { start: '10:25', end: '10:37', presenters: ['Mohana Reddy'], title: 'Sickle-Only Screening Misses 40% of Hemoglobinopathy Burden: Evidence from Large-Scale Antenatal Screening in India' },
      { start: '10:39', end: '10:51', presenters: ['Dr. Jennifer Bryan (Canada)'], title: 'A Five-Year Initiative to Improve the Quality of Emergency Department Care of People Living with Sickle Cell Disease' },
      { start: '10:53', end: '11:05', presenters: ['Dr. Saroja Kondaveeti'], title: 'Antenatal Screening for Thalassemia and Sickle Cell Disease in Telangana: A Scalable Model for Prevention of Hemoglobinopathies' },
      { start: '11:07', end: '11:19', presenters: ['Javed Islam Thachorath'], title: 'Decoding FOXO3 and NRF2 Gene Expression in the Redox Regulatory Gene Network of Sickle Cell Disease from an Indian Cohort' },
    ],
    moderator: 'Dr. Jacob Pendergrast (Canada)',
    bookmarkable: true,
  },
  {
    id: 'd3-abs-hall2',
    day: 3,
    start: '10:25',
    end: '11:25',
    title: 'Abstract Presentations — Hall 2',
    kind: 'abstracts',
    room: 'Hall 2',
    speakers: [
      'Prashant Warang',
      'Moji Ogunsanya',
      'Ms. Lanre Tunji-Ajayi',
      'Vivek Gunda',
      'Norafiza binti Mohd Yasin',
    ],
    abstracts: [
      { start: '10:25', end: '10:37', presenters: ['Prashant Warang'], title: 'Redox Proteomics Reveals Oxidative PMCA Dysfunction and Therapeutic Targets in Sickle Cell Disease' },
      { start: '10:39', end: '10:51', presenters: ['Moji Ogunsanya', 'Ms. Lanre Tunji-Ajayi'], title: 'Insights into the Hospital Experiences of Patients and Caregivers Affected by Sickle Cell Disease in Ontario, Canada' },
      { start: '10:53', end: '11:05', presenters: ['Vivek Gunda'], title: 'Automated Red Cell Exchange Combined with Therapeutic Plasma Exchange in Sickle Cell Crisis with Severe Hepatopathy: A Case Report' },
      { start: '11:07', end: '11:19', presenters: ['Norafiza binti Mohd Yasin'], title: 'Fourth-Generation Sequencing: Evaluation of Single-Base Nanopore Sequencing (SNS) Technology for Comprehensive Detection of Complex α- and β-Thalassaemia Variants' },
    ],
    moderator: 'Dr. Len Valentino (USA)',
    bookmarkable: true,
  },
  {
    id: 'd3-abs-room6',
    day: 3,
    start: '10:25',
    end: '11:25',
    title: 'Abstract Presentations — Room 6',
    kind: 'abstracts',
    room: 'Room 6',
    speakers: [
      'Madhu Gopalakrishnan',
      'Constance Tenge',
      'Mohana Reddy',
    ],
    abstracts: [
      { start: '10:39', end: '10:51', presenters: ['Madhu Gopalakrishnan'], title: 'Buccal Swab Sampling for Point-of-Care Molecular Confirmation of Sickle Cell Disease: A Pilot Pathway from India' },
      { start: '10:53', end: '11:05', presenters: ['Constance Tenge'], title: 'Health Care Services for Persons Living with Sickle Cell Disease in Western Kenya – Gaps and Opportunities' },
      { start: '11:07', end: '11:19', presenters: ['Mohana Reddy'], title: 'Technology-Enabled Longitudinal Care for Sickle Cell Disease: Operationalising Hydroxyurea Monitoring and Dose Optimisation in Resource-Limited Settings' },
    ],
    moderator: 'Dr. Padma Gunda (India)',
    bookmarkable: true,
  },
  {
    id: 'd3-trainees',
    day: 3,
    start: '11:30',
    end: '12:30',
    title: 'Local Trainees and Fellows’ Abstract Presentations',
    kind: 'abstracts',
    room: 'Room 6',
    speakers: [
      'Aniket Prabhudesai',
      'Dr. Sneha Mukherjee',
      'Dr. Naresh Tayade',
      'Mary Niharika Gali',
    ],
    abstracts: [
      { start: '11:30', end: '11:42', presenters: ['Aniket Prabhudesai'], title: 'Validation of the Hi-PCR® Sickle Cell Genotyping Probe PCR Kit (MBPCR286): An Affordable Open-System IVD Solution for Confirmatory Diagnostics' },
      { start: '11:44', end: '11:56', presenters: ['Dr. Sneha Mukherjee'], title: 'The Role of Immature Platelet Fraction in Etiological Differentiation of Thrombocytopenia in Children with Sickle Cell Disease — A Hospital-Based Cross-Sectional Study' },
      { start: '11:58', end: '12:10', presenters: ['Dr. Naresh Tayade'], title: 'Clinicodiagnostic Profile of Sickle Cell Anemia and Sickle β-Thalassemia: A Comparative Study' },
      { start: '12:12', end: '12:24', presenters: ['Mary Niharika Gali'], title: 'Personalized Longitudinal Physiological and Haemoglobin-Linked Monitoring Between Blood Tests Using Wearable PPG in Transfusion-Dependent Thalassaemia' },
    ],
    moderator: 'Dr. Shabnam Arsiwala (USA)',
    bookmarkable: true,
  },
  {
    id: 'd3-blood-safety',
    day: 3,
    start: '11:30',
    end: '12:30',
    title: 'Clinical & Operational Challenges in Blood Safety: Balancing Demand, Supply & Patient Outcomes',
    kind: 'parallel',
    room: 'Hall 1',
    talks: [
      'Hemovigilance & Transfusion Safety: From Adverse Event Reporting to Quality Improvement',
      'Blood Supply Shortfalls in Low- and Middle-Income Countries: Structural Barriers & Pragmatic Solutions',
    ],
    speakers: [
      'Dr. Manisha Shivastava (India)',
      'Dr. Jacob Pendergrast (Canada)',
    ],
    moderator: 'Ms. Vinita Srivastava (India)',
    chair: 'Dr. Yizdi Italia (India)',
    bookmarkable: true,
  },
  {
    id: 'd3-pkd',
    day: 3,
    start: '11:30',
    end: '12:30',
    title: 'Targeted Therapy in Pyruvate Kinase Deficiency (PKD): PK Activators & Beyond',
    kind: 'parallel',
    room: 'Room 5',
    talks: [
      'Genetic therapies in PKD: the platinum standard, but even rarer.',
      'PK activators, their function, and impact',
    ],
    speakers: [
      'Dr. Yaddanapudi Ravindranath (USA)',
      'Mr. Carl Lander (UK)',
    ],
    moderator: 'Mr. Carl Lander (UK)',
    bookmarkable: true,
  },
  {
    id: 'd3-lunch',
    day: 3,
    start: '12:35',
    end: '13:35',
    title: 'Lunch / Exhibition Hall — Interactive Poster Viewing Session',
    kind: 'break',
    room: 'Exhibition',
  },
  {
    id: 'd3-plenary-cardio',
    day: 3,
    start: '13:35',
    end: '14:35',
    title: 'Cardiopulmonary & Renal Complications in Sickle Cell Disease',
    kind: 'plenary',
    room: 'Hall 2',
    talks: [
      'Renal Screening: Early Detection & Management Strategies',
      'Pulmonary Hypertension & Recognition & Management of Acute Chest Syndrome in SCD',
    ],
    speakers: [
      'Prof. Prantar Chakrabarti (India)',
      'Dr. Elizabeth Klings (USA)',
    ],
    moderator: 'Dr. Baba Inusa (UK)',
    bookmarkable: true,
  },
  {
    id: 'd3-bmf',
    day: 3,
    start: '14:40',
    end: '15:40',
    title: 'Bone Marrow Failure Syndromes: From Molecular Pathogenesis to Curative Strategies',
    kind: 'parallel',
    room: 'Room 5',
    talks: [
      'Key Molecular Mechanisms Underlying Bone Marrow Failure Syndromes',
      'From Diagnosis to Cure: Management & Curative Options Including Transplant & Emerging Therapies',
    ],
    speakers: [
      'Dr. Joseph M. John (India)',
      'Dr. Miguel Abboud (Lebanon)',
    ],
    moderator: 'Dr. K.K. Radhika (India)',
    chair: 'Dr. Ganesh Jaishetwar (India)',
    bookmarkable: true,
  },
  {
    id: 'd3-toxicities',
    day: 3,
    start: '14:40',
    end: '15:40',
    title: 'Emerging & Long-Term Toxicities of Gene & Cell Therapies: What Clinicians Need to Know',
    kind: 'parallel',
    room: 'Hall 1',
    talks: [
      'Early & Delayed Toxicities: Identifying, Monitoring & Managing Adverse Effects',
      'Safety, Surveillance & Risk Mitigation: Long-Term Follow-Up & Registries',
    ],
    speakers: [
      'Dr. Akshat Jain (USA)',
      'Dr. Daima Bukini (Tanzania)',
    ],
    moderator: 'Dr. Jameela Sathar (Malaysia)',
    bookmarkable: true,
  },
  {
    id: 'd3-patient',
    day: 3,
    start: '14:40',
    end: '15:40',
    title: 'Patient Engagement: Advancing Social Justice & Human Rights in Inherited Blood Disorders: Addressing Work, Disability & Social Participation',
    kind: 'patient',
    room: 'Hall 2',
    talks: [
      'From Policy to Impact: Building Centres of Competence and Comprehensive Rehabilitation for Inherited Blood Disorders.',
      'Social Justice Framework: Rights, Recognition, and Representation in IBD',
      'Beyond the Disease: Social Participation, Community Belonging, and Quality of Life in IBD Communities',
    ],
    speakers: [
      'Ms. Vinita Srivastava (India)',
      'Mr. Kareem Karassery (India)',
      'Mr. Delaney Hines (Canada)',
    ],
    moderator: 'Dr. Mary Ampomah (Ghana)',
    bookmarkable: true,
  },
  {
    id: 'd3-close',
    day: 3,
    start: '15:45',
    end: '16:00',
    title: 'Coffee & Networking',
    kind: 'break',
    room: 'Exhibition',
  },
];

/** "08:35" → "8:35 AM" */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${suffix}`;
}

export function sessionById(id: string): ProgramSession | undefined {
  return CONGRESS_PROGRAM.find((s) => s.id === id);
}

/** Sessions for a day, in running order. */
export function sessionsForDay(day: 1 | 2 | 3): ProgramSession[] {
  return CONGRESS_PROGRAM.filter((s) => s.day === day).sort((a, b) => a.start.localeCompare(b.start));
}

/** True when two bookmarked sessions overlap in time on the same day. */
export function overlaps(a: ProgramSession, b: ProgramSession): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

/** ISO date for each congress day, used for calendar export. */
export const DAY_DATE: Record<1 | 2 | 3, string> = {
  1: '2026-10-23',
  2: '2026-10-24',
  3: '2026-10-25',
};
