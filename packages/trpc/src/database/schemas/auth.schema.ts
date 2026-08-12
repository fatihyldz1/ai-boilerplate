import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { authColumnNames, authTableNames } from "../../contracts/auth.ts";

export const user = pgTable(authTableNames.user, {
  id: text(authColumnNames.user.id).primaryKey(),
  name: text(authColumnNames.user.name).notNull(),
  email: text(authColumnNames.user.email).notNull().unique(),
  emailVerified: boolean(authColumnNames.user.emailVerified).default(false).notNull(),
  image: text(authColumnNames.user.image),
  createdAt: timestamp(authColumnNames.user.createdAt).defaultNow().notNull(),
  updatedAt: timestamp(authColumnNames.user.updatedAt).defaultNow().notNull(),
});

export const session = pgTable(
  authTableNames.session,
  {
    id: text(authColumnNames.session.id).primaryKey(),
    expiresAt: timestamp(authColumnNames.session.expiresAt).notNull(),
    token: text(authColumnNames.session.token).notNull().unique(),
    createdAt: timestamp(authColumnNames.session.createdAt).defaultNow().notNull(),
    updatedAt: timestamp(authColumnNames.session.updatedAt).defaultNow().notNull(),
    ipAddress: text(authColumnNames.session.ipAddress),
    userAgent: text(authColumnNames.session.userAgent),
    userId: text(authColumnNames.session.userId)
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  authTableNames.account,
  {
    id: text(authColumnNames.account.id).primaryKey(),
    accountId: text(authColumnNames.account.accountId).notNull(),
    providerId: text(authColumnNames.account.providerId).notNull(),
    userId: text(authColumnNames.account.userId)
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(authColumnNames.account.accessToken),
    refreshToken: text(authColumnNames.account.refreshToken),
    idToken: text(authColumnNames.account.idToken),
    accessTokenExpiresAt: timestamp(authColumnNames.account.accessTokenExpiresAt),
    refreshTokenExpiresAt: timestamp(authColumnNames.account.refreshTokenExpiresAt),
    scope: text(authColumnNames.account.scope),
    password: text(authColumnNames.account.password),
    createdAt: timestamp(authColumnNames.account.createdAt).defaultNow().notNull(),
    updatedAt: timestamp(authColumnNames.account.updatedAt).defaultNow().notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  authTableNames.verification,
  {
    id: text(authColumnNames.verification.id).primaryKey(),
    identifier: text(authColumnNames.verification.identifier).notNull(),
    value: text(authColumnNames.verification.value).notNull(),
    expiresAt: timestamp(authColumnNames.verification.expiresAt).notNull(),
    createdAt: timestamp(authColumnNames.verification.createdAt).defaultNow().notNull(),
    updatedAt: timestamp(authColumnNames.verification.updatedAt).defaultNow().notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
