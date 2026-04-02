/**
 * @file Card size definitions — small, normal, large.
 *
 * Law 5.1: exactly three card sizes are allowed.
 */

export const CARD_GRID = 'flex flex-wrap gap-10';

export const CARD_SIZES = {
  small: {
    width: 'w-20',
    art: 'aspect-[5/7]',
    headerPadding: 'px-2 py-1',
    headerText: 'text-[8px]',
    artPadding: 'p-1 pb-0',
    footerPadding: 'px-2 py-1',
    footerHeight: 'min-h-[20px]',
    footerText: 'text-[9px]',
    rounding: 'rounded-xl',
  },
  normal: {
    width: 'w-44',
    art: 'aspect-[5/7]',
    headerPadding: 'px-3 py-1.5',
    headerText: 'text-[10px]',
    artPadding: 'p-2 pb-0',
    footerPadding: 'px-3 py-2',
    footerHeight: 'h-8',
    footerText: 'text-xs',
    rounding: 'rounded-2xl',
  },
  large: {
    width: 'w-96',
    art: 'aspect-[5/7]',
    headerPadding: 'px-5 py-2.5',
    headerText: 'text-sm',
    artPadding: 'p-4 pb-0',
    footerPadding: 'px-5 py-4',
    footerHeight: 'min-h-[40px]',
    footerText: 'text-base',
    rounding: 'rounded-3xl',
  },
};
