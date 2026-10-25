import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
vi.mock('@/api/index', () => ({
  getTradeReviews: vi.fn(), getAssetsSummary: vi.fn(), getHoldings: vi.fn(), getTransfers: vi.fn(),
  addTransfer: vi.fn(), addTrade: vi.fn(), updateTrade: vi.fn(), deleteTradeBySymbol: vi.fn(), deleteTradeById: vi.fn(),
  getMarketOverview: vi.fn(), getRealTimeQuote: vi.fn(), getCommissionPreference: vi.fn(), updateCommissionPreference: vi.fn(),
  getHistoryHoldingGroups: vi.fn(), batchGetHistoryHoldingGroups: vi.fn()
}));
import { getTradeReviews, getAssetsSummary, getHoldings } from '@/api/index';
import { useTradeStore } from './trade';
beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });
it('保留首字母原文及筛选条件，搜索只请求日志接口', async () => {
  getTradeReviews.mockResolvedValue({ list: [], total: 0 });
  const store = useTradeStore();
  await store.loadReviews({ symbol: 'hnfz', startDate: '2026-07-25', type: 'BUY', reviewStatus: 'pending' });
  expect(getTradeReviews).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'hnfz', startDate: '2026-07-25', type: 'BUY', reviewStatus: 'pending' }));
  expect(getAssetsSummary).not.toHaveBeenCalled(); expect(getHoldings).not.toHaveBeenCalled();
});
it('晚返回的旧请求不能覆盖清空后最新的结果或加载状态', async () => {
  let resolveOld, resolveNew;
  getTradeReviews.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }));
  const store = useTradeStore();
  const old = store.loadReviews({ symbol: 'hnfz' });
  const latest = store.loadReviews({ page: 1 });
  resolveNew({ list: [{ id: 'new', symbol: '01810.HK', name: '小米集团' }], total: 3 }); await latest;
  resolveOld({ list: [{ id: 'old', symbol: '002163.SZ' }], total: 1 }); await old;
  expect(store.trades[0].id).toBe('new'); expect(store.tradeReviewsPagination.total).toBe(3); expect(store.loading).toBe(false);
});