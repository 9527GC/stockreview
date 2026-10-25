export const createAutoSearch = (search, delay = 300) => {
  let timer;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  const run = () => { cancel(); return search(); };
  const schedule = keyword => {
    cancel();
    timer = setTimeout(run, String(keyword || '').trim() ? delay : 0);
  };
  return { schedule, run, cancel };
};