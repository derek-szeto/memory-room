import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { AppError, text, id, requireMember, saveNote, deleteNote } from '@/lib/collaboration';
export const dynamic = 'force-dynamic';
async function identity(request: Request) {
  const real = await getChatGPTUser();
  if (real) return {id: real.userId, name: real.displayName.slice(0, 80), local: false};
  // This fallback exists only on the local development server. Never use it in production.
  const host = new URL(request.url).hostname;
  if (process.env.NODE_ENV === 'development' && ['localhost','127.0.0.1'].includes(host)) {
    const local = request.headers.get('x-local-user');
    if (local && /^[a-f0-9-]{36}$/.test(local)) return {id: `local:${local}`, name: text(request.headers.get('x-local-name') || 'Local friend', 'Name', 80), local: true};
  }
  throw new AppError('Sign in with ChatGPT to use your rooms.', 401);
}
function database() {
  if (!env.DB) throw new AppError('The shared database is not configured.', 503);
  return env.DB;
}
function response(data: unknown, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
}
function failure(error: unknown) {
  if (error instanceof AppError) return response({error: error.message}, error.status);
  console.error('Collaboration request failed', error instanceof Error ? error.message : 'Unknown error');
  return response({error: 'The server could not complete the request. Try again.'}, 500);
}
export async function GET(request: Request) {
  try {
    const user = await identity(request), db = database();
    const roomParam = new URL(request.url).searchParams.get('room');
    if (!roomParam) {
      const rooms = await db.prepare('SELECT r.id, r.name, r.owner_id, CASE WHEN r.owner_id = ? THEN r.invite ELSE NULL END AS invite FROM rooms r JOIN members m ON m.room_id = r.id WHERE m.user_id = ? ORDER BY r.created_at DESC')
        .bind(user.id, user.id).all();
      return response({user, rooms: rooms.results});
    }
    const room = id(roomParam);
    await requireMember(db, room, user.id);
    const [notes, members] = await Promise.all([
      db.prepare('SELECT * FROM notes WHERE room_id = ? ORDER BY pinned DESC, updated_at DESC').bind(room).all(),
      db.prepare('SELECT name, last_seen FROM members WHERE room_id = ? ORDER BY name').bind(room).all(),
    ]);
    return response({notes: notes.results, members: members.results, serverTime: Date.now()});
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new AppError('Cross-origin writes are not allowed.', 403);
    if (!(request.headers.get('content-type') || '').includes('application/json')) throw new AppError('Send JSON.', 415);
    const raw = await request.text();
    if (raw.length > 30000) throw new AppError('Request is too large.', 413);
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { throw new AppError('Invalid JSON.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Invalid request.');
    const user = await identity(request), db = database();
    if (input.action === 'create') {
      const room = crypto.randomUUID(), name = text(input.name, 'Room name', 60);
      const invite = crypto.randomUUID().replaceAll('-', '');
      await db.batch([
        db.prepare('INSERT INTO rooms (id, name, owner_id, invite, created_at) VALUES (?, ?, ?, ?, ?)').bind(room, name, user.id, invite, Date.now()),
        db.prepare('INSERT INTO members (room_id, user_id, name, last_seen) VALUES (?, ?, ?, ?)').bind(room, user.id, user.name, Date.now()),
      ]);
      return response({roomId: room});
    }
    if (input.action === 'join') {
      const invite = text(input.invite, 'Invite code', 32);
      if (!/^[a-f0-9]{32}$/.test(invite)) throw new AppError('Enter the full 32-character invite code.');
      const room = await db.prepare('SELECT id FROM rooms WHERE invite = ?').bind(invite).first<{id: string}>();
      if (!room) throw new AppError('Invite code not found.', 404);
      await db.prepare('INSERT INTO members (room_id, user_id, name, last_seen) VALUES (?, ?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen')
        .bind(room.id, user.id, user.name, Date.now()).run();
      return response({roomId: room.id});
    }
    if (input.action === 'heartbeat') {
      const room = id(input.roomId);
      await requireMember(db, room, user.id);
      await db.prepare('UPDATE members SET last_seen = ?, name = ? WHERE room_id = ? AND user_id = ?').bind(Date.now(), user.name, room, user.id).run();
      return response({ok: true});
    }
    if (input.action === 'rename') {
      const room = id(input.roomId);
      await requireMember(db, room, user.id);
      await db.prepare('UPDATE rooms SET name = ? WHERE id = ?').bind(text(input.name, 'Workspace name', 60),room).run();
      return response({ok:true});
    }
    if (input.action === 'add' || input.action === 'edit') {
      const noteId = await saveNote(db, input, user);
      return response({noteId});
    }
    if (input.action === 'delete') { await deleteNote(db, input, user.id); return response({ok: true}); }
    throw new AppError('Unknown action.');
  } catch (error) { return failure(error); }
}
