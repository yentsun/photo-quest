/**
 * @file Date-range picker popover.
 *
 * A port of the Glyph Design Book's `<glyph-datepicker mode="range">` into the
 * app's Solarized CSS variables: a mono grid, accent-washed range preview and
 * two side-by-side months (one on narrow screens).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button.jsx';
import Icon from './Icon.jsx';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const CALENDAR_WIDTH = 480;
const NARROW_VIEWPORT = 560;

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Parse a `YYYY-MM-DD` string into a local Date, or null. */
function parseDay(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function dayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function sameDay(a, b) {
  return dayKey(a) === dayKey(b);
}

export default function DateRangePicker({
  start = null,
  end = null,
  onChange,
  placeholder = 'All time',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ start: null, end: null });
  const [hoverEnd, setHoverEnd] = useState(null);
  const [view, setView] = useState(() => startOfMonth(new Date()));
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const calendarRef = useRef(null);
  const today = useMemo(() => new Date(), []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open) return;
    setDraft({ start: start || null, end: end || null });
  }, [start, end, open]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (calendarRef.current?.contains(event.target)) return;
      if (triggerRef.current?.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    const onScroll = (event) => {
      if (calendarRef.current?.contains(event.target)) return;
      close();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    const narrow = window.innerWidth <= NARROW_VIEWPORT;
    const left = narrow || !rect
      ? 8
      : Math.max(8, Math.min(rect.left, window.innerWidth - CALENDAR_WIDTH - 8));
    const desiredTop = rect ? rect.bottom + 4 : 8;
    const maxTop = window.innerHeight - 16 - 340;
    const top = Math.max(8, Math.min(desiredTop, maxTop));

    setDraft({ start: start || null, end: end || null });
    setHoverEnd(null);
    setView(startOfMonth(parseDay(start) || new Date()));
    setCoords({ top, left });
    setOpen(true);
  };

  const changeMonth = (delta) => {
    setView(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const clearRange = () => {
    setDraft({ start: null, end: null });
    setHoverEnd(null);
    close();
    onChange?.({ start: null, end: null });
  };

  const pickDay = (date) => {
    const key = dayKey(date);

    if (!draft.start || draft.end) {
      setDraft({ start: key, end: null });
      setHoverEnd(null);
      return;
    }

    let from = draft.start;
    let to = key;
    if (to < from) [from, to] = [to, from];

    setDraft({ start: from, end: to });
    setHoverEnd(null);
    close();
    onChange?.({ start: from, end: to });
  };

  const previewEnd = draft.start && !draft.end ? hoverEnd : draft.end;
  const previewFrom = draft.start && previewEnd && previewEnd < draft.start ? previewEnd : draft.start;
  const previewTo = draft.start && previewEnd && previewEnd < draft.start ? draft.start : previewEnd;
  const label = start && end
    ? `${start} → ${end}`
    : start
      ? `${start} → …`
      : placeholder;

  const renderPanel = (viewDate, offset) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const totalDays = daysInMonth(year, month);
    const previousTotal = daysInMonth(year, month - 1);
    const cells = [];

    for (let i = firstWeekday - 1; i >= 0; i -= 1) {
      cells.push(
        <button key={`prev-${i}`} type="button" className="cal-cell other empty" disabled>
          {previousTotal - i}
        </button>,
      );
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(year, month, day);
      const key = dayKey(date);
      const isToday = sameDay(date, today);
      const isStart = draft.start === key;
      const isEnd = Boolean(previewEnd) && previewEnd === key && previewEnd !== draft.start;
      const inRange = Boolean(
        previewFrom
        && previewTo
        && key > previewFrom
        && key < previewTo,
      );

      const classes = [
        'cal-cell',
        isToday ? 'today' : '',
        isStart ? 'range-start' : '',
        isEnd ? 'range-end' : '',
        inRange ? 'in-range' : '',
      ].filter(Boolean).join(' ');

      cells.push(
        <button
          key={key}
          type="button"
          className={classes}
          onMouseEnter={() => {
            if (draft.start && !draft.end) setHoverEnd(key);
          }}
          onClick={() => pickDay(date)}
        >
          {day}
        </button>,
      );
    }

    const remaining = (7 - ((firstWeekday + totalDays) % 7)) % 7;
    for (let day = 1; day <= remaining; day += 1) {
      cells.push(
        <button key={`next-${day}`} type="button" className="cal-cell other empty" disabled>
          {day}
        </button>,
      );
    }

    return (
      <div className="datepicker-cal-panel" key={`${year}-${month}`}>
        <div className="datepicker-cal-head">
          <div className="datepicker-cal-nav">
            {offset === 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Icon name="prev" className="icon-sm" />}
                aria-label="Previous month"
                onClick={() => changeMonth(-1)}
              />
            )}
            {offset === 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="datepicker-cal-nav-mobile"
                icon={<Icon name="next" className="icon-sm" />}
                aria-label="Next month"
                onClick={() => changeMonth(1)}
              />
            )}
          </div>
          <span className="cal-title">{MONTHS[month]} {year}</span>
          <div className="datepicker-cal-nav">
            {offset === 1 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Icon name="next" className="icon-sm" />}
                aria-label="Next month"
                onClick={() => changeMonth(1)}
              />
            )}
          </div>
        </div>
        <div className="datepicker-cal-weekdays">
          {WEEKDAYS.map(weekday => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="datepicker-cal-grid">{cells}</div>
      </div>
    );
  };

  const nextMonth = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  const hint = draft.start && draft.end
    ? `${draft.start} → ${draft.end}`
    : draft.start
      ? 'Pick an end day'
      : 'Pick a start and end day';

  return (
    <>
      <span ref={triggerRef} className="datepicker-anchor">
        <Button
          variant="ghost"
          size="sm"
          className={['datepicker-trigger', start ? 'active' : '', className].filter(Boolean).join(' ')}
          icon={<Icon name="calendar" className="icon-sm cal-glyph" />}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={toggle}
        >
          {label}
        </Button>
      </span>

      {open && createPortal(
        <div
          ref={calendarRef}
          className="datepicker-calendar"
          role="dialog"
          aria-label="Choose a date range"
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="datepicker-cal-body">
            {renderPanel(view, 0)}
            {renderPanel(nextMonth, 1)}
          </div>
          <div className="datepicker-cal-footer">
            <span className="datepicker-cal-hint">{hint}</span>
            <Button
              variant="text"
              size="sm"
              onClick={clearRange}
              disabled={!draft.start && !draft.end}
            >
              Clear
            </Button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
