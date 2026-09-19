export const createWechatLoginPoller = ({
  getStatus,
  onConfirmed,
  onTerminal,
  onNetworkError,
  intervalMs = 1500,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
}) => {
  let timer = null
  let active = false
  let token = ''

  const stop = () => {
    active = false
    if (timer !== null) {
      clearIntervalFn(timer)
      timer = null
    }
  }

  const poll = async () => {
    if (!active) return
    try {
      const status = await getStatus(token)
      if (!active) return
      if (status?.status === 'confirmed') {
        stop()
        onConfirmed(status)
      } else if (status?.status === 'expired' || status?.status === 'failed') {
        stop()
        onTerminal(status)
      }
    } catch (error) {
      if (!active) return
      stop()
      onNetworkError(error)
    }
  }

  const start = (nextToken) => {
    stop()
    token = nextToken
    active = true
    timer = setIntervalFn(poll, intervalMs)
  }

  return { start, stop }
}
