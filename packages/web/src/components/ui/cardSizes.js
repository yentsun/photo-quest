/**
 * @file Card size definitions — micro, normal, large.
 *
 * Law 5.1: exactly three card sizes are allowed.
 */

export const CARD_GRID = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4';

export const CARD_SIZES = {
  micro: {
    art: 'aspect-[5/7]',
    headerPadding: 'px-2 py-1',
    headerText: 'text-[8px]',
    artPadding: 'p-1 pb-0',
    footerPadding: 'px-2 py-1',
    footerText: 'text-[9px]',
    rounding: 'rounded-xl',
  },
  normal: {
    art: 'aspect-[5/7]',
    headerPadding: 'px-3 py-1.5',
    headerText: 'text-[10px]',
    artPadding: 'p-2 pb-0',
    footerPadding: 'px-3 py-2',
    footerText: 'text-xs',
    rounding: 'rounded-2xl',
  },
  large: {
    art: 'aspect-[5/7]',
    headerPadding: 'px-5 py-2.5',
    headerText: 'text-sm',
    artPadding: 'p-4 pb-0',
    footerPadding: 'px-5 py-4',
    footerText: 'text-base',
    rounding: 'rounded-3xl',
  },
};
