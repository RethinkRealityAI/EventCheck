import { HERO } from './content';

export function HeroSection() {
  return (
    <div className="space-y-6">
      {/* Gradient hero block — no external image required */}
      <div className="relative w-full aspect-[4/3] rounded-gansid-lg overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-gansid-gradient-135" />
        <div className="absolute inset-0 bg-gansid-gradient-swirl opacity-40 mix-blend-overlay" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.35),transparent_50%)]" />
        <div className="absolute bottom-6 left-6 right-6 text-white">
          <div className="inline-block px-3 py-1 bg-white/20 backdrop-blur rounded-full text-xs font-display uppercase tracking-widest mb-3">
            Hyderabad · India
          </div>
          <div className="font-display text-3xl font-bold drop-shadow-lg">GANSID Congress 2026</div>
        </div>
        {/* Optional background image overlay — shown if the file exists, hidden on 404 */}
        <img
          src="/branding/gansid/portal-hero.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-0"
          onLoad={(e) => { (e.target as HTMLImageElement).classList.remove('opacity-0'); }}
        />
      </div>

      <div>
        <span className="inline-block px-5 py-2 rounded-full bg-gansid-primary-gradient text-white text-sm font-display font-semibold shadow-lg">
          {HERO.badge}
        </span>
      </div>
      <h1 className="font-display text-5xl md:text-6xl font-bold leading-tight tracking-tight">
        <span className="bg-gansid-gradient-reverse bg-clip-text text-transparent">
          {HERO.location}
        </span>
      </h1>
      <p className="font-display text-xl text-gansid-secondary font-semibold">
        {HERO.dates} · {HERO.venue}
      </p>
      <p className="font-body text-gansid-on-surface/80 text-lg leading-relaxed max-w-xl">
        {HERO.intro}
      </p>
    </div>
  );
}
