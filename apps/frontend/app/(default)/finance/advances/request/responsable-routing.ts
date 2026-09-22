export type AnticipoResponsibleOption = {
  id: string;
  nombre?: string;
  email?: string;
};

export function resolveAnticipoResponsible({
  currentUser,
  configuredBoss,
  selectedLeader,
  omitBossApproval,
}: {
  currentUser: AnticipoResponsibleOption;
  configuredBoss?: AnticipoResponsibleOption;
  selectedLeader?: AnticipoResponsibleOption;
  omitBossApproval: boolean;
}) {
  if (omitBossApproval) {
    return { responsible: currentUser, origin: "solicitante" as const };
  }

  const responsible = selectedLeader ?? currentUser;
  return {
    responsible,
    origin:
      configuredBoss && responsible.id === configuredBoss.id
        ? ("jefe_directo" as const)
        : ("manual" as const),
  };
}
