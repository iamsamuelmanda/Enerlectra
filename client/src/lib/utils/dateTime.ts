import { format, formatDistance, formatRelative, isToday, isYesterday, differenceInDays } from 'date-fns';

export const formatDate = (date: string | Date, formatStr: string = 'PPP'): string => {
  return format(new Date(date), formatStr);
};

export const formatTimeAgo = (date: string | Date): string => {
  return formatDistance(new Date(date), new Date(), { addSuffix: true });
};

export const formatRelativeTime = (date: string | Date): string => {
  return formatRelative(new Date(date), new Date());
};

export const formatShortDate = (date: string | Date): string => {
  return format(new Date(date), 'MMM d, yyyy');
};

export const formatShortDateTime = (date: string | Date): string => {
  return format(new Date(date), 'MMM d, yyyy h:mm a');
};

export const formatTimeOnly = (date: string | Date): string => {
  return format(new Date(date), 'h:mm a');
};

export const isTodayDate = (date: string | Date): boolean => {
  return isToday(new Date(date));
};

export const isYesterdayDate = (date: string | Date): boolean => {
  return isYesterday(new Date(date));
};

export const daysRemaining = (deadline: string | Date): number => {
  return Math.max(0, differenceInDays(new Date(deadline), new Date()));
};

export const isDeadlinePassed = (deadline: string | Date): boolean => {
  return new Date(deadline) < new Date();
};