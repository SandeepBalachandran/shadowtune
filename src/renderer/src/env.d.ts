import type { EvofoxApi } from '../../shared/api'

declare global {
  interface Window {
    evofox: EvofoxApi
  }
}

export {}
