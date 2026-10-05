import { describe, expect, it } from 'vitest';
import { searchItems } from '../src/domain/search';

const item = (name: string, variant = '', category = '') => ({ name, variant, category });
const names = (results: { name: string; variant: string }[]) => results.map((r) => `${r.name} ${r.variant}`.trim());

const ITEMS = [
  item('White Sugar', '2 KG', 'Grocery'),
  item('Brown Sugar', '1kg', 'Grocery'),
  item('Sugar Beans', '500g', 'Grocery'),
  item('Coca Cola', '2L', 'Drinks'),
  item('Coca Cola', '1L', 'Drinks'),
  item('Bath Soap', '', 'Household'),
];

// Spec §4.4
describe('searchItems', () => {
  it('matches every typed word, in any order, ignoring case', () => {
    expect(names(searchItems(ITEMS, 'cola COCA 2l'))).toEqual(['Coca Cola 2L']);
  });

  it('matches abbreviations as substrings', () => {
    expect(names(searchItems(ITEMS, 'sug 2kg'))).toEqual(['White Sugar 2 KG']);
  });

  it('ignores spaces between a number and its unit, on both sides', () => {
    expect(names(searchItems(ITEMS, 'sugar 2 kg'))).toEqual(['White Sugar 2 KG']);
    expect(names(searchItems(ITEMS, 'brown 1 kg'))).toEqual(['Brown Sugar 1kg']);
  });

  it('searches the category too', () => {
    expect(names(searchItems(ITEMS, 'household'))).toEqual(['Bath Soap']);
  });

  it('lists names starting with the first word first, then alphabetically', () => {
    expect(names(searchItems(ITEMS, 'sugar'))).toEqual(['Sugar Beans 500g', 'Brown Sugar 1kg', 'White Sugar 2 KG']);
  });

  it('returns nothing for a blank query', () => {
    expect(searchItems(ITEMS, '   ')).toEqual([]);
  });

  it('returns nothing rather than a near miss', () => {
    expect(searchItems(ITEMS, 'suagr')).toEqual([]);
  });
});
