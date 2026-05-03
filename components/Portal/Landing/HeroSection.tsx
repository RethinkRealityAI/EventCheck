import { HERO } from './content';

export function HeroSection() {
  return (
    <div className="space-y-6">
      <div>
        <span className="inline-block px-7 py-3 rounded-full bg-gansid-primary-gradient text-white text-base md:text-lg font-display font-bold tracking-wider shadow-xl text-center leading-tight">
          ✨ {HERO.badge}
        </span>
      </div>

      <div>
        <p className="font-display text-base uppercase tracking-[0.25em] text-gansid-secondary font-semibold mb-3">
          GANSID Congress 2026
        </p>
        <h1 className="font-display text-6xl md:text-7xl font-bold leading-[1.05] tracking-tight">
          <span className="bg-gansid-gradient-reverse bg-clip-text text-transparent">
            {HERO.location}
          </span>
        </h1>
      </div>

      <p className="font-display text-2xl text-gansid-secondary font-semibold">
        {HERO.dates} · {HERO.venue}
      </p>
      <p className="font-body text-gansid-on-surface/80 text-xl leading-relaxed max-w-xl">
        {HERO.intro}
      </p>
    </div>
  );
}
