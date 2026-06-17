import { ConfigProvider, App } from 'antd'
import enUs from 'antd/locale/en_US'
import type { ReactNode } from 'react'
import { antdTheme } from '../config/antd-theme'

interface AntdProviderProps {
  children: ReactNode
}

/**
 * Provider for global Ant Design configuration.
 * Includes the custom theme, locale, and App component.
 * The App component is required for React 19 and to use the message/modal hooks.
 */
export function AntdProvider({ children }: AntdProviderProps) {
  return (
    <ConfigProvider
      theme={{
        ...antdTheme,
        cssVar: true,
      }}
      locale={enUs}
    >
      <App>
        {children}
      </App>
    </ConfigProvider>
  )
}
