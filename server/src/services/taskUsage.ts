import { prisma } from "../lib/prisma.js";

export async function taskHasResponses(taskId: string) {
  const [a, b, c] = await Promise.all([
    prisma.criticalSelection.count({ where: { taskId } }),
    prisma.criticalDifficulty.count({ where: { taskId } }),
    prisma.pathStep.count({ where: { taskId } }),
  ]);
  return a + b + c > 0;
}
