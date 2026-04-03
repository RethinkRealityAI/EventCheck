import React, { useState, useRef, useEffect } from 'react';
import { Columns3, Check } from 'lucide-react';

export interface ColumnDef {
  key: string;
  label: string;
  group: 'standard' | 'form';
}

interface ColumnVisibilityDropdownProps {
  columns: ColumnDef[];
  visibleColumns: Record<string, boolean>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

const ColumnVisibilityDropdown: React.FC<ColumnVisibilityDropdownProps> = ({
  columns,
  visibleColumns,
  onToggle,
  onShowAll,
  onHideAll
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const standardCols = columns.filter(c => c.group === 'standard');
  const formCols = columns.filter(c => c.group === 'form');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition"
        title="Toggle column visibility"
      >
        <Columns3 className="w-4 h-4" />
        <span className="hidden sm:inline">Columns</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 animate-fade-in">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Visible Columns</span>
            <div className="flex gap-2">
              <button onClick={onShowAll} className="text-[10px] font-bold text-indigo-600 hover:underline">All</button>
              <button onClick={onHideAll} className="text-[10px] font-bold text-gray-400 hover:underline">None</button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            {standardCols.length > 0 && (
              <div className="p-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Standard</div>
                {standardCols.map(col => (
                  <button
                    key={col.key}
                    onClick={() => onToggle(col.key)}
                    className="flex items-center justify-between w-full px-2 py-1.5 rounded-md hover:bg-gray-50 text-sm text-gray-700 transition"
                  >
                    <span>{col.label}</span>
                    {visibleColumns[col.key] !== false ? (
                      <Check className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded border border-gray-300" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {formCols.length > 0 && (
              <div className="p-2 border-t border-gray-100">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Form Fields</div>
                {formCols.map(col => (
                  <button
                    key={col.key}
                    onClick={() => onToggle(col.key)}
                    className="flex items-center justify-between w-full px-2 py-1.5 rounded-md hover:bg-gray-50 text-sm text-gray-700 transition"
                  >
                    <span className="truncate mr-2">{col.label}</span>
                    {visibleColumns[col.key] !== false ? (
                      <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded border border-gray-300 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnVisibilityDropdown;
