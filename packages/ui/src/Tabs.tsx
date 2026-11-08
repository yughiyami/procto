import type { KeyboardEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { cx } from './cx';

export interface TabItem {
  key: string;
  label: ReactNode;
  panel: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
  /** Accessible name for the tablist, e.g. "Secciones del pedido". */
  label: string;
}

export function Tabs({ tabs, activeKey, onChange, className, label }: TabsProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const enabledTabs = tabs.filter((tab) => !tab.disabled);
  const activeTab = tabs.find((tab) => tab.key === activeKey);

  function focusAndSelect(key: string) {
    onChange(key);
    tabRefs.current.get(key)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const count = enabledTabs.length;
    if (count === 0) return;
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % count;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + count) % count;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = count - 1;
    const nextTab = enabledTabs[nextIndex];
    if (nextTab) focusAndSelect(nextTab.key);
  }

  return (
    <div className={cx('izu-tabs', className)}>
      <div className="izu-tabs__list" role="tablist" aria-label={label}>
        {tabs.map((tab) => {
          const enabledIndex = enabledTabs.indexOf(tab);
          const selected = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.key, el);
                else tabRefs.current.delete(tab.key);
              }}
              type="button"
              role="tab"
              id={`izu-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`izu-tabpanel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              className="izu-tabs__tab"
              onClick={() => onChange(tab.key)}
              onKeyDown={(event) => handleKeyDown(event, enabledIndex)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab ? (
        <div
          className="izu-tabs__panel"
          role="tabpanel"
          id={`izu-tabpanel-${activeTab.key}`}
          aria-labelledby={`izu-tab-${activeTab.key}`}
          tabIndex={0}
        >
          {activeTab.panel}
        </div>
      ) : null}
    </div>
  );
}
