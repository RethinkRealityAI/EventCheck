interface FloatingToggleTabsProps<T extends string> {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  fullWidth?: boolean;
}

export function FloatingToggleTabs<T extends string>({ tabs, active, onChange, fullWidth = false }: FloatingToggleTabsProps<T>) {
  return (
    <div
      className={[
        'gap-1 bg-gansid-surface-container-low rounded-full p-1 border border-gansid-outline-variant/30 shadow-sm',
        fullWidth ? 'flex w-full' : 'inline-flex',
      ].join(' ')}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              'px-4 py-2 md:px-8 md:py-3 rounded-full font-display text-sm md:text-base font-semibold whitespace-nowrap transition-all duration-300',
              fullWidth ? 'flex-1' : '',
              isActive
                ? 'bg-gansid-gradient-reverse text-white shadow-md'
                : 'text-gansid-on-surface/70 hover:text-gansid-on-surface hover:bg-white/60',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
