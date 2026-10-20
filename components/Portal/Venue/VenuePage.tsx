import { useState } from 'react';
import { Building2, Plane, TrainFront, Car, Clock, Utensils, Landmark, ShoppingBag, ShieldPlus, Sun } from 'lucide-react';
import { CONGRESS_DAYS } from '../../../config/congressProgram';

/**
 * Venue & Hyderabad — where the Congress happens and how to get around the
 * city. Copy is held here for now; it is written so a CMS block
 * (site_content → 'venue') can replace it without touching the layout.
 */

const VENUE = {
  name: 'Hyderabad International Convention Centre (HICC)',
  hotel: 'Adjoining Novotel Hyderabad Convention Centre',
  address: 'Novotel & HICC Complex, Near Hitec City, Madhapur, Hyderabad 500081, Telangana, India',
};

const GETTING_THERE = [
  {
    icon: Plane,
    title: 'From the airport',
    body: 'Rajiv Gandhi International Airport (HYD), Shamshabad, is roughly 35 km away — about 45–70 minutes by road depending on traffic. Prepaid taxis and app cabs are available at arrivals.',
  },
  {
    icon: TrainFront,
    title: 'Metro',
    body: 'The Blue Line serves the HITEC City area; HITEC City and Durgam Cheruvu stations are the closest, a short auto-rickshaw ride from the venue.',
  },
  {
    icon: Car,
    title: 'Around the city',
    body: 'Ola and Uber operate throughout Hyderabad. Auto-rickshaws are plentiful for short hops — agree the fare or use the meter.',
  },
];

const CITY = [
  {
    id: 'see',
    label: 'See',
    icon: Landmark,
    items: [
      { name: 'Charminar', note: 'The 16th-century monument at the heart of the old city, surrounded by the bazaars.' },
      { name: 'Golconda Fort', note: 'Hilltop fortress with long views over the city; a sound-and-light show runs after sunset.' },
      { name: 'Chowmahalla Palace', note: 'Nizam-era palace complex, courtyards and the clock tower.' },
      { name: 'Salar Jung Museum', note: 'One of India’s largest single-collector museums, on the banks of the Musi.' },
      { name: 'Hussain Sagar & Necklace Road', note: 'Lakeside promenade for an early evening walk.' },
      { name: 'Ramoji Film City', note: 'A full-day excursion on the city’s eastern edge.' },
    ],
  },
  {
    id: 'eat',
    label: 'Eat',
    icon: Utensils,
    items: [
      { name: 'Hyderabadi biryani', note: 'The city’s signature dish. Paradise (Secunderabad) and Bawarchi are the best-known addresses.' },
      { name: 'South Indian breakfast', note: 'Dosa, idli and a table of chutneys — Chutneys in Banjara Hills is a reliable vegetarian choice.' },
      { name: 'Cafés near the venue', note: 'Jubilee Hills and HITEC City have plenty of quiet cafés for informal meetings.' },
      { name: 'Irani chai & Osmania biscuits', note: 'A Hyderabad institution — found in cafés across the old city.' },
    ],
  },
  {
    id: 'shop',
    label: 'Shop',
    icon: ShoppingBag,
    items: [
      { name: 'Laad Bazaar', note: 'Lacquer bangles and bridal wear in the lanes beside Charminar.' },
      { name: 'Pearls', note: 'Hyderabad has traded pearls for centuries; the shops near Charminar and Basheerbagh are the traditional spots.' },
    ],
  },
  {
    id: 'essentials',
    label: 'Essentials',
    icon: ShieldPlus,
    items: [
      { name: 'Currency', note: 'Indian Rupee (INR). Cards are widely accepted; carry some cash for autos and markets.' },
      { name: 'SIM cards', note: 'Available at the airport on arrival — bring your passport and visa.' },
      { name: 'Emergency', note: 'Dial 112 for all emergencies. Pharmacies in Madhapur include 24-hour branches.' },
      { name: 'Water', note: 'Drink bottled or filtered water.' },
    ],
  },
  {
    id: 'weather',
    label: 'Weather',
    icon: Sun,
    items: [
      { name: 'Late October', note: 'Typically warm and dry — around 30 °C in the afternoon, cooler in the evening. Light layers work well; session rooms are air-conditioned.' },
    ],
  },
];

