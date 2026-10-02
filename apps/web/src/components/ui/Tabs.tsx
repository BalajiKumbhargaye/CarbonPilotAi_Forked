import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab: controlledTab, onChange, className }) => {
  const [internalTab, setInternalTab] = useState(tabs[0]?.id || '');
  const active = controlledTab !== undefined ? controlledTab : internalTab;

  const handleSelect = (id: string) => {
    if (controlledTab === undefined) setInternalTab(id);
    onChange?.(id);
  };

  return (
    <div className={cn('flex space-x-1 border-b border-slate-200 dark:border-slate-800', className)}>
      {tabs.map((tab) => {
        const isCurrent = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => handleSelect(tab.id)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px',
              isCurrent
                ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
