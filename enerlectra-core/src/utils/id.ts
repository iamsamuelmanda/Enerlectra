export const generateId = (prefix: string) =>
    `${prefix}_${Math.random().toString(36).slice(2, 10)}`
  
