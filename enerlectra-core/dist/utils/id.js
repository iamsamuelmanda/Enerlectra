export const generateId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
