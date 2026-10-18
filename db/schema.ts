import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  ownerId: text('owner_id').notNull(), invite: text('invite').notNull().unique(),
  createdAt: integer('created_at').notNull(),
});
export const members = sqliteTable('members', {
  roomId: text('room_id').notNull(), userId: text('user_id').notNull(),
  name: text('name').notNull(), lastSeen: integer('last_seen').notNull(),
}, t => [primaryKey({columns: [t.roomId, t.userId]})]);
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(), roomId: text('room_id').notNull(),
  title: text('title').notNull(), body: text('body').notNull(),
  kind: text('kind').notNull(), pinned: integer('pinned').notNull().default(0),
  memoryDate: text('memory_date').notNull(), author: text('author').notNull(),
  editor: text('editor').notNull(), createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(), version: integer('version').notNull().default(1),
});
