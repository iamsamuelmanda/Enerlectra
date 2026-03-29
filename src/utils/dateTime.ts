export const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const daysRemaining = (deadline: string | Date) => {
  const diff = new Date(deadline).getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};
export const isDeadlinePassed = (deadline: string | Date) => {
  return new Date(deadline).getTime() < new Date().getTime();
};
