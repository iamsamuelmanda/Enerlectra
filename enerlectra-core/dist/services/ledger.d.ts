export type ContributionEntry = {
    contributionId: string;
    clusterId: string;
    userId: string;
    amountZMW: number;
    timestamp: string;
};
export declare function recordContribution(entry: ContributionEntry): void;

