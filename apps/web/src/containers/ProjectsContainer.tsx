import { useState } from "react";
import { Projects } from "../components/Projects.tsx";
import { trpc } from "../lib/trpc.ts";

export function ProjectsContainer() {
  const projects = trpc.projects.list.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.projects.create.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const rename = trpc.projects.rename.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const remove = trpc.projects.delete.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const [error, setError] = useState<string | null>(null);
  async function mutate(operation: () => Promise<unknown>) {
    setError(null);
    try {
      await operation();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project operation failed.");
      return false;
    }
  }
  return (
    <Projects
      projects={projects.data ?? []}
      loading={projects.isLoading}
      busy={create.isPending || rename.isPending || remove.isPending}
      error={error ?? projects.error?.message ?? null}
      onCreate={(name) => mutate(() => create.mutateAsync({ name }))}
      onRename={(id, name) => mutate(() => rename.mutateAsync({ id, name }))}
      onDelete={(id) => mutate(() => remove.mutateAsync({ id }))}
    />
  );
}
