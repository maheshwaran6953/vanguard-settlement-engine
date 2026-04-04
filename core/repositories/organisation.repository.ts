import { Pool }          from 'pg';
import { Organisation }  from '../domain/entities';

export interface CreateOrgInput {
legal_name: string;
gstin:      string | null;
org_type:   'buyer' | 'supplier' | 'platform';
}

export interface IOrganisationRepository {
findById(id: string):        Promise<Organisation | null>;
create(input: CreateOrgInput): Promise<Organisation>;
}

export class OrganisationRepository implements IOrganisationRepository {
constructor(private readonly pool: Pool) {}

async findById(id: string): Promise<Organisation | null> {
    const result = await this.pool.query<Organisation>(
    `SELECT * FROM organisations WHERE id = $1 LIMIT 1`,
    [id]
    );
    return result.rows[0] ?? null;
}

async create(input: CreateOrgInput): Promise<Organisation> {
    const result = await this.pool.query<Organisation>(
    `INSERT INTO organisations (legal_name, gstin, org_type)
    VALUES ($1, $2, $3)
    RETURNING *`,
    [input.legal_name, input.gstin, input.org_type]
    );
    return result.rows[0]!;
}
}