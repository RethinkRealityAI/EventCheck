import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { sessionById } from '../../../config/congressProgram';
import {
  ALL_TOPICS,
  DEFAULT_SPEAKER_FILTERS,
  TOPICS,
  appearanceSummary,
  buildSpeakerDirectory,
  countCountries,
  filterSpeakers,
  hasActiveFilters,
  speakerSubline,
  type SpeakerFilters,
} from '../../../utils/congressDirectory';
import { GLASS_CARD, InitialsAvatar, PRESS, SegmentedControl } from '../ui/congressUi';

/**
 * Speaker directory — every person named in the programme (speakers,
 * moderators, session chairs), filterable by day, topic and role. Built from
 * config/congressProgram.ts, so it can never drift from the programme.
 */

const SPEAKERS = buildSpeakerDirectory();
const COUNTRIES = countCountries(SPEAKERS);

const DAY_OPTIONS: { value: SpeakerFilters['day']; label: string }[] = [
  { value: 0, label: 'All' },
  { value: 1, label: 'Fri 23' },
  { value: 2, label: 'Sat 24' },
  { value: 3, label: 'Sun 25' },
];

const ROLE_TABS: { value: SpeakerFilters['role']; label: string }[] = [
  { value: 'All', label: 'Everyone' },
  { value: 'Speaker', label: 'Speakers' },
  { value: 'Moderator', label: 'Moderators' },
  { value: 'Session chair', label: 'Chairs' },
];

const TOPIC_LABELS = [ALL_TOPICS, ...TOPICS.map((t) => t.label)];

export function SpeakersPage() {
  const [filters, setFilters] = useState<SpeakerFilters>(DEFAULT_SPEAKER_FILTERS);
  const set = <K extends keyof SpeakerFilters>(k: K, v: SpeakerFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const matches = useMemo(() => filterSpeakers(SPEAKERS, filters, sessionById), [filters]);
  const active = hasActiveFilters(filters);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">Speakers &amp; chairs</h1>
        <p className="mt-1 font-body text-sm text-gansid-on-surface/60">
          {SPEAKERS.length} from {COUNTRIES} countries
        </p>
      </div>

      {/* Search */}
      <label className={`flex items-center gap-2.5 rounded-full px-4 py-3 ${GLASS_CARD}`}>
        <Search className="h-4 w-4 shrink-0 text-gansid-on-surface/40" aria-hidden />
        <span className="sr-only">Search speakers</span>
        <input
          type="search"
          value={filters.query}
          onChange={(e) => set('query', e.target.value)}
          placeholder="Search name, country or session"
          className="min-w-0 flex-1 bg-transparent font-body text-sm text-gansid-on-surface outline-none placeholder:text-gansid-on-surface/40"
        />
      </label>

      <div className="mt-3">
        <SegmentedControl label="Day" options={DAY_OPTIONS} value={filters.day} onChange={(v) => set('day', v)} />
      </div>

      {/* Topic pills — one scrolling row */}
      <div className="-mx-6 mt-3 flex gap-2 overflow-x-auto whitespace-nowrap px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TOPIC_LABELS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => set('topic', t)}
            aria-pressed={filters.topic === t}
            className={[
              'shrink-0 rounded-full px-4 py-2 font-display text-[13px] font-semibold transition-all duration-300 ease-viscous active:scale-[0.96]',
              filters.topic === t
                ? 'bg-gansid-primary-gradient text-white shadow-[0_12px_24px_-14px_rgba(186,0,40,0.8)]'
                : 'bg-gansid-on-surface/[0.05] text-gansid-on-surface/70 hover:bg-gansid-on-surface/[0.08]',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Role tabs + count */}
      {/* Wraps on narrow phones once "Clear" appears; the count stays right-aligned. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex gap-3" role="tablist" aria-label="Role">
          {ROLE_TABS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="tab"
              aria-selected={filters.role === r.value}
              onClick={() => set('role', r.value)}
              className={[
                'border-b-2 pb-1 font-display text-[12.5px] font-semibold transition-colors duration-300',
                filters.role === r.value
                  ? 'border-gansid-primary text-gansid-on-surface'
                  : 'border-transparent text-gansid-on-surface/45 hover:text-gansid-on-surface/70',
              ].join(' ')}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 font-body text-xs text-gansid-on-surface/45">
          <span className="tabular-nums">
            {matches.length} {matches.length === 1 ? 'person' : 'people'}
          </span>
          {active && (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_SPEAKER_FILTERS)}
              className="font-semibold text-gansid-secondary hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      <ul className="mt-3 space-y-2.5">
        {matches.map(({ speaker, appearances }) => (
          <li key={speaker.id}>
            <Link
              to={`/portal/speakers/${speaker.id}`}
              className={`flex items-center gap-3.5 rounded-[22px] p-3.5 ${GLASS_CARD} ${PRESS}`}
            >
              <InitialsAvatar name={speaker.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[15px] font-bold tracking-tight text-gansid-on-surface">
                  {speaker.name}
                </span>
                <span className="mt-0.5 block truncate font-body text-xs text-gansid-on-surface/55">
                  {speakerSubline(speaker)}
                </span>
                <span className="mt-0.5 block font-body text-xs font-medium text-gansid-secondary">
                  {appearanceSummary(appearances, sessionById)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gansid-on-surface/30" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      {matches.length === 0 && (
        <div className={`mt-6 rounded-gansid-md p-8 text-center ${GLASS_CARD}`}>
          <p className="font-display font-semibold text-gansid-on-surface/80">No one matches these filters</p>
          <p className="mt-1 font-body text-sm text-gansid-on-surface/55">Try another day or topic.</p>
        </div>
      )}
    </div>
  );
}
