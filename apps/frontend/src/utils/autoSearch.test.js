import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAutoSearch } from './autoSearch';
afterEach(() => vi.useRealTimers());
describe('自动搜索', () => {
  it('连续输入合并为一次查询，清空立即恢复', () => {
    vi.useFakeTimers();
    const search = vi.fn();
    const auto = createAutoSearch(search);
    auto.schedule('h'); vi.advanceTimersByTime(200); auto.schedule('hnfz');
    vi.advanceTimersByTime(299); expect(search).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(search).toHaveBeenCalledTimes(1);
    auto.schedule(''); vi.advanceTimersByTime(0); expect(search).toHaveBeenCalledTimes(2);
  });
  it('手动查询及重置取消排队查询，离开页面不再发送', () => {
    vi.useFakeTimers();
    const search = vi.fn(); const auto = createAutoSearch(search);
    auto.schedule('hnfz'); auto.run(); vi.runAllTimers(); expect(search).toHaveBeenCalledTimes(1);
    auto.schedule(''); auto.run(); vi.runAllTimers(); expect(search).toHaveBeenCalledTimes(2);
    auto.schedule('other'); auto.cancel(); vi.runAllTimers(); expect(search).toHaveBeenCalledTimes(2);
  });
});