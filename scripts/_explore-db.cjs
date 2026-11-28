const {Pool}=require('pg');
const pool=new Pool({connectionString:'postgresql://neondb_owner:npg_g1NGeIKjLr3x@ep-fragrant-rice-biythn8g-pooler.c-5.ap-southeast-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require'});
(async()=>{
  const client=await pool.connect();
  // List all tables
  const tables=await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log('=== TABLES ===');
  console.log(tables.rows.map(r=>r.table_name).join('\n'));
  // For each table, show columns
  for (const t of tables.rows) {
    const cols=await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,[t.table_name]);
    console.log(`\n=== ${t.table_name} ===`);
    for (const c of cols.rows) console.log(`  ${c.column_name} (${c.data_type}) ${c.is_nullable==='NO'?'NOT NULL':''}`);
    const count=await client.query(`SELECT count(*) as c FROM "${t.table_name}"`);
    console.log(`  rows: ${count.rows[0].c}`);
  }
  client.release();
  await pool.end();
})().catch(e=>{console.error(e);process.exit(1)});
