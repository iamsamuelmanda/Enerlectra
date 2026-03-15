import { create } from 'zustand';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  details?: any;
}

interface LogStore {
  logs: LogEntry[];
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
}

export const useLogStore = create<LogStore>((set) => ({
  logs: [],
  addLog: (entry) => set((state) => ({
    logs: [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        ...entry,
      },
      ...state.logs,
    ],
  })),
  clearLogs: () => set({ logs: [] }),
}));