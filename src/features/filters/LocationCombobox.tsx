import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';

/**
 * The filter builder's location (§4.2): type to narrow the places already
 * used, then pick one. A filter's location matches exactly (§5.1), so only a
 * place from the list can be chosen — a typed place no application has could
 * never match. An empty box is Any location.
 */
export function LocationCombobox({
  id,
  locations,
  value,
  onChange,
  onBlur,
  className,
}: {
  id: string;
  locations: readonly string[];
  value: string | null;
  onChange: (location: string | null) => void;
  onBlur?: () => void;
  className?: string;
}) {
  return (
    <Combobox
      items={[...locations]}
      value={value}
      onValueChange={(next: string | null) => onChange(next)}
      // Emptying the box is how to go back to Any location.
      onInputValueChange={(text: string) => {
        if (text === '' && value !== null) onChange(null);
      }}
      autoHighlight
    >
      <ComboboxInput id={id} placeholder="Any location" className={className} onBlur={onBlur} />
      <ComboboxContent>
        <ComboboxEmpty>No location matches.</ComboboxEmpty>
        <ComboboxList>
          {(location: string) => (
            <ComboboxItem key={location} value={location}>
              {location}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
