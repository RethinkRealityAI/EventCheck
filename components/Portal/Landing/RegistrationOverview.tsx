import { ViscousButton } from '../ui/ViscousButton';

export function RegistrationOverview() {
  return (
    <div className="text-center space-y-4 max-w-2xl mx-auto">
      <p className="font-display text-base uppercase tracking-[0.25em] text-gansid-secondary font-semibold">
        Congress Registration Overview
      </p>
      <h2 className="font-display text-4xl md:text-5xl font-bold leading-tight">
        <span className="bg-gansid-gradient-reverse bg-clip-text text-transparent">
          Ready to join us in Hyderabad?
        </span>
      </h2>
      <p className="font-body text-gansid-on-surface/80 text-lg md:text-xl">
        Create your account, complete your registration, and secure your spot at the first in-person GANSID
        Congress. Below you'll find a step-by-step overview, what's included, and answers to common questions.
      </p>
      <div className="flex justify-center pt-2">
        <ViscousButton
          type="button"
          variant="primary"
          className="px-14 text-xl py-4"
          onClick={() => {
            const targets = document.querySelectorAll<HTMLElement>('[data-register-target]');
            const visible = Array.from(targets).find((t) => t.offsetParent !== null);
            if (visible) {
              visible.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
        >
          Register Now
        </ViscousButton>
      </div>
    </div>
  );
}
