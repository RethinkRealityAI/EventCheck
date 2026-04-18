import { HERO } from './content';

export function HeroSection() {
  return (
    <div className="space-y-6">
      <img
        src="/branding/gansid/portal-hero.jpg"
        alt=""
        className="w-full rounded-gansid-lg object-cover aspect-[4/3] shadow-invisible-lift"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div>
        <span className="inline-block px-4 py-2 rounded-full bg-gansid-primary-gradient text-white text-sm font-display">
          {HERO.badge}
        </span>
      </div>
      <h1 className="font-display text-5xl md:text-6xl font-bold text-gansid-on-surface leading-tight tracking-tight">
        {HERO.location}
      </h1>
      <p className="font-display text-xl text-gansid-secondary">
        {HERO.dates} • {HERO.venue}
      </p>
      <p className="font-body text-gansid-on-surface/80 text-lg leading-relaxed max-w-xl">
        {HERO.intro}
      </p>
    </div>
  );
}
