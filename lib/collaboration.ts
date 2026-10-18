export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function text(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    throw new AppError(`${label} must be ${allowEmpty ? 'at most' : 'between 1 and'} ${max} characters.`);
  }
  return value.trim();
}
export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) throw new AppError('Invalid record ID.');
  return value;
}
export function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new AppError('A valid note version is required.');
  return Number(value);
}
export function noteInput(input: Record<string, unknown>) {
  const kind = input.kind;
  if (kind !== 'note' && kind !== 'memory') throw new AppError('Choose note or memory.');
  if (typeof input.pinned !== 'boolean') throw new AppError('Pinned must be true or false.');
  const memoryDate = text(input.memoryDate, 'Memory date', 10, true);
  if (memoryDate) {
    const parsed = new Date(`${memoryDate}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(memoryDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== memoryDate) {
      throw new AppError('Use a valid YYYY-MM-DD date.');
    }
  }
  return {title: text(input.title, 'Title', 120), body: text(input.body, 'Note', 20000, true),
    kind, pinned: input.pinned ? 1 : 0, memoryDate};
}
export async function requireMember(db: D1Database, room: string, user: string) {
  const member = await db.prepare('SELECT user_id FROM members WHERE room_id = ? AND user_id = ?').bind(room, user).first();
  if (!member) throw new AppError('You are not a member of this room.', 403);
}
export async function saveNote(db: D1Database, input: Record<string, unknown>, user: {id: string, name: string}) {
  const room = id(input.roomId);
  await requireMember(db, room, user.id);
  const values = noteInput(input);
  const now = Date.now();
  if (input.action === 'add') {
    const noteId = crypto.randomUUID();
    await db.prepare('INSERT INTO notes (id, room_id, title, body, kind, pinned, memory_date, author, editor, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
      .bind(noteId, room, values.title, values.body, values.kind, values.pinned, values.memoryDate, user.name, user.name, now, now).run();
    return noteId;
  }
  const noteId = id(input.noteId), expected = version(input.version);
  const updated = await db.prepare('UPDATE notes SET title = ?, body = ?, kind = ?, pinned = ?, memory_date = ?, editor = ?, updated_at = ?, version = version + 1 WHERE id = ? AND room_id = ? AND version = ? RETURNING id')
    .bind(values.title, values.body, values.kind, values.pinned, values.memoryDate, user.name, now, noteId, room, expected).first();
  if (!updated) throw new AppError('Someone changed or deleted this note. Your draft is still here; reload the saved note or save your draft as a new note.', 409);
  return noteId;
}
export async function deleteNote(db: D1Database, input: Record<string, unknown>, user: string) {
  const room = id(input.roomId);
  await requireMember(db, room, user);
  const deleted = await db.prepare('DELETE FROM notes WHERE id = ? AND room_id = ? AND version = ? RETURNING id')
    .bind(id(input.noteId), room, version(input.version)).first();
  if (!deleted) throw new AppError('The note has changed or was already deleted. Refresh before deleting.', 409);
}
