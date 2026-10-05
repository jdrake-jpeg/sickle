import { FilterChips, FilterGroup, Filters } from '@/components/Filters';
import { FormatFilter, noRecordFilter, OpponentFilter, RecordFilter, recordFilterCount } from '@/lib/record';

export const formatOptions: { value: FormatFilter; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'singles', label: 'Singles' },
  { value: 'doubles', label: 'Doubles' },
];

// Filters for a record and match history.
export function RecordFilters({ filter, onChange }: { filter: RecordFilter; onChange: (next: RecordFilter) => void }) {
  return (
    <Filters active={recordFilterCount(filter)} onClear={() => onChange(noRecordFilter)}>
      <FilterGroup label="Game type">
        <FilterChips options={formatOptions} value={filter.format} onChange={(format) => onChange({ ...filter, format })} />
      </FilterGroup>
      <FilterGroup label="Opponents" hint="Same teams: opponents played more than once.">
        <FilterChips<OpponentFilter>
          options={[
            { value: 'all', label: 'All' },
            { value: 'same', label: 'Same teams' },
            { value: 'different', label: 'Different teams' },
          ]}
          value={filter.opponents}
          onChange={(opponents) => onChange({ ...filter, opponents })}
        />
      </FilterGroup>
    </Filters>
  );
}
