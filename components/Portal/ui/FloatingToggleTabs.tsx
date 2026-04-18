interface FloatingToggleTabsProps<T extends string> {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}

export function FloatingToggleTabs<T extends string>({ tabs, active, onChange }: FloatingToggleTabsProps<T>) {
  return (
    <div className="inline-flex gap-1 bg-gansid-surface-container-low rounded-full p-1 border border-gansid-outline-variant/30 shadow-sm">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              'px-6 py-2 rounded-full font-display text-sm font-semibold transition-all duration-300',
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
