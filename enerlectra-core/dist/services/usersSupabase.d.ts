export type UserClass = 'MICRO' | 'RETAIL' | 'PROFESSIONAL' | 'INSTITUTIONAL';
export interface UserState {
    id: string;
    currentClass: UserClass;
    totalInvestedUSD: number;
    clusterCount: number;
}
export interface UserRecord extends UserState {
    name: string;
    email: string;
    phone: string;
    location: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface CreateUserParams {
    name: string;
    email: string;
    phone: string;
    location: string;
}
export declare function createUser(params: CreateUserParams): Promise<UserRecord>;
export declare function getUserById(userId: string): Promise<UserRecord | null>;
export declare function getUserByEmail(email: string): Promise<UserRecord | null>;
export declare function updateUserClass(userId: string, newClass: UserClass): Promise<UserRecord>;
export declare function updateUserTotalInvested(userId: string, delta: number): Promise<UserRecord>;
export declare function incrementUserClusterCount(userId: string): Promise<UserRecord>;

