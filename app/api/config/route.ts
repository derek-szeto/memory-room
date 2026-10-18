import {env} from 'cloudflare:workers';
export function GET() {
  const vars = env as unknown as Record<string,string|undefined>;
  const url = vars.SUPABASE_URL || process.env.SUPABASE_URL;
  const key = vars.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    // This endpoint is public. Reject privileged keys before returning anything.
    let publicKey = key.startsWith('sb_publishable_');
    if (!publicKey) {
      try {publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon';} catch {publicKey = false;}
    }
    if (!publicKey) return Response.json({error:'Use a Supabase publishable or anon key.'},{status:503});
    try {const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error();} catch {return Response.json({error:'Invalid Supabase project URL.'},{status:503});}
    return Response.json({url:url.replace(/\/$/,''),key},{headers:{'Cache-Control':'no-store'}});
  }
  if (url || key) return Response.json({error:'Set both Supabase environment variables.'},{status:503});
  return Response.json(null,{headers:{'Cache-Control':'no-store'}});
}
