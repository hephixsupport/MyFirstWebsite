// Replace these with your actual keys from Supabase (Settings -&gt; API) const SUPABASE\_URL = '[suspicious link removed]'; const SUPABASE\_ANON\_KEY = 'YOUR-SUPABASE-ANON-KEY';

// Initialize Supabase client const supabase = window.supabase.createClient(SUPABASE\_URL, SUPABASE\_ANON\_KEY);

async function testSupabaseConnection() { const statusDiv = document.getElementById('status'); try {
  // Attempts a basic query to check connection
  const { data, error } = await supabase.from('test\_table').select('\*').limit(1);
  if (error &amp;&amp; error.code !== 'PGRST116') {
    statusDiv.textContent = \`Supabase Client Ready (Table Check: ${error.message})\`; } else {
      statusDiv.textContent = '✅ Connected successfully to Supabase!';
    }
} catch (err) { statusDiv.textContent = '⚠️ Connected to client (add your API keys to script.js).'; } }

testSupabaseConnection();


