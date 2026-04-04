import bcrypt        from 'bcryptjs';
import jwt           from 'jsonwebtoken';
import { env }       from '../config/env';
import { IAuthRepository, CreateCredentialInput }
                    from '../repositories/auth.repository';
import { IOrganisationRepository }
                    from '../repositories/organisation.repository';
import { JwtPayload, OrgRole } from '../domain/auth.types';

export class InvalidCredentialsError extends Error {
constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
}
}

export class AccountInactiveError extends Error {
constructor() {
    super('This account has been deactivated');
    this.name = 'AccountInactiveError';
}
}

export interface RegisterOrgInput {
legal_name: string;
gstin?:     string;
role:       OrgRole;
email:      string;
password:   string;
}

export interface AuthResult {
token:        string;
expires_in:   string;
organisation: { id: string; legal_name: string; role: OrgRole };
}

export class AuthService {
constructor(
    private readonly authRepo: IAuthRepository,
    private readonly orgRepo:  IOrganisationRepository,
) {}

// ----------------------------------------------------------------
// register
// Creates the organisation record and its credential in one
// transaction. The password is hashed before it ever touches
// the database — plaintext is never persisted.
// ----------------------------------------------------------------
async register(input: RegisterOrgInput): Promise<AuthResult> {

    const existing = await this.authRepo.findByEmail(input.email);
    if (existing) {
    throw new Error(`Email ${input.email} is already registered`);
    }

    const passwordHash = await bcrypt.hash(
    input.password,
    env.BCRYPT_ROUNDS
    );

    // Create the organisation domain record first
    const org = await this.orgRepo.create({
    legal_name: input.legal_name,
    gstin:      input.gstin ?? null,
    org_type:   input.role === 'platform_admin' ? 'platform' : input.role,
    });

    // Then create the credential linked to it
    await this.authRepo.create({
    org_id:        org.id,
    email:         input.email,
    password_hash: passwordHash,
    role:          input.role,
    });

    return this.buildAuthResult(org.id, input.email,
                                input.role, org.legal_name);
}

// ----------------------------------------------------------------
// login
// Constant-time password comparison via bcrypt.compare prevents
// timing attacks. We always call bcrypt.compare even when the
// user doesn't exist — this prevents user enumeration via
// response timing differences.
// ----------------------------------------------------------------
async login(email: string, password: string): Promise<AuthResult> {

    const credential = await this.authRepo.findByEmail(email);

    // Use a dummy hash when user not found — prevents timing attack
    const hashToCompare = credential?.password_hash ??
    '$2a$12$dummyhashtopreventtimingattacksonnonexistentusers..xx';

    const passwordValid = await bcrypt.compare(password, hashToCompare);

    if (!credential || !passwordValid) {
    throw new InvalidCredentialsError();
    }

    if (!credential.is_active) {
    throw new AccountInactiveError();
    }

    // Record login timestamp asynchronously — don't block the response
    this.authRepo.recordLogin(credential.org_id).catch(console.error);

    const org = await this.orgRepo.findById(credential.org_id);

    return this.buildAuthResult(
    credential.org_id,
    credential.email,
    credential.role,
    org?.legal_name ?? ''
    );
}

// ----------------------------------------------------------------
// Private: token minting
// The sub claim is the organisation's UUID — this becomes
// req.user.sub in every protected route, replacing the
// hardcoded placeholder UUIDs from previous steps.
// ----------------------------------------------------------------
private buildAuthResult(
    orgId:     string,
    email:     string,
    role:      OrgRole,
    legalName: string
): AuthResult {

    const payload: JwtPayload = {
    sub:    orgId,
    email,
    role,
    org_id: orgId,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    return {
    token,
    expires_in:   env.JWT_EXPIRES_IN,
    organisation: { id: orgId, legal_name: legalName, role },
    };
}
}