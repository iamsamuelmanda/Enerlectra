/**
 * User Repository
 *
 * Handles user persistence.
 */
import { Pool } from 'pg';
import { UserState, UserClass } from '../../domain/marketplace/engines/AntiWhaleEngine';
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
export declare class UserRepository {
    private pool;
    constructor(pool: Pool);
    /**
     * Create new user
     */
    create(params: CreateUserParams): Promise<UserRecord>;
    /**
     * Get user by ID
     */
    getById(userId: string): Promise<UserRecord | null>;
    /**
     * Get user by email
     */
    getByEmail(email: string): Promise<UserRecord | null>;
    /**
     * Update user class (based on total invested)
     */
    updateClass(userId: string, newClass: UserClass): Promise<UserRecord>;
    /**
     * Update total invested (after contribution)
     */
    updateTotalInvested(userId: string, delta: number): Promise<UserRecord>;
    /**
     * Increment cluster count
     */
    incrementClusterCount(userId: string): Promise<UserRecord>;
    /**
     * Map database row to domain model
     */
    private mapRow;
}

