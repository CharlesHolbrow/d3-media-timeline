import {timeFormat, timeParse} from 'd3-time-format';
import {scaleTime} from 'd3-scale';

export const formatYear       = timeFormat('%Y');
export const formatMonthDay   = timeFormat('%b %e');
export const formatMonthLong  = timeFormat('%B'); // %B=January %b=Jan
export const formatMonthShort = timeFormat('%b');
export const formatMonth = function(date) {
  const dateString = formatMonthLong(date); // %B=January %b=Jan
  return dateString.length <= 5 ? dateString : formatMonthShort(date);
}

export const parseYear = timeParse('%Y');
export const dateToYearFloat = scaleTime()
  .domain([parseYear(1000), parseYear(2000)])
  .range([1000, 2000]);

export const yearFloatToDate = dateToYearFloat.invert;
