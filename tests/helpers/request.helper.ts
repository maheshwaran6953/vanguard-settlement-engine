import supertest from 'supertest';
import { buildApp } from '../../services/app';

// Build the Express app once — reused across all tests in the file.
// We do not call app.listen() — supertest handles the port binding.
const app = buildApp();

export const api = supertest(app);

// ----------------------------------------------------------------
// Typed response helpers — make test assertions cleaner.
// ----------------------------------------------------------------
export interface AuthTokens {
supplierToken: string;
buyerToken:    string;
supplierId:    string;
buyerId:       string;
}

export async function registerAndLogin(
supplierEmail = 'supplier@test.com',
buyerEmail    = 'buyer@test.com'
): Promise<AuthTokens> {

const supplierRes = await api
    .post('/auth/register')
    .send({
    legal_name: 'Alpha Tech Pvt Ltd',
    role:       'supplier',
    email:      supplierEmail,
    password:   'TestPassword123!',
    })
    .expect(201);

const buyerRes = await api
    .post('/auth/register')
    .send({
    legal_name: 'Zoho Corporation',
    role:       'buyer',
    email:      buyerEmail,
    password:   'TestPassword456!',
    })
    .expect(201);

return {
    supplierToken: supplierRes.body.data.token,
    buyerToken:    buyerRes.body.data.token,
    supplierId:    supplierRes.body.data.organisation.id,
    buyerId:       buyerRes.body.data.organisation.id,
};
}