export function VenuePage() {
  const [cat, setCat] = useState<string>('see');
  const active = CITY.find((c) => c.id === cat)!;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Venue &amp; Hyderabad</h1>
      <p className="mt-1 font-body text-sm text-gansid-on-surface/60">October 23–25, 2026</p>

      {/* Venue card */}
      <div className="mt-5 overflow-hidden rounded-gansid-lg bg-white shadow-[0_20px_44px_-24px_rgba(26,28,28,0.45)] ring-1 ring-black/[0.05]">
        <div className="relative bg-[linear-gradient(140deg,#2260a1_0%,#1a4880_55%,#8b2a5e_130%)] px-6 py-6 text-white">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" aria-hidden />
          <div className="relative flex items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold leading-tight">{VENUE.name}</h2>
              <p className="mt-1 font-body text-sm text-white/80">{VENUE.hotel}</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          <p className="font-body text-sm leading-relaxed text-gansid-on-surface/75 text-pretty">{VENUE.address}</p>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(VENUE.name + ', ' + VENUE.address)}`}
            target="_top"
            rel="noopener noreferrer"
            className="mt-4 inline-flex rounded-full bg-gansid-secondary/10 px-5 py-2.5 font-display text-sm font-bold text-gansid-secondary transition-transform duration-300 ease-viscous hover:scale-[1.02]"
          >
            Open in maps
          </a>
        </div>
      </div>

      {/* Registration desk hours */}
      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="h-4 w-1 rounded-full bg-gansid-primary-gradient" aria-hidden />
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-gansid-on-surface/50">On site</h2>
        </div>
        <div className="overflow-hidden rounded-gansid-md bg-white/85 ring-1 ring-black/[0.04] backdrop-blur-viscous">
          {CONGRESS_DAYS.map((d, i) => (
            <div
              key={d.day}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${i % 2 ? 'bg-gansid-on-surface/[0.02]' : ''}`}
            >
              <span className="min-w-0">
                <span className="block font-display text-sm font-semibold">{d.label}</span>
                <span className="block font-body text-xs text-gansid-on-surface/55">{d.date}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 font-body text-[13px] tabular-nums text-gansid-on-surface/70">
                <Clock className="h-3.5 w-3.5 text-gansid-on-surface/40" />
                {d.registrationDesk}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 font-body text-xs text-gansid-on-surface/45">
          Registration desk hours. Lunch and the interactive poster viewing session run in the exhibition hall each day.
        </p>
      </section>

      {/* Getting there */}
      <section className="mt-6 space-y-3">
        <div className="mb-1 flex items-center gap-2.5">
          <span className="h-4 w-1 rounded-full bg-gansid-primary-gradient" aria-hidden />
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-gansid-on-surface/50">Getting there</h2>
        </div>
        {GETTING_THERE.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex gap-3.5 rounded-gansid-md bg-white/85 p-4 shadow-[0_16px_36px_-28px_rgba(26,28,28,0.5)] ring-1 ring-black/[0.04] backdrop-blur-viscous"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gansid-primary-gradient text-white shadow-[0_10px_20px_-12px_rgba(186,0,40,0.8)]">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-[15px] font-bold tracking-tight">{title}</h3>
              <p className="mt-1 font-body text-[13px] leading-relaxed text-gansid-on-surface/65 text-pretty">{body}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Hyderabad guide */}
      <section className="mt-7">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="h-4 w-1 rounded-full bg-gansid-primary-gradient" aria-hidden />
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-gansid-on-surface/50">
            Hyderabad guide
          </h2>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {CITY.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={[
                'shrink-0 rounded-full px-4 py-2 font-display text-[13px] font-semibold transition-all duration-300 ease-viscous',
                cat === c.id
                  ? 'bg-gansid-primary-gradient text-white shadow-[0_12px_24px_-14px_rgba(186,0,40,0.8)]'
                  : 'bg-gansid-on-surface/[0.05] text-gansid-on-surface/70 hover:bg-gansid-on-surface/[0.08]',
              ].join(' ')}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2.5">
          {active.items.map((item) => (
            <div
              key={item.name}
              className="rounded-gansid-md bg-white/85 p-4 shadow-[0_16px_36px_-28px_rgba(26,28,28,0.5)] ring-1 ring-black/[0.04] backdrop-blur-viscous"
            >
              <h3 className="font-display text-[15px] font-bold tracking-tight">{item.name}</h3>
              <p className="mt-1 font-body text-[13px] leading-relaxed text-gansid-on-surface/65 text-pretty">{item.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
