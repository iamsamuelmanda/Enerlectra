import { Transaction } from "../domain/Transaction";
import { AggregatedOwnership } from "../domain/Aggregation";
export declare function aggregateOwnership(transactions: Transaction[]): AggregatedOwnership[];
