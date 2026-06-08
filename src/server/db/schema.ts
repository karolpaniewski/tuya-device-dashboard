// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { sql } from "drizzle-orm";
import { index, sqliteTableCreator } from "drizzle-orm/sqlite-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = sqliteTableCreator(
	(name) => `.bootstrap-scaffold_${name}`,
);

export const posts = createTable(
	"post",
	(d) => ({
		id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		name: d.text({ length: 256 }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [index("name_idx").on(t.name)],
);

export const users = createTable(
	"user",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		email: d.text({ length: 255 }).notNull().unique(),
		passwordHash: d.text({ length: 255 }).notNull(),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [index("user_email_idx").on(t.email)],
);
