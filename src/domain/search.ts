/** Finding Items by name (spec §4.4). Plain word matching, no fuzziness: a near miss shows nothing. */
type Searchable = { name: string; variant: string; category: string };

// "2 KG" and "2kg" both become "2kg", so spacing between number and unit never matters.
const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/(\d)\s+(?=[a-z])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

export function searchItems<T extends Searchable>(items: T[], query: string): T[] {
  const words = normalise(query).split(' ').filter(Boolean);
  const [first] = words;
  if (!first) return [];

  const matches = items.filter((item) => {
    const haystack = normalise(`${item.name} ${item.variant} ${item.category}`);
    return words.every((word) => haystack.includes(word));
  });

  const startsWithFirst = (item: T) => normalise(item.name).startsWith(first);
  return matches.sort(
    (a, b) =>
      Number(startsWithFirst(b)) - Number(startsWithFirst(a)) ||
      a.name.localeCompare(b.name) ||
      a.variant.localeCompare(b.variant),
  );
}
