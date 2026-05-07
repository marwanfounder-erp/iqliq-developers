import { neon } from '@neondatabase/serverless';

let _client: ReturnType<typeof neon> | null = null;

function getClient() {
  if (!_client) _client = neon(process.env.DATABASE_URL!);
  return _client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sql = (strings: TemplateStringsArray, ...values: unknown[]): Promise<any[]> =>
  getClient()(strings, ...values) as Promise<any[]>;

export default sql;
