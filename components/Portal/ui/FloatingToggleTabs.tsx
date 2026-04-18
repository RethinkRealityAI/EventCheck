interface FloatingToggleTabsProps<T extends string> {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}

export function FloatingToggleTabs<T extends string>({ tabs, active, onChange }: FloatingToggleTabsProps<T>) {
  return (
    <div className="inline-flex gap-1 bg-gansid-surface-container-low rounded-full p-1">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              'px-5 py-2 rounded-full font-display text-sm transition-all duration-300 ease-viscous',
              isActive
                ? 'bg-gansid-surface-container-lowest text-gansid-on-surface shadow-invisible-lift'
                : 'text-gansid-on-surface/60 hover:text-gansid-on-surface',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
