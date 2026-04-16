/**
 * User Repository
 *
 * Handles user persistence.
 */
export class UserRepository {
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Create new user
     */
    async create(params) {
        const result = await this.pool.query(`
      INSERT INTO users (name, email, phone, location)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `, [params.name, params.email, params.phone, params.location]);
        return this.mapRow(result.rows[0]);
    }
    /**
     * Get user by ID
     */
    async getById(userId) {
        const result = await this.pool.query(`
      SELECT * FROM users WHERE id = $1
      `, [userId]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRow(result.rows[0]);
    }
    /**
     * Get user by email
     */
    async getByEmail(email) {
        const result = await this.pool.query(`
      SELECT * FROM users WHERE email = $1
      `, [email]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRow(result.rows[0]);
    }
    /**
     * Update user class (based on total invested)
     */
    async updateClass(userId, newClass) {
        const result = await this.pool.query(`
      UPDATE users
      SET 
        current_class = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `, [userId, newClass]);
        if (result.rows.length === 0) {
            throw new Error(`User ${userId} not found`);
        }
        return this.mapRow(result.rows[0]);
    }
    /**
     * Update total invested (after contribution)
     */
    async updateTotalInvested(userId, delta) {
        const result = await this.pool.query(`
      UPDATE users
      SET 
        total_invested_usd = total_invested_usd + $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `, [userId, delta]);
        if (result.rows.length === 0) {
            throw new Error(`User ${userId} not found`);
        }
        return this.mapRow(result.rows[0]);
    }
    /**
     * Increment cluster count
     */
    async incrementClusterCount(userId) {
        const result = await this.pool.query(`
      UPDATE users
      SET 
        cluster_count = cluster_count + 1,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `, [userId]);
        if (result.rows.length === 0) {
            throw new Error(`User ${userId} not found`);
        }
        return this.mapRow(result.rows[0]);
    }
    /**
     * Map database row to domain model
     */
    mapRow(row) {
        return {
            id: row.id,
            name: row.name,
            email: row.email,
            phone: row.phone,
            location: row.location,
            currentClass: row.current_class,
            totalInvestedUSD: parseFloat(row.total_invested_usd),
            clusterCount: row.cluster_count,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
