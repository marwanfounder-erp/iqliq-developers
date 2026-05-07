import { neon } from '@neondatabase/serverless';

// Lazy client — neon() must NOT be called at module load time because
// DATABASE_URL is unavailable during `next build` on Vercel.
let _client: ReturnType<typeof neon> | null = null;

function getClient() {
  if (!_client) _client = neon(process.env.DATABASE_URL!);
  return _client;
}

// Thin tagged-template wrapper with the same call signature used across routes.
const sql = (strings: TemplateStringsArray, ...values: unknown[]) =>
  getClient()(strings, ...values);

export default sql;
