import type { TestProject } from "vitest/node";
import { createTestDb, dropTestDb } from "./test-db";

const NAME = "expenses_vitest";

export default async function setup(project: TestProject) {
  if (process.env.SKIP_DB_TESTS === "1") return;
  const url = await createTestDb(NAME);
  project.provide("databaseUrl", url);
  return async () => dropTestDb(NAME);
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
