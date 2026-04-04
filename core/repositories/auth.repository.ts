import { Pool }      from 'pg';
import { OrgRole }   from '../domain/auth.types';

export interface OrganisationCredential {
id:            string;
org_id:        string;
email:         string;
password_hash: string;
role:          OrgRole;
is_active:     boolean;
last_login_at: Date | null;
created_at:    Date;
updated_at:    Date;
}

export interface CreateCredentialInput {
org_id:        string;
email:         string;
password_hash: string;
role:          OrgRole;
}

export interface IAuthRepository {
findByEmail(email: string):       Promise<OrganisationCredential | null>;
findByOrgId(orgId: string):       Promise<OrganisationCredential | null>;
create(input: CreateCredentialInput): Promise<OrganisationCredential>;
recordLogin(orgId: string):       Promise<void>;
}

export class AuthRepository implements IAuthRepository {
constructor(private readonly pool: Pool) {}

async findByEmail(email: string): Promise<OrganisationCredential | null> {
    const result = await this.pool.query<OrganisationCredential>(
    `SELECT * FROM organisation_credentials
    WHERE email = $1 AND is_active = true
    LIMIT 1`,
    [email.toLowerCase().trim()]
    );
    return result.rows[0] ?? null;
}

async findByOrgId(orgId: string): Promise<OrganisationCredential | null> {
    const result = await this.pool.query<OrganisationCredential>(
    `SELECT * FROM organisation_credentials
    WHERE org_id = $1 AND is_active = true
    LIMIT 1`,
    [orgId]
    );
    return result.rows[0] ?? null;
}

async create(
    input: CreateCredentialInput
): Promise<OrganisationCredential> {
    const result = await this.pool.query<OrganisationCredential>(
    `INSERT INTO organisation_credentials
        (org_id, email, password_hash, role)
    VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [input.org_id, input.email.toLowerCase().trim(),
    input.password_hash, input.role]
    );
    return result.rows[0]!;
}

async recordLogin(orgId: string): Promise<void> {
    await this.pool.query(
    `UPDATE organisation_credentials
    SET last_login_at = now()
    WHERE org_id = $1`,
    [orgId]
    );
}
}