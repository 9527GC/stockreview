export const getHistoryCycleKey = (record) => record?.cycleId || record?.symbol || '';

export const selectHistoryCycleGroups = (groups, cycleId) => (
  Array.isArray(groups) ? groups.filter(group => group.groupId === cycleId) : []
);
