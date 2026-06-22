export interface Transaction {
    userId: string;
    amountPCU: number;
}
export interface AggregatedOwnership {
    userId: string;
    totalPCU: number;
    percent: number;
}
export declare function aggregateOwnership(transactions: Transaction[]): AggregatedOwnership[];

