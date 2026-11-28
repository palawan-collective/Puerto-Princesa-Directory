import {Pool} from 'pg';

export const runtime='nodejs';

export async function GET() {
  const url = process.env.DATABASE_URL?.includes('ep-fragrant-rice')
    ? 'postgresql://neondb_owner:npg_EZtfku6csJ8V@ep-fragrant-rice-biythn8g.c-5.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
    : process.env.DATABASE_URL;
  if (!url) return Response.json({error:'no db url'}, {status:500});
  const pool = new Pool({connectionString: url});
  try {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    const result: any = {};
    for (const t of tables.rows) {
      const cols = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position", [t.table_name]);
      const count = await pool.query(`SELECT count(*) as c FROM "${t.table_name}"`);
      result[t.table_name] = { columns: cols.rows, rowCount: parseInt(count.rows[0].c) };
    }
    return Response.json(result);
  } catch (e) {
    return Response.json({error: (e as Error).message}, {status:500});
  } finally {
    await pool.end();
  }
}
