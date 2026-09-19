import { describe, expect, it, vi } from 'vitest'
import { createWechatLoginPoller } from './wechatLoginPolling'

describe('createWechatLoginPoller', () => {
  it('确认登录后保存结果并停止轮询', async () => {
    const timers = []
    const clearIntervalFn = vi.fn()
    const onConfirmed = vi.fn()
    const poller = createWechatLoginPoller({
      getStatus: vi.fn().mockResolvedValue({ status: 'confirmed', token: 'jwt' }),
      onConfirmed,
      onTerminal: vi.fn(),
      onNetworkError: vi.fn(),
      setIntervalFn: (callback) => { timers.push(callback); return 7 },
      clearIntervalFn
    })

    poller.start('qr-token')
    await timers[0]()

    expect(onConfirmed).toHaveBeenCalledWith({ status: 'confirmed', token: 'jwt' })
    expect(clearIntervalFn).toHaveBeenCalledWith(7)
  })

  it.each(['expired', 'failed'])('状态为 %s 时提示终态并停止轮询', async (status) => {
    const timers = []
    const onTerminal = vi.fn()
    const clearIntervalFn = vi.fn()
    const poller = createWechatLoginPoller({
      getStatus: vi.fn().mockResolvedValue({ status }),
      onConfirmed: vi.fn(),
      onTerminal,
      onNetworkError: vi.fn(),
      setIntervalFn: (callback) => { timers.push(callback); return 8 },
      clearIntervalFn
    })

    poller.start('qr-token')
    await timers[0]()

    expect(onTerminal).toHaveBeenCalledWith({ status })
    expect(clearIntervalFn).toHaveBeenCalledWith(8)
  })

  it('请求异常时报告网络错误并停止轮询', async () => {
    const timers = []
    const error = new Error('网络异常')
    const onNetworkError = vi.fn()
    const clearIntervalFn = vi.fn()
    const poller = createWechatLoginPoller({
      getStatus: vi.fn().mockRejectedValue(error),
      onConfirmed: vi.fn(),
      onTerminal: vi.fn(),
      onNetworkError,
      setIntervalFn: (callback) => { timers.push(callback); return 9 },
      clearIntervalFn
    })

    poller.start('qr-token')
    await timers[0]()

    expect(onNetworkError).toHaveBeenCalledWith(error)
    expect(clearIntervalFn).toHaveBeenCalledWith(9)
  })

  it('stop 会取消尚未结束的轮询', () => {
    const clearIntervalFn = vi.fn()
    const poller = createWechatLoginPoller({
      getStatus: vi.fn(), onConfirmed: vi.fn(), onTerminal: vi.fn(), onNetworkError: vi.fn(),
      setIntervalFn: () => 10, clearIntervalFn
    })

    poller.start('qr-token')
    poller.stop()

    expect(clearIntervalFn).toHaveBeenCalledWith(10)
  })
})